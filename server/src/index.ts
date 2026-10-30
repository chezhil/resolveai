// HTTP + SSE API for the ResolveAI console.

import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Runtime } from "./core/runtime.js";
import { SCENARIOS } from "./sim/scenarios.js";
import { runGolden } from "./evals/golden.js";
import { runShadowReplay } from "./evals/shadow.js";
import { RULES } from "./policy/engine.js";
import { TOOLS } from "./tools/registry.js";
import { KB } from "./sim/kb.js";
import { sarvamEnabled, speak, transcribe } from "./voice/sarvam.js";

// In dev the console proxies /api to :8787 (PORT may belong to Vite); in production one process serves both on PORT.
const DEV = process.argv.includes("--dev");
const PORT = Number((DEV ? process.env.API_PORT : process.env.PORT) ?? 8787);
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

let rt = makeRuntime();
const clients = new Set<express.Response>();

function makeRuntime() {
  const r = new Runtime({ pacingMs: Number(process.env.PACING_MS ?? 450), brain: (process.env.BRAIN as any) ?? "auto" });
  const push = (type: string, data: unknown) => {
    const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(line);
  };
  let pending = false;
  r.on("update", () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      push("state", r.snapshot());
    }, 60);
  });
  r.on("trace", (e) => push("trace", e));
  r.on("message", (m) => push("message", m));
  r.on("world", (e) => e.type === "soundbox.announce" && push("soundbox", e.announcement));
  return r;
}

const wrap = (fn: (req: express.Request, res: express.Response) => unknown) => async (req: express.Request, res: express.Response) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

app.get("/api/health", (_q, s) => s.json({ ok: true, brain: rt.brainKind() }));

app.get("/api/stream", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write(`event: state\ndata: ${JSON.stringify(rt.snapshot())}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
  req.on("close", () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

app.get("/api/state", wrap(() => rt.snapshot()));
app.get("/api/cases/:id", wrap((q) => rt.caseDetail(String(q.params.id)) ?? Promise.reject(new Error("Not found"))));
app.get("/api/meta", wrap(() => ({
  scenarios: SCENARIOS.map(({ run, ...s }) => s),
  rules: RULES,
  tools: TOOLS.map((t) => ({ name: t.name, kind: t.kind, description: t.description })),
  kb: KB,
  voice: { sarvam: sarvamEnabled() },
})));

app.post("/api/inbound", wrap((q) => {
  const { merchantId, text, channel } = q.body ?? {};
  if (!merchantId || !text) throw new Error("merchantId and text are required");
  return { caseId: rt.inbound(merchantId, String(text).slice(0, 2000), channel ?? "whatsapp").id };
}));

app.post("/api/scenarios/:id", wrap((q) => {
  const s = SCENARIOS.find((x) => x.id === q.params.id);
  if (!s) throw new Error("Unknown scenario");
  s.run(rt);
  return { ok: true };
}));

app.post("/api/approvals/:id", wrap((q) => rt.decideApproval(String(q.params.id), q.body?.decision === "REJECTED" ? "REJECTED" : "APPROVED", q.body?.by ?? "ops-lead")));
app.post("/api/clock/advance", wrap((q) => {
  rt.advance(Math.max(1, Math.min(Number(q.body?.minutes ?? 10), 60 * 24 * 7)));
  return { now: rt.world.now() };
}));
app.post("/api/config", wrap((q) => {
  const { shadow, brain, chaosModelOutage } = q.body ?? {};
  rt.setConfig({
    ...(shadow !== undefined && { shadow: !!shadow }),
    ...(brain && { brain }),
    ...(chaosModelOutage !== undefined && { chaosModelOutage: !!chaosModelOutage }),
  });
  return rt.config;
}));
app.post("/api/reset", wrap(() => {
  const keep = { ...rt.config };
  rt.removeAllListeners();
  rt = makeRuntime();
  rt.setConfig({ shadow: keep.shadow, brain: keep.brain, chaosModelOutage: false });
  for (const c of clients) c.write(`event: state\ndata: ${JSON.stringify(rt.snapshot())}\n\n`);
  return { ok: true };
}));
app.post("/api/events/stuck-payment", wrap((q) => {
  const t = rt.world.injectStuckPayment(q.body?.merchantId ?? "M1005", Number(q.body?.amount ?? 2350));
  return { txnId: t.txnId, rrn: t.rrn };
}));

app.get("/api/audit", wrap(() => ({ entries: rt.audit.list(), verify: rt.audit.verify() })));
app.post("/api/audit/verify", wrap(() => rt.audit.verify()));
app.post("/api/audit/tamper", wrap((q) => ({ tampered: rt.audit.tamper(Number(q.body?.seq ?? 2)), verify: rt.audit.verify() })));

app.post("/api/evals/run", wrap(async (q) => {
  const brain = q.body?.brain === "llm" ? "llm" : "planner";
  const [golden, shadow] = await Promise.all([runGolden({ brain }), runShadowReplay()]);
  return { brain, golden, shadow };
}));

app.post("/api/voice/transcribe", express.raw({ type: ["audio/*", "application/octet-stream"], limit: "10mb" }), wrap(async (q) => {
  if (!sarvamEnabled()) throw new Error("Set SARVAM_API_KEY to enable server-side ASR");
  return transcribe(q.body as Buffer, String(q.headers["content-type"] ?? "audio/webm"), String(q.query.lang ?? ""));
}));
app.post("/api/voice/tts", wrap(async (q) => {
  if (!sarvamEnabled()) throw new Error("Set SARVAM_API_KEY to enable server-side TTS");
  return speak(String(q.body?.text ?? ""), String(q.body?.lang ?? "en"));
}));

// Serve the built console in production.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_q, s) => s.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`ResolveAI server on http://localhost:${PORT} · brain: ${rt.brainKind()}${sarvamEnabled() ? " · Sarvam voice on" : ""}`);
});
