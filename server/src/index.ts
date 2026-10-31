// HTTP + SSE API for the ResolveAI console.
// Each visitor works in an isolated room (?room= / x-room header); see rooms.ts.

import "./env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { ZodError } from "zod";
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
import { SARVAM_LANGS, sarvamEnabled, sarvamModels, speak, transcribe, translate } from "./voice/sarvam.js";
import { connectors } from "./integrations/registry.js";
import { handleMcp } from "./mcp/handler.js";
import { cleanRoomId, getRoom, onAgentMessage, resetRoom, roomCount, type Room } from "./rooms.js";
import { archive } from "./core/archive.js";
import { ClientError } from "./core/errors.js";
import { ApproverAuth } from "./core/approvers.js";
import { ApprovalBody, TranslateBody, ClockBody, ConfigBody, CsatBody, InboundBody, StuckPaymentBody, parseBody } from "./http/schemas.js";
import { WHATSAPP_ROOM, handleInbound, outbound, whatsappEnabled } from "./channels/whatsapp.js";

// In dev the console proxies /api to :8787 (PORT may belong to Vite); in production one process serves both on PORT.
const DEV = process.argv.includes("--dev");
const PORT = Number((DEV ? process.env.API_PORT : process.env.PORT) ?? 8787);
const app = express();
// Trust exactly one proxy hop (Railway/Render edge). `true` would trust any client-supplied
// X-Forwarded-For and let callers rotate it to dodge the per-IP limits below.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        mediaSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "256kb" }));

const approvers = ApproverAuth.fromEnv();

onAgentMessage(outbound);

const roomOf = (req: express.Request): Room => getRoom(cleanRoomId(req.header("x-room") ?? req.query.room));

const wrap = (fn: (req: express.Request, room: Room) => unknown) => async (req: express.Request, res: express.Response) => {
  try {
    const out = await fn(req, roomOf(req));
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (e) {
    sendError(req, res, e);
  }
};

// Validation and policy errors keep their message; anything unexpected becomes a generic 500.
function sendError(req: express.Request, res: express.Response, e: unknown) {
  if (res.headersSent) return;
  if (e instanceof ZodError) {
    const issues = e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`);
    res.status(400).json({ error: `Invalid request: ${issues.join("; ")}` });
    return;
  }
  if (e instanceof ClientError) {
    res.status(e.status).json({ error: e.message });
    return;
  }
  console.error(`[api] ${req.method} ${req.path} failed:`, e);
  res.status(500).json({ error: "Internal server error" });
}

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
// Approvals get their own tight bucket so PINs can't be brute-forced at the general write rate.
app.post("/api/approvals/:id", limiter(Number(process.env.APPROVAL_RATE_PER_MIN ?? 10), "approvals"));
app.post(/^\/api\/(?!channels).*/, limiter(Number(process.env.WRITE_RATE_PER_MIN ?? 120), "write"));

// Evals spin up many worlds; keep one run at a time per process.
let evalRun: Promise<unknown> | null = null;

app.get("/api/health", (_q, s) => s.json({ ok: true, rooms: roomCount(), providers: configuredProviders().map((p) => p.name) }));

// Cap open SSE streams per IP (a venue NAT can put many judges behind one address, so keep it generous).
const MAX_STREAMS_PER_IP = Number(process.env.MAX_STREAMS_PER_IP ?? 30);
const streamsByIp = new Map<string, number>();

app.get("/api/stream", (req, res) => {
  const ip = req.ip ?? "unknown";
  const open = streamsByIp.get(ip) ?? 0;
  if (open >= MAX_STREAMS_PER_IP) {
    res.set("Retry-After", "30").status(429).json({ error: "Too many open live streams from this address" });
    return;
  }
  streamsByIp.set(ip, open + 1);
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
    const left = (streamsByIp.get(ip) ?? 1) - 1;
    if (left > 0) streamsByIp.set(ip, left);
    else streamsByIp.delete(ip);
  });
});

app.get("/api/state", wrap((_q, { rt }) => rt.snapshot()));
app.get("/api/cases/:id", wrap((q, { rt }) => rt.caseDetail(String(q.params.id)) ?? Promise.reject(new ClientError("Not found", 404))));
app.get("/api/meta", wrap(() => ({
  scenarios: SCENARIOS.map(({ run, ...s }) => s),
  rules: RULES,
  tools: TOOLS.map((t) => ({ name: t.name, kind: t.kind, description: t.description })),
  kb: KB,
  voice: { sarvam: sarvamEnabled() },
  approvals: { pinRequired: approvers.enforced, approvers: approvers.approvers },
  whatsapp: { enabled: whatsappEnabled(), room: WHATSAPP_ROOM, number: process.env.TWILIO_WHATSAPP_FROM?.replace("whatsapp:", "") ?? null, joinCode: process.env.TWILIO_SANDBOX_JOIN ?? null },
})));

app.post("/api/inbound", wrap((q, { rt }) => {
  const { merchantId, text, channel } = parseBody(InboundBody, q.body);
  return { caseId: rt.inbound(merchantId, text.slice(0, 2000), channel).id };
}));

app.post("/api/scenarios/:id", wrap((q, { rt }) => {
  const s = SCENARIOS.find((x) => x.id === q.params.id);
  if (!s) throw new ClientError("Unknown scenario", 404);
  s.run(rt);
  return { ok: true };
}));

// The approver comes from the PIN when PINs are configured; `by` in the body is only used when
// approver identity is simulated (no PINs set).
app.post("/api/approvals/:id", wrap((q, { rt }) => {
  const { decision, by, pin } = parseBody(ApprovalBody, q.body);
  const who = approvers.resolve({ by, pin });
  return { ...rt.decideApproval(String(q.params.id), decision, who.by), identitySimulated: who.simulated };
}));
app.post("/api/cases/:id/csat", wrap((q, { rt }) => rt.rate(String(q.params.id), parseBody(CsatBody, q.body).score)));
app.post("/api/clock/advance", wrap((q, { rt }) => {
  rt.advance(parseBody(ClockBody, q.body).minutes);
  return { now: rt.world.now() };
}));
app.post("/api/config", wrap((q, { rt }) => {
  const { shadow, brain, chaosModelOutage } = parseBody(ConfigBody, q.body);
  rt.setConfig({
    ...(shadow !== undefined && { shadow }),
    ...(brain !== undefined && { brain }),
    ...(chaosModelOutage !== undefined && { chaosModelOutage }),
  });
  return rt.config;
}));
app.post("/api/reset", wrap((_q, room) => {
  resetRoom(room);
  return { ok: true };
}));
app.post("/api/events/stuck-payment", wrap((q, { rt }) => {
  const { merchantId, amount } = parseBody(StuckPaymentBody, q.body);
  if (!rt.world.merchants.has(merchantId)) throw new ClientError(`Unknown merchant ${merchantId}`, 404);
  const t = rt.world.injectStuckPayment(merchantId, amount);
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
  if (brain === "llm" && !configuredProviders().length) throw new ClientError("Set GROQ_API_KEY or GEMINI_API_KEY to run the LLM evals");
  if (evalRun) throw new ClientError("An eval run is already in progress; try again in a moment", 409);
  evalRun = Promise.all([runGolden({ brain }), runShadowReplay()]);
  try {
    const [golden, shadow] = (await evalRun) as [Awaited<ReturnType<typeof runGolden>>, Awaited<ReturnType<typeof runShadowReplay>>];
    return { brain, golden, shadow };
  } finally {
    evalRun = null;
  }
}));

app.post("/api/voice/transcribe", express.raw({ type: ["audio/*", "application/octet-stream"], limit: "10mb" }), wrap(async (q) => {
  if (!sarvamEnabled()) throw new ClientError("Set SARVAM_API_KEY to enable server-side ASR", 501);
  return transcribe(q.body as Buffer, String(q.headers["content-type"] ?? "audio/webm"), String(q.query.lang ?? ""));
}));
app.post("/api/voice/tts", wrap(async (q) => {
  if (!sarvamEnabled()) throw new ClientError("Set SARVAM_API_KEY to enable server-side TTS", 501);
  return speak(String(q.body?.text ?? ""), String(q.body?.lang ?? "en"));
}));

app.post("/api/translate", wrap(async (q) => {
  if (!sarvamEnabled()) throw new ClientError("Set SARVAM_API_KEY to enable translation", 501);
  const { text, from, to } = parseBody(TranslateBody, q.body);
  return translate(text, from, to);
}));

app.get("/api/integrations", wrap((q) => ({
  connectors: connectors(process.env.PUBLIC_URL ?? `${q.protocol}://${q.get("host")}`),
  languages: Object.entries(SARVAM_LANGS).map(([id, v]) => ({ id, ...v })),
  sarvam: { enabled: sarvamEnabled(), models: sarvamModels() },
})));

// MCP over Streamable HTTP (JSON responses). Optional bearer token via MCP_TOKEN; each caller gets
// its own room through x-room, so remote clients never share state with the live demo.
app.post("/mcp", limiter(Number(process.env.MCP_RATE_PER_MIN ?? 60), "mcp"), async (req, res) => {
  const token = process.env.MCP_TOKEN;
  if (token && req.header("authorization") !== `Bearer ${token}`) {
    res.status(401).json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } });
    return;
  }
  const room = getRoom(cleanRoomId(`mcp-${req.header("x-room") ?? "shared"}`));
  const batch: unknown[] = Array.isArray(req.body) ? req.body : [req.body];
  const out = (await Promise.all(batch.map((m) => handleMcp((m ?? {}) as never, room)))).filter(Boolean);
  if (!out.length) {
    res.status(202).end();
    return;
  }
  res.json(Array.isArray(req.body) ? out : out[0]);
});

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
    // SPA fallback: any non-/api GET (deep links like /approvals) gets the console shell.
  app.get(/^(?!\/api(\/|$)).*/, (_q, s) => s.sendFile(path.join(dist, "index.html")));
}

app.use("/api", (_q, s) => s.status(404).json({ error: "Not found" }));

// Body-parser and other middleware errors: keep 4xx (bad JSON, too large), hide everything else.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (err as { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: status === 413 ? "Request body too large" : "Malformed request" });
    return;
  }
  sendError(req, res, err);
});

app.listen(PORT, () => {
  const p = configuredProviders().map((x) => x.name);
  console.log(
    `ResolveAI server on http://localhost:${PORT} · brain: ${p.length ? p.join(" → ") : "offline planner"}${sarvamEnabled() ? " · Sarvam voice" : ""}${whatsappEnabled() ? ` · WhatsApp → room "${WHATSAPP_ROOM}"` : ""}`,
  );
});
