// Types mirrored from the server and a tiny client.

export type Lang = "kn" | "hi" | "en";
export type Level = "L0" | "L1" | "L2" | "L3";
export type Stage = "HEAR" | "PLAN" | "CHECK" | "ACT" | "VERIFY" | "EVENT" | "HANDOFF";
export type CaseStatus = "OPEN" | "IN_PROGRESS" | "AWAITING_APPROVAL" | "WATCHING" | "ESCALATED" | "RESOLVED" | "FAILED_SAFE";

export interface PolicyDecision {
  verdict: "ALLOW" | "NEEDS_APPROVAL" | "BLOCK" | "ESCALATE" | "SHADOW";
  level: Level;
  rules: string[];
  reasons: string[];
}

export interface TraceEvent {
  id: string;
  caseId: string;
  stage: Stage;
  simTs: number;
  tPlus: number;
  title: string;
  detail?: string;
  level?: Level;
  tool?: string;
  input?: unknown;
  output?: unknown;
  decision?: PolicyDecision;
  ms?: number;
}

export interface Fact {
  key: string;
  value: unknown;
  source: string;
  at: number;
}

export interface CaseFile {
  rootCause: string;
  stepsTaken: string[];
  evidence: { label: string; value: string; source: string }[];
  recommendedAction: string;
  reason: string;
  severity: "low" | "medium" | "high";
}

export interface Case {
  id: string;
  merchantId: string;
  channel: string;
  lang: Lang;
  workflow: string;
  status: CaseStatus;
  maxLevel: Level;
  proactive: boolean;
  openedAt: number;
  closedAt?: number;
  inbound: string;
  inboundRedacted: string;
  facts: Record<string, Fact>;
  actions: { tool: string; input: unknown; level: Level; verdict: PolicyDecision["verdict"]; at: number }[];
  summary?: string;
  rootCause?: string;
  caseFile?: CaseFile;
  brain: "llm" | "planner";
  shadow: boolean;
  steps: number;
  csat?: number;
  timing: { computeMs: number; firstActionMs?: number };
  pii?: { items: number; cipher: string; shredded: boolean };
  tat?: { rule: string; deadlineAt: number; state: "met" | "running" | "breached"; penaltyPerDay: number; hoursLeft: number };
}

export interface Approval {
  id: string;
  caseId: string;
  tool: string;
  input: Record<string, unknown>;
  amount?: number;
  summary: string;
  rationale: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "QUARANTINED";
  dependsOn?: { ref: string; kind: "txn" | "settlement"; label: string; fingerprint: string }[];
  quarantine?: { at: number; reason: string; changed: { ref: string; label: string; was: string; now: string }[] };
  required: number;
  approvals: { by: string; at: number }[];
  createdAt: number;
  decidedAt?: number;
  decidedBy?: string;
}

export interface Watcher {
  id: string;
  caseId: string;
  kind: string;
  ref: string;
  deadline: number;
  status: "ACTIVE" | "FIRED" | "BREACHED" | "CANCELLED";
}

export interface ChatMessage {
  id: string;
  caseId: string;
  from: "merchant" | "payer" | "agent" | "human";
  to?: "merchant" | "payer";
  lang: Lang;
  text: string;
  gloss?: string;
  simTs: number;
  channel: string;
}

export interface Announcement {
  soundboxId: string;
  merchantId: string;
  text: string;
  amount: number;
  ts: number;
}

export interface Merchant {
  id: string;
  owner: string;
  business: string;
  area: string;
  lang: Lang;
  soundboxId: string;
}

export interface Metrics {
  cases: number;
  resolved: number;
  autoResolved: number;
  autoResolveRate: number;
  escalated: number;
  awaitingApproval: number;
  watching: number;
  proactive: number;
  medianMinutesToResolve: number | null;
  missedDisputeDeadlines: number;
  proactiveUpdatesSent: number;
  csat: number | null;
  latency: { firstActionP50: number | null; firstActionP95: number | null; modelCallP50: number | null; modelCallP95: number | null };
  security: {
    rateLimited: number;
    anomalies: number;
    shredded: number;
    capabilitiesIssued: number;
    capabilitiesRejected: number;
    anchors: number;
  };
}

export interface Snapshot {
  now: number;
  nowLabel: string;
  config: { brain: "auto" | "planner" | "llm"; shadow: boolean; chaosModelOutage: boolean; pacingMs: number; stuckAfterMin: number };
  brain: "llm" | "planner";
  providers: string[];
  cases: Case[];
  approvals: Approval[];
  watchers: Watcher[];
  messages: ChatMessage[];
  announcements: Announcement[];
  merchants: Merchant[];
  upcoming: { at: number; label: string }[];
  metrics: Metrics;
}

export interface Scenario {
  id: string;
  tag: string;
  title: string;
  persona: string;
  merchantId: string;
  channel: string;
  text: string;
  voice?: boolean;
  expect: string;
}

export interface Meta {
  scenarios: Scenario[];
  rules: Record<string, string>;
  tools: { name: string; kind: string; description: string }[];
  kb: { id: string; source: string; title: string; text: string }[];
  voice: { sarvam: boolean };
  /** pinRequired: approvers sign with a PIN checked on the server; otherwise identity is simulated. */
  approvals?: { pinRequired: boolean; approvers: string[] };
  whatsapp: { enabled: boolean; room: string; number: string | null; joinCode: string | null };
}

export interface AuditEntry {
  seq: number;
  ts: number;
  caseId: string | null;
  actor: string;
  type: string;
  payload: unknown;
  prevHash: string;
  hash: string;
}

/** Each browser tab works in its own isolated room unless ?room= is given (e.g. ?room=whatsapp). */
export const ROOM: string = (() => {
  const fromUrl = new URLSearchParams(location.search).get("room");
  if (fromUrl) return fromUrl;
  try {
    const saved = sessionStorage.getItem("resolveai-room");
    if (saved) return saved;
    const id = `r-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem("resolveai-room", id);
    return id;
  } catch {
    return `r-${Math.random().toString(36).slice(2, 10)}`;
  }
})();

export async function api<T = unknown>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "x-room": ROOM, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? res.statusText);
  return j as T;
}

export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

export const fmtClock = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });

export function fmtTPlus(s: number) {
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  if (s < 86400) return `+${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
  return `T+${Math.round(s / 86400)}`;
}

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export const fmtMs = (ms?: number | null) => (ms == null ? "—" : ms < 1 ? `${Math.round(ms * 1000)} µs` : ms < 1000 ? `${ms.toFixed(ms < 10 ? 1 : 0)} ms` : `${(ms / 1000).toFixed(1)} s`);
