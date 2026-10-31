// Analytics data layer: one shared, cached eval report and the pure functions that turn it (and the live session) into chart inputs.
// Nothing here invents a number. Every figure is computed from /api/evals/run (golden suite + shadow replay) or from the session snapshot.

import { useCallback, useEffect, useState } from "react";
import type { Case, Snapshot } from "./api";
import { api } from "./api";

export interface GoldenCheck {
  name: string;
  pass: boolean;
  detail?: string;
}
export interface GoldenResult {
  id: string;
  title: string;
  category: string;
  pass: boolean;
  checks: GoldenCheck[];
  status?: string;
  maxLevel?: "L0" | "L1" | "L2" | "L3";
  toolCalls: string[];
  ms: number;
}
export interface ShadowRow {
  id: string;
  workflow: string;
  humanAction: string;
  gold: string;
  agentProposed: string[];
  agrees: boolean;
  correct: boolean;
  humanCorrect: boolean;
  note?: string;
  humanMinutes: number;
  agentSeconds: number;
  humanContacts: number;
  agentContacts: number;
}
export interface EvalReport {
  brain: string;
  generatedAt?: string;
  policyRules?: number;
  golden: GoldenResult[];
  shadow: { rows: ShadowRow[]; agreement: number; agentCorrect: number; humanCorrect: number; medianHumanMinutes: number; contactsAvoided: number };
}

// ---- one shared fetch: the Analytics page and any other view reuse the same run instead of repeating a multi-second suite ----

let cache: EvalReport | null = null;
let inflight: Promise<EvalReport> | null = null;

export function loadEvalReport(force = false): Promise<EvalReport> {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight) return inflight;
  // First load reads the server's shared, cached run; "Re-run" (force) asks for a fresh one.
  inflight = (force ? api<EvalReport>("/evals/run", { brain: "planner" }) : api<EvalReport>("/proof"))
    .then((r) => (cache = r))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useEvalReport() {
  const [data, setData] = useState<EvalReport | null>(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState("");
  const load = useCallback((force = false) => {
    setLoading(true);
    setError("");
    loadEvalReport(force)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!cache) load();
  }, [load]);
  return { data, loading, error, reload: () => load(true) };
}

// ---- helpers ----

export const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** "36 h", "45 min", "18 s": the unit a person would say out loud. */
export function humanDuration(minutes: number): string {
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} s`;
  if (minutes < 90) return `${Math.round(minutes)} min`;
  if (minutes < 60 * 48) return `${(minutes / 60).toFixed(minutes < 600 ? 1 : 0)} h`;
  return `${(minutes / 1440).toFixed(1)} days`;
}

export const WORKFLOW_LABEL: Record<string, string> = {
  failed_payment: "Failed payment",
  settlement_hold: "Settlement hold",
  dispute: "Chargeback",
  account_change: "Payout account change",
  duplicate_debit: "Duplicate debit",
  unknown: "Unclear / angry",
};

export const ACTION_LABEL: Record<string, string> = {
  raise_bank_ticket: "raised a bank ticket",
  release_settlement_hold: "released the settlement hold",
  file_dispute_evidence: "filed dispute evidence",
  escalate_to_human: "escalated with a case file",
  update_payout_account: "changed the payout account",
  initiate_refund: "refunded the payer",
};

// ---- proof: what the replay and the golden suite say ----

export interface ProofSummary {
  tickets: number;
  agentCorrect: number;
  humanCorrect: number;
  medianHumanMinutes: number;
  medianAgentMinutes: number;
  speedup: number;
  contactsAvoided: number;
  humanContactsTotal: number;
  humanErrors: ShadowRow[];
  goldenTotal: number;
  goldenPassed: number;
  redTeamTotal: number;
  redTeamPassed: number;
  checksTotal: number;
  checksPassed: number;
}

export function summarise(r: EvalReport): ProofSummary {
  const rows = r.shadow.rows;
  const medH = median(rows.map((x) => x.humanMinutes));
  const medA = median(rows.map((x) => x.agentSeconds)) / 60;
  const red = r.golden.filter((g) => g.category === "red-team");
  const checks = r.golden.flatMap((g) => g.checks);
  return {
    tickets: rows.length,
    agentCorrect: rows.filter((x) => x.correct).length,
    humanCorrect: rows.filter((x) => x.humanCorrect).length,
    medianHumanMinutes: medH,
    medianAgentMinutes: medA,
    speedup: medA > 0 ? Math.round(medH / medA) : 0,
    contactsAvoided: r.shadow.contactsAvoided,
    humanContactsTotal: rows.reduce((s, x) => s + x.humanContacts, 0),
    humanErrors: rows.filter((x) => !x.humanCorrect),
    goldenTotal: r.golden.length,
    goldenPassed: r.golden.filter((g) => g.pass).length,
    redTeamTotal: red.length,
    redTeamPassed: red.filter((g) => g.pass).length,
    checksTotal: checks.length,
    checksPassed: checks.filter((c) => c.pass).length,
  };
}

export interface WorkflowAccuracy {
  workflow: string;
  tickets: number;
  agent: number;
  human: number;
}

export function accuracyByWorkflow(rows: ShadowRow[]): WorkflowAccuracy[] {
  const by = new Map<string, ShadowRow[]>();
  for (const r of rows) by.set(r.workflow, [...(by.get(r.workflow) ?? []), r]);
  return [...by.entries()]
    .map(([workflow, rs]) => ({ workflow, tickets: rs.length, agent: rs.filter((x) => x.correct).length, human: rs.filter((x) => x.humanCorrect).length }))
    .sort((a, b) => b.tickets - a.tickets);
}

export const CATEGORY_LABEL: Record<string, string> = {
  workflow: "Core workflows",
  guardrail: "Guardrails",
  proactive: "Proactive detection",
  "red-team": "Red-team attacks",
  resilience: "Resilience (model outage)",
};

export interface CategoryResult {
  category: string;
  total: number;
  passed: number;
}

export function goldenByCategory(golden: GoldenResult[]): CategoryResult[] {
  const by = new Map<string, GoldenResult[]>();
  for (const g of golden) by.set(g.category, [...(by.get(g.category) ?? []), g]);
  const order = Object.keys(CATEGORY_LABEL);
  const rank = (c: string) => (order.includes(c) ? order.indexOf(c) : order.length);
  return [...by.entries()].map(([category, gs]) => ({ category, total: gs.length, passed: gs.filter((g) => g.pass).length })).sort((a, b) => rank(a.category) - rank(b.category));
}

/** Compute time per golden case (offline planner, pacing off): how fast the loop itself runs. */
export function goldenLatency(golden: GoldenResult[]) {
  const ms = golden.map((g) => g.ms).sort((a, b) => a - b);
  const at = (p: number) => (ms.length ? ms[Math.min(ms.length - 1, Math.max(0, Math.ceil((p / 100) * ms.length) - 1))] : 0);
  return { p50: at(50), p95: at(95), max: ms[ms.length - 1] ?? 0 };
}

// ---- this session: what the live console has actually done ----

export interface SessionStats {
  cases: number;
  status: Record<string, number>;
  workflows: { workflow: string; count: number }[];
  verdicts: Record<string, number>;
  levels: Record<string, number>;
  tat: { met: number; running: number; breached: number };
  autonomousPct: number;
  humanTouched: number;
  amountAwaitingApproval: number;
  amountApproved: number;
  csatAvg: number | null;
  proactive: number;
}

export function sessionStats(snap: Snapshot): SessionStats {
  const cases: Case[] = snap.cases;
  const status: Record<string, number> = {};
  const wf = new Map<string, number>();
  const verdicts: Record<string, number> = {};
  const levels: Record<string, number> = {};
  const tat = { met: 0, running: 0, breached: 0 };
  for (const c of cases) {
    status[c.status] = (status[c.status] ?? 0) + 1;
    wf.set(c.workflow, (wf.get(c.workflow) ?? 0) + 1);
    if (c.tat) tat[c.tat.state] += 1;
    for (const a of c.actions) {
      verdicts[a.verdict] = (verdicts[a.verdict] ?? 0) + 1;
      levels[a.level] = (levels[a.level] ?? 0) + 1;
    }
  }
  const approvedStates = snap.approvals.filter((a) => a.status === "APPROVED");
  const pending = snap.approvals.filter((a) => a.status === "PENDING");
  const sum = (xs: { amount?: number }[]) => xs.reduce((s, a) => s + (a.amount ?? 0), 0);
  const csat = cases.map((c) => c.csat).filter((x): x is number => typeof x === "number");
  const humanTouched = (status.ESCALATED ?? 0) + (status.AWAITING_APPROVAL ?? 0) + (status.FAILED_SAFE ?? 0) + snap.approvals.filter((a) => a.status !== "PENDING").length;
  return {
    cases: cases.length,
    status,
    workflows: [...wf.entries()].map(([workflow, count]) => ({ workflow, count })).sort((a, b) => b.count - a.count),
    verdicts,
    levels,
    tat,
    autonomousPct: cases.length ? pct(snap.metrics.autoResolved, cases.length) : 0,
    humanTouched,
    amountAwaitingApproval: sum(pending),
    amountApproved: sum(approvedStates),
    csatAvg: csat.length ? csat.reduce((s, x) => s + x, 0) / csat.length : null,
    proactive: snap.metrics.proactive,
  };
}
