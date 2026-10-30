// HTTP + SSE API for the ResolveAI console.
// Each visitor works in an isolated room (?room= / x-room header); see rooms.ts.

import "./env.js";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { SCENARIOS } from "./sim/scenarios.js";
import { runGolden } from "./evals/golden.js";
import { runShadowReplay } from "./evals/shadow.js";
import { RULES } from "./policy/engine.js";
import { TOOLS } from "./tools/registry.js";
import { KB } from "./sim/kb.js";
import { configuredProviders } from "./agent/llm.js";
import { sarvamEnabled, speak, transcribe } from "./voice/sarvam.js";
import { cleanRoomId, getRoom, onAgentMessage, resetRoom, roomCount, type Room } from "./rooms.js";
import { archive } from "./core/archive.js";
import { RateLimited } from "./core/runtime.js";
import { WHATSAPP_ROOM, handleInbound, outbound, whatsappEnabled } from "./channels/whatsapp.js";

// In dev the console proxies /api to :8787 (PORT may belong to Vite); in production one process serves both on PORT.
const DEV = process.argv.includes("--dev");
const PORT = Number((DEV ? process.env.API_PORT : process.env.PORT) ?? 8787);
const app = express();
app.set("trust proxy", true);
app.use(cors());
app.use(express.json({ limit: "2mb" }));

onAgentMessage(outbound);

const roomOf = (req: express.Request): Room => getRoom(cleanRoomId(req.header("x-room") ?? req.query.room));

const wrap = (fn: (req: express.Request, room: Room) => unknown) => async (req: express.Request, res: express.Response) => {
  try {
    const out = await fn(req, roomOf(req));
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (e) {
    res.status(e instanceof RateLimited ? 429 : 400).json({ error: (e as Error).message });
  }
};

// Per-IP token bucket for the public deploy: writes are capped, evals more tightly.
const buckets = new Map<string, { tokens: number; at: number }>();
function limiter(perMinute: number, scope: string): express.RequestHandler {
  return (req, res, next) => {
    const key = `${scope}:${req.ip}`;
    const now = Date.now();
    const b = buckets.get(key) ?? { tokens: perMinute, at: now };
    b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
    b.at = now;
    if (b.tokens < 1) {
      res.set("Retry-After", "10").status(429).json({ error: "Too many requests; slow down" });
      return;
    }
    b.tokens -= 1;
    buckets.set(key, b);
    next();
  };
}
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [k, b] of buckets) if (b.at < cutoff) buckets.delete(k);
}, 60_000).unref();
app.post("/api/evals/run", limiter(6, "evals"));
app.post(/^\/api\/(?!channels).*/, limiter(Number(process.env.WRITE_RATE_PER_MIN ?? 120), "write"));

// Evals spin up many worlds; keep one run at a time per process.
let evalRun: Promise<unknown> | null = null;

app.get("/api/health", (_q, s) => s.json({ ok: true, rooms: roomCount(), providers: configuredProviders().map((p) => p.name) }));

app.get("/api/stream", (req, res) => {
  const room = roomOf(req);
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write(`event: state\ndata: ${JSON.stringify(room.rt.snapshot())}\n\n`);
  room.clients.add(res);
  const ping = setInterval(() => {
    room.lastSeen = Date.now();
    res.write(": ping\n\n");
  }, 20_000);
  req.on("close", () => {
    clearInterval(ping);
    room.clients.delete(res);
  });
});

app.get("/api/state", wrap((_q, { rt }) => rt.snapshot()));
app.get("/api/cases/:id", wrap((q, { rt }) => rt.caseDetail(String(q.params.id)) ?? Promise.reject(new Error("Not found"))));
app.get("/api/meta", wrap(() => ({
  scenarios: SCENARIOS.map(({ run, ...s }) => s),
  rules: RULES,
  tools: TOOLS.map((t) => ({ name: t.name, kind: t.kind, description: t.description })),
  kb: KB,
  voice: { sarvam: sarvamEnabled() },
  whatsapp: { enabled: whatsappEnabled(), room: WHATSAPP_ROOM, number: process.env.TWILIO_WHATSAPP_FROM?.replace("whatsapp:", "") ?? null, joinCode: process.env.TWILIO_SANDBOX_JOIN ?? null },
})));

app.post("/api/inbound", wrap((q, { rt }) => {
  const { merchantId, text, channel } = q.body ?? {};
  if (!merchantId || !text) throw new Error("merchantId and text are required");
  return { caseId: rt.inbound(merchantId, String(text).slice(0, 2000), channel ?? "whatsapp").id };
}));

app.post("/api/scenarios/:id", wrap((q, { rt }) => {
  const s = SCENARIOS.find((x) => x.id === q.params.id);
  if (!s) throw new Error("Unknown scenario");
  s.run(rt);
  return { ok: true };
}));

app.post("/api/approvals/:id", wrap((q, { rt }) => rt.decideApproval(String(q.params.id), q.body?.decision === "REJECTED" ? "REJECTED" : "APPROVED", q.body?.by ?? "ops-lead")));
app.post("/api/cases/:id/csat", wrap((q, { rt }) => rt.rate(String(q.params.id), Number(q.body?.score))));
app.post("/api/clock/advance", wrap((q, { rt }) => {
  rt.advance(Math.max(1, Math.min(Number(q.body?.minutes ?? 10), 60 * 24 * 7)));
  return { now: rt.world.now() };
}));
app.post("/api/config", wrap((q, { rt }) => {
  const { shadow, brain, chaosModelOutage } = q.body ?? {};
  rt.setConfig({
    ...(shadow !== undefined && { shadow: !!shadow }),
    ...(["auto", "llm", "planner"].includes(brain) && { brain }),
    ...(chaosModelOutage !== undefined && { chaosModelOutage: !!chaosModelOutage }),
  });
  return rt.config;
}));
app.post("/api/reset", wrap((_q, room) => {
  resetRoom(room);
  return { ok: true };
}));
app.post("/api/events/stuck-payment", wrap((q, { rt }) => {
  const t = rt.world.injectStuckPayment(q.body?.merchantId ?? "M1005", Number(q.body?.amount ?? 2350));
  return { txnId: t.txnId, rrn: t.rrn };
}));

const auditView = (rt: Room["rt"]) => ({ entries: rt.audit.list(), verify: rt.audit.verify(), anchors: rt.anchors.anchors, anchorCheck: rt.anchors.check(rt.audit) });
app.get("/api/audit", wrap((_q, { rt }) => auditView(rt)));
app.post("/api/audit/verify", wrap((_q, { rt }) => auditView(rt)));
app.post("/api/audit/anchor", wrap((_q, { rt }) => {
  rt.anchors.anchorNow(rt.audit);
  return auditView(rt);
}));
app.post("/api/audit/tamper", wrap((q, { rt }) => {
  // "naive" edits one entry; "rewrite" re-hashes the rest of the chain so only the anchors catch it.
  if (q.body?.mode === "rewrite") rt.audit.rewriteConsistently(Number(q.body?.seq ?? 2));
  else rt.audit.tamper(Number(q.body?.seq ?? 2));
  return auditView(rt);
}));
app.get("/api/archive", wrap(async () => {
  await archive.ready;
  return archive.recent(Number(process.env.ARCHIVE_LIMIT ?? 50));
}));

app.post("/api/evals/run", wrap(async (q) => {
  const brain = q.body?.brain === "llm" ? "llm" : "planner";
  if (brain === "llm" && !configuredProviders().length) throw new Error("Set GROQ_API_KEY or GEMINI_API_KEY to run the LLM evals");
  if (evalRun) throw new Error("An eval run is already in progress; try again in a moment");
  evalRun = Promise.all([runGolden({ brain }), runShadowReplay()]);
  try {
    const [golden, shadow] = (await evalRun) as [Awaited<ReturnType<typeof runGolden>>, Awaited<ReturnType<typeof runShadowReplay>>];
    return { brain, golden, shadow };
  } finally {
    evalRun = null;
  }
}));

app.post("/api/voice/transcribe", express.raw({ type: ["audio/*", "application/octet-stream"], limit: "10mb" }), wrap(async (q) => {
  if (!sarvamEnabled()) throw new Error("Set SARVAM_API_KEY to enable server-side ASR");
  return transcribe(q.body as Buffer, String(q.headers["content-type"] ?? "audio/webm"), String(q.query.lang ?? ""));
}));
app.post("/api/voice/tts", wrap(async (q) => {
  if (!sarvamEnabled()) throw new Error("Set SARVAM_API_KEY to enable server-side TTS");
  return speak(String(q.body?.text ?? ""), String(q.body?.lang ?? "en"));
}));

app.post("/api/channels/whatsapp/twilio", express.urlencoded({ extended: false }), (req, res) => {
  handleInbound(req, res).catch((e) => {
    console.warn(`[whatsapp] ${e.message}`);
    if (!res.headersSent) res.type("text/xml").send("<Response></Response>");
  });
});

// Serve the built console in production.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_q, s) => s.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  const p = configuredProviders().map((x) => x.name);
  console.log(
    `ResolveAI server on http://localhost:${PORT} · brain: ${p.length ? p.join(" → ") : "offline planner"}${sarvamEnabled() ? " · Sarvam voice" : ""}${whatsappEnabled() ? ` · WhatsApp → room "${WHATSAPP_ROOM}"` : ""}`,
  );
});
