// Shared domain types for the ResolveAI runtime.

export type Lang = "kn" | "hi" | "en";
export type Channel = "whatsapp" | "in-app" | "ivr" | "soundbox" | "event";
export type Level = "L0" | "L1" | "L2" | "L3";
export type Workflow = "failed_payment" | "settlement_hold" | "dispute" | "account_change" | "unknown";

export type CaseStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "AWAITING_APPROVAL"
  | "WATCHING"
  | "ESCALATED"
  | "RESOLVED"
  | "FAILED_SAFE";

export type Stage = "HEAR" | "PLAN" | "CHECK" | "ACT" | "VERIFY" | "EVENT" | "HANDOFF";

export interface TraceEvent {
  id: string;
  caseId: string;
  stage: Stage;
  /** Simulated clock, ms since epoch. */
  simTs: number;
  /** Seconds since case opened (sim clock), for the "0:03" style timeline. */
  tPlus: number;
  title: string;
  detail?: string;
  level?: Level;
  tool?: string;
  input?: unknown;
  output?: unknown;
  decision?: PolicyDecision;
  /** Compute time for this step (model call, policy check or tool), excluding demo pacing. */
  ms?: number;
}

export interface PolicyDecision {
  verdict: "ALLOW" | "NEEDS_APPROVAL" | "BLOCK" | "ESCALATE" | "SHADOW";
  level: Level;
  rules: string[];
  reasons: string[];
}

export interface Fact {
  key: string;
  value: unknown;
  /** Which tool call established this fact — the model's claims never become facts. */
  source: string;
  at: number;
}

export interface Approval {
  id: string;
  caseId: string;
  tool: string;
  input: Record<string, unknown>;
  amount?: number;
  summary: string;
  rationale: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  /** Distinct human approvers needed (two-person rule above the threshold). */
  required: number;
  approvals: { by: string; at: number }[];
  createdAt: number;
  decidedAt?: number;
  decidedBy?: string;
  toolUseId?: string;
}

export interface Watcher {
  id: string;
  caseId: string;
  kind: "TXN_CREDIT" | "SETTLEMENT" | "DISPUTE";
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
  channel: Channel;
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
  channel: Channel;
  lang: Lang;
  workflow: Workflow;
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
  /** Compute time spent on the case, and how long until the first action was proposed. */
  timing: { computeMs: number; firstActionMs?: number };
  pii?: { items: number; cipher: string; shredded: boolean };
}
