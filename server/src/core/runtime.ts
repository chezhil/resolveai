// The ResolveAI runtime: owns cases and runs the HEAR → PLAN → CHECK → ACT → VERIFY loop.
// Underneath every step: event stream, case memory, approval queue, watchers and the audit log.

import { EventEmitter } from "node:events";
import type {
  Approval,
  Case,
  CaseFile,
  Channel,
  ChatMessage,
  Lang,
  Level,
  PolicyDecision,
  Stage,
  TraceEvent,
  Watcher,
} from "./types.js";
import { World, HOUR, MIN, fmtIST, type WorldEvent } from "../sim/world.js";
import { AuditLog } from "./audit.js";
import { PiiVault } from "./pii.js";
import { DEFAULT_POLICY, evaluate, type PolicyConfig } from "../policy/engine.js";
import { TOOL_MAP, type ToolCtx } from "../tools/registry.js";
import type { Brain, ToolCall, ToolResult } from "../agent/brain.js";
import { ModelOutage } from "../agent/brain.js";
import { PlannerBrain } from "../agent/planner.js";
import { LlmBrain, configuredProviders, systemPrompt } from "../agent/llm.js";
import { triage, type Triage } from "../agent/triage.js";
import { detectLang, render, soundboxLine } from "../sim/lang.js";

export interface RuntimeConfig {
  brain: "auto" | "planner" | "llm";
  shadow: boolean;
  chaosModelOutage: boolean;
  /** Cosmetic delay between trace steps so the live console is watchable. 0 in evals. */
  pacingMs: number;
  /** Proactive detector threshold for a pending credit. */
  stuckAfterMin: number;
}

const LEVEL_RANK: Record<Level, number> = { L0: 0, L1: 1, L2: 2, L3: 3 };
const TERMINAL = new Set(["RESOLVED", "ESCALATED", "FAILED_SAFE"]);
const MAX_TURNS = 14;

export class Runtime extends EventEmitter {
  world = new World();
  audit = new AuditLog();
  policy: PolicyConfig = { ...DEFAULT_POLICY };
  config: RuntimeConfig;

  cases = new Map<string, Case>();
  traces = new Map<string, TraceEvent[]>();
  messages: ChatMessage[] = [];
  approvals = new Map<string, Approval>();
  watchers = new Map<string, Watcher>();

  private brains = new Map<string, Brain>();
  private vaults = new Map<string, PiiVault>();
  private triages = new Map<string, Triage>();
  private targets = new Map<string, { rrns: Set<string>; batches: Set<string>; disputes: Set<string> }>();
  private chains = new Map<string, Promise<void>>();
  private seq = 1;
  private caseSeq = 1;

  constructor(config: Partial<RuntimeConfig> = {}) {
    super();
    this.setMaxListeners(100);
    this.config = { brain: "auto", shadow: false, chaosModelOutage: false, pacingMs: 0, stuckAfterMin: 10, ...config };
    this.policy.shadow = this.config.shadow;
    this.world.on("world", (e: WorldEvent) => this.onWorld(e));
  }

  // ------------------------------------------------------------------ public API

  brainKind(): "llm" | "planner" {
    if (this.config.brain === "planner") return "planner";
    if (this.config.brain === "llm") return "llm";
    return configuredProviders().length ? "llm" : "planner";
  }

  triageOf(caseId: string) {
    return this.triages.get(caseId);
  }

  /** A merchant (or the event stream) reports a problem: open a case and start working it. */
  inbound(merchantId: string, text: string, channel: Channel = "whatsapp", opts: { proactive?: boolean } = {}) {
    const merchant = this.world.merchants.get(merchantId);
    if (!merchant) throw new Error(`Unknown merchant ${merchantId}`);

    // Repeat contact on an open case: attach to it instead of opening a duplicate.
    const open = [...this.cases.values()].find((c) => c.merchantId === merchantId && !TERMINAL.has(c.status));
    if (open && !opts.proactive) {
      this.recordMessage(open, { from: "merchant", lang: detectLang(text, merchant.lang), text, channel });
      const tri = triage(text, merchant.lang);
      if (tri.workflow === open.workflow || tri.workflow === "unknown") {
        this.trace(open, "HEAR", "Repeat contact attached to the open case", { detail: "Status already shared; no new case opened" });
        const vault = this.vaults.get(open.id)!;
        this.enqueue(open.id, async () => {
          this.brains.get(open.id)!.event(`Merchant sent a follow-up while the case is ${open.status}: "${vault.redact(text)}". Reply with the current status in their language; do not repeat actions already taken.`, { type: "FOLLOW_UP" });
          if (open.status !== "AWAITING_APPROVAL") open.status = "IN_PROGRESS";
          await this.drive(open);
        });
        return open;
      }
    }

    const tri = triage(text, merchant.lang);
    const vault = new PiiVault(new Set([...this.world.txns.values()].map((t) => t.rrn)));
    const id = `CASE-${String(this.caseSeq++).padStart(4, "0")}`;
    const kase: Case = {
      id,
      merchantId,
      channel,
      lang: opts.proactive ? merchant.lang : tri.lang,
      workflow: tri.workflow,
      status: "IN_PROGRESS",
      maxLevel: "L0",
      proactive: !!opts.proactive,
      openedAt: this.world.now(),
      inbound: text,
      inboundRedacted: vault.redact(text),
      facts: {},
      actions: [],
      brain: this.brainKind(),
      shadow: this.config.shadow,
      steps: 0,
    };
    this.cases.set(id, kase);
    this.traces.set(id, []);
    this.vaults.set(id, vault);
    this.triages.set(id, tri);
    this.targets.set(id, { rrns: new Set(), batches: new Set(), disputes: new Set() });

    if (!opts.proactive) this.recordMessage(kase, { from: "merchant", lang: tri.lang, text, channel });
    this.audit.append(id, "system", "case.opened", { merchantId, channel, workflow: tri.workflow, proactive: kase.proactive, inbound: kase.inboundRedacted }, this.world.now());
    this.trace(kase, "HEAR", opts.proactive ? "Proactive: stuck payment detected on the event stream" : `Inbound on ${channel}`, {
      detail: `${kase.inboundRedacted}\n\nLanguage: ${tri.lang} · Workflow: ${tri.workflow}${tri.amount ? ` · Amount: ₹${tri.amount}` : ""}${tri.signals.length ? ` · Signals: ${tri.signals.join(", ")}` : ""}${vault.size ? ` · PII redacted: ${vault.size} item(s)` : ""}`,
    });

    const brain: Brain =
      kase.brain === "llm"
        ? new LlmBrain(
            systemPrompt({
              caseId: id,
              merchantId,
              channel,
              lang: kase.lang,
              now: fmtIST(this.world.now()),
              signals: tri.signals,
              proactive: kase.proactive,
            }),
            kase.proactive ? `[EVENT STREAM] ${kase.inboundRedacted}` : `Merchant message (${channel}): ${kase.inboundRedacted}`,
          )
        : new PlannerBrain(this, kase);
    this.brains.set(id, brain);
    this.emitUpdate();
    this.enqueue(id, () => this.drive(kase));
    return kase;
  }

  decideApproval(approvalId: string, decision: "APPROVED" | "REJECTED", by = "ops-lead") {
    const a = this.approvals.get(approvalId);
    if (!a || a.status !== "PENDING") throw new Error("Approval not pending");
    const kase = this.cases.get(a.caseId)!;
    a.status = decision;
    a.decidedAt = this.world.now();
    a.decidedBy = by;
    this.audit.append(kase.id, `human:${by}`, "approval.decided", { approvalId, decision, tool: a.tool, amount: a.amount }, this.world.now());
    this.trace(kase, "CHECK", `Human ${decision.toLowerCase()} ${a.tool}`, { level: "L2", detail: `${by} · ${a.summary}` });
    this.enqueue(kase.id, async () => {
      let result: unknown = null;
      if (decision === "APPROVED") {
        const r = await this.execute(kase, { id: a.toolUseId ?? a.id, name: a.tool, input: a.input }, { approved: true });
        result = r.output;
      }
      kase.status = "IN_PROGRESS";
      this.brains.get(kase.id)!.event(`Approval ${approvalId} ${decision} by ${by}.`, { type: "APPROVAL_DECIDED", decision, tool: a.tool, result: result as any });
      await this.drive(kase);
    });
    this.emitUpdate();
    return a;
  }

  /** Move the simulated clock; watchers and the proactive detector run on the way. */
  advance(minutes: number) {
    const stepMs = 5 * MIN;
    let left = minutes * MIN;
    while (left > 0) {
      const s = Math.min(stepMs, left);
      this.world.advance(s);
      left -= s;
      this.checkWatchers();
      this.detectStuck();
    }
    this.emitUpdate();
  }

  setConfig(c: Partial<RuntimeConfig>) {
    Object.assign(this.config, c);
    this.policy.shadow = this.config.shadow;
    this.audit.append(null, "human:ops-lead", "config.changed", c, this.world.now());
    this.emitUpdate();
  }

  async idle() {
    for (;;) {
      const all = [...this.chains.values()];
      await Promise.all(all);
      if ([...this.chains.values()].every((p, i) => p === all[i]) && all.length === this.chains.size) return;
    }
  }

  // ------------------------------------------------------------------ agent loop

  private enqueue(caseId: string, fn: () => Promise<void>) {
    const prev = this.chains.get(caseId) ?? Promise.resolve();
    const next = prev.then(fn).catch((e) => {
      const kase = this.cases.get(caseId);
      if (kase) this.failSafe(kase, e as Error);
    });
    this.chains.set(caseId, next);
    return next;
  }

  private async drive(kase: Case) {
    const brain = this.brains.get(kase.id)!;
    let nudged = false;
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (TERMINAL.has(kase.status)) return;
      this.world.advance(2000);
      let t;
      try {
        if (this.config.chaosModelOutage) throw new ModelOutage(["chaos switch: simulated outage on Groq and Gemini"]);
        t = await brain.next();
      } catch (e) {
        this.failSafe(kase, e as Error);
        return;
      }
      kase.steps++;
      if (t.thought) this.trace(kase, "PLAN", t.thought, { detail: `by ${t.by}` });
      await this.pace();

      if (!t.calls.length) {
        const paused = kase.status === "AWAITING_APPROVAL" || this.activeWatchers(kase.id).length > 0;
        if (paused) {
          if (kase.status === "IN_PROGRESS") kase.status = "WATCHING";
          this.emitUpdate();
          return;
        }
        if (kase.shadow) {
          // Shadow mode: nothing was executed, so the real case stays with the human team.
          kase.status = "OPEN";
          this.trace(kase, "HANDOFF", "Shadow run complete — proposals recorded for comparison", { detail: `${kase.actions.length} proposed action(s)` });
          this.emitUpdate();
          return;
        }
        if (!nudged && brain.kind === "llm") {
          nudged = true;
          brain.event("You ended your turn, but the case is not closed, escalated, awaiting approval or watched. Continue: verify and close, set a watcher, or escalate.");
          continue;
        }
        this.systemEscalate(kase, "Agent stopped without closing the case", "Agent could not reach a verified outcome");
        return;
      }

      const results: ToolResult[] = [];
      for (const call of t.calls) {
        results.push(await this.execute(kase, call));
        await this.pace();
      }
      brain.observe(results);
      this.emitUpdate();
    }
    if (!TERMINAL.has(kase.status) && kase.status !== "AWAITING_APPROVAL" && kase.status !== "WATCHING") {
      this.systemEscalate(kase, `Turn budget of ${MAX_TURNS} exhausted`, "Agent loop did not converge");
    }
  }

  private async execute(kase: Case, call: ToolCall, opts: { approved?: boolean } = {}): Promise<ToolResult> {
    this.world.advance(1000);
    const vault = this.vaults.get(kase.id)!;
    const tool = TOOL_MAP.get(call.name);
    if (!tool) return this.err(kase, call, `Unknown tool ${call.name}`);
    if (call.parseError) return this.err(kase, call, call.parseError);

    const input = revealDeep(call.input, vault);
    const ctx: ToolCtx = { rt: this, kase, vault };
    const decision = evaluate(tool, input, ctx, this.policy, opts);
    this.bumpLevel(kase, decision.level);

    if (tool.kind !== "read") {
      this.trace(kase, "CHECK", `Policy ${decision.verdict.replace("_", " ").toLowerCase()} · ${tool.name}`, {
        tool: tool.name,
        input: vault.redactValue(input),
        decision,
        level: decision.level,
      });
      this.audit.append(kase.id, "policy", "policy.decision", { tool: tool.name, decision }, this.world.now());
    }

    const record = () => kase.actions.push({ tool: tool.name, input: vault.redactValue(input), level: decision.level, verdict: decision.verdict, at: this.world.now() });

    switch (decision.verdict) {
      case "BLOCK":
        record();
        return { call, output: { blocked_by_policy: decision.rules, reasons: decision.reasons }, isError: true };
      case "ESCALATE":
        record();
        this.systemEscalate(kase, decision.reasons.join("; "), `Policy ${decision.rules.join(",")} required a human`);
        return { call, output: { escalated_by_policy: decision.rules, reasons: decision.reasons }, isError: false };
      case "NEEDS_APPROVAL": {
        record();
        const a: Approval = {
          id: `APR-${String(this.seq++).padStart(4, "0")}`,
          caseId: kase.id,
          tool: tool.name,
          input,
          amount: tool.amount?.(input, ctx),
          summary: `${tool.name} ${JSON.stringify(vault.redactValue(input))}`,
          rationale: decision.reasons.join("; "),
          status: "PENDING",
          createdAt: this.world.now(),
          toolUseId: call.id,
        };
        this.approvals.set(a.id, a);
        kase.status = "AWAITING_APPROVAL";
        this.audit.append(kase.id, "policy", "approval.requested", { approvalId: a.id, tool: tool.name, amount: a.amount }, this.world.now());
        this.emitUpdate();
        return {
          call,
          output: { status: "PENDING_APPROVAL", approval_id: a.id, note: "Queued for one-click human approval. Tell the customer what happens next, then end your turn. You will be told the decision." },
          isError: false,
        };
      }
      case "SHADOW": {
        record();
        this.trace(kase, "ACT", `Shadow · would run ${tool.name}`, { tool: tool.name, input: vault.redactValue(input), level: decision.level });
        this.audit.append(kase.id, "agent", "action.shadow", { tool: tool.name, input: vault.redactValue(input) }, this.world.now());
        return { call, output: { status: "SHADOW_RECORDED", note: "Shadow mode: recorded, not executed. Do not tell anyone money moved." }, isError: false };
      }
    }

    // ALLOW
    let raw: any;
    try {
      raw = tool.run(input, ctx);
    } catch (e) {
      const msg = (e as Error).message;
      if (tool.name === "close_case") this.trace(kase, "VERIFY", "Verification failed — case stays open", { detail: msg, tool: tool.name });
      else this.trace(kase, tool.kind === "read" ? "PLAN" : "ACT", `${tool.name} failed`, { detail: msg, tool: tool.name });
      this.audit.append(kase.id, "agent", "tool.error", { tool: tool.name, error: msg }, this.world.now());
      return { call, output: msg, isError: true };
    }

    for (const f of tool.facts?.(input, raw, ctx) ?? []) {
      kase.facts[f.key] = { ...f, source: tool.name, at: this.world.now() };
    }
    this.track(kase, tool.name, input);
    const shown = vault.redactValue(raw);
    if (tool.kind !== "read") record();
    if (tool.name !== "close_case" && tool.name !== "escalate_to_human") {
      this.trace(kase, tool.kind === "read" ? "PLAN" : "ACT", label(tool.name, input), {
        tool: tool.name,
        input: vault.redactValue(input),
        output: shown,
        level: decision.level,
      });
    }
    this.audit.append(kase.id, tool.kind === "read" ? "agent" : "agent", tool.kind === "read" ? "tool.read" : "tool.act", { tool: tool.name, input: vault.redactValue(input), output: shown }, this.world.now());
    return { call, output: shown, isError: false };
  }

  private err(kase: Case, call: ToolCall, msg: string): ToolResult {
    this.trace(kase, "PLAN", `Rejected call ${call.name}`, { detail: msg });
    return { call, output: msg, isError: true };
  }

  private track(kase: Case, tool: string, input: any) {
    const t = this.targets.get(kase.id)!;
    if (tool === "raise_bank_ticket") t.rrns.add(String(input.rrn));
    if (tool === "release_settlement_hold") t.batches.add(String(input.batch_id));
    if (tool === "file_dispute_evidence") t.disputes.add(String(input.dispute_id));
    if (tool === "initiate_refund") {
      const txn = this.world.txns.get(String(input.txn_id));
      if (txn) t.rrns.add(txn.rrn);
    }
  }

  private bumpLevel(kase: Case, l: Level) {
    if (LEVEL_RANK[l] > LEVEL_RANK[kase.maxLevel]) kase.maxLevel = l;
  }

  private pace() {
    return this.config.pacingMs ? new Promise((r) => setTimeout(r, this.config.pacingMs)) : Promise.resolve();
  }

  // ------------------------------------------------------------------ verify, escalate, fail safe

  /** VERIFY: re-read the systems of record. The model's claim that it is fixed is never enough. */
  verifyAndClose(kase: Case, summary: string, rootCause: string) {
    if (kase.status === "AWAITING_APPROVAL") throw new Error("Cannot close: an approval is still pending");
    if (kase.actions.some((a) => a.verdict === "SHADOW")) throw new Error("Shadow mode: actions were recorded, not executed, so there is nothing to verify");
    if (kase.workflow === "account_change") throw new Error("Cannot close: payout-account requests must be escalated (policy P1)");
    const t = this.targets.get(kase.id)!;
    const checks: string[] = [];
    const fail = (m: string) => {
      throw new Error(`Verification failed: ${m}`);
    };
    for (const rrn of t.rrns) {
      const txn = this.world.txnByRrn(rrn);
      if (!txn || txn.beneficiaryCredit === "PENDING") fail(`ledger shows RRN ${rrn} credit still PENDING`);
      checks.push(`Ledger: RRN ${rrn} ${txn!.beneficiaryCredit === "SUCCESS" ? `credited ${fmtIST(txn!.creditedAt!)}` : "reversed to payer"}`);
    }
    for (const b of t.batches) {
      const s = this.world.settlements.get(b);
      if (!s || s.status !== "SETTLED") fail(`settlement ${b} is ${s?.status ?? "missing"}, no UTR yet`);
      checks.push(`Settlement: ${b} paid, UTR ${s!.utr}`);
    }
    for (const d of t.disputes) {
      const dsp = this.world.disputes.get(d);
      if (!dsp || dsp.status === "OPEN" || !dsp.ackRef) fail(`dispute ${d} has no NPCI acknowledgement`);
      checks.push(`Dispute: ${d} represented, ack ${dsp!.ackRef}`);
    }
    if (!checks.length) {
      // Nothing was acted on: make sure we are not closing over a payment that is still stuck.
      for (const [k, f] of Object.entries(kase.facts)) {
        if (!k.startsWith("txn:")) continue;
        const txn = this.world.txnByRrn(k.slice(4));
        if ((f.value as any)?.merchant_credit === "PENDING" && txn?.beneficiaryCredit === "PENDING") fail(`RRN ${txn.rrn} is still pending`);
      }
      checks.push("No money movement was required");
    }
    kase.status = "RESOLVED";
    kase.closedAt = this.world.now();
    kase.summary = summary;
    kase.rootCause = rootCause;
    for (const w of this.activeWatchers(kase.id)) w.status = "CANCELLED";
    this.trace(kase, "VERIFY", "Verified and closed", { detail: checks.join("\n"), output: { checks, summary } });
    this.audit.append(kase.id, "verifier", "case.closed", { checks, summary, rootCause }, this.world.now());
    this.emitUpdate();
    return { closed: true, verified: checks };
  }

  escalate(kase: Case, i: { reason: string; severity: "low" | "medium" | "high"; rootCause: string; recommendedAction: string; stepsTaken?: string[] }): CaseFile {
    const file: CaseFile = {
      reason: i.reason,
      severity: i.severity,
      rootCause: i.rootCause,
      recommendedAction: i.recommendedAction,
      stepsTaken: i.stepsTaken?.length
        ? i.stepsTaken
        : kase.actions.map((a) => `${a.tool} → ${a.verdict} (${a.level})`),
      evidence: Object.values(kase.facts).map((f) => ({ label: f.key, value: JSON.stringify(f.value), source: f.source })),
    };
    kase.caseFile = file;
    kase.status = "ESCALATED";
    kase.rootCause = i.rootCause;
    kase.closedAt = this.world.now();
    this.bumpLevel(kase, "L3");
    for (const w of this.activeWatchers(kase.id)) w.status = "CANCELLED";
    this.trace(kase, "HANDOFF", `Escalated to ${i.severity === "high" ? "fraud desk" : "merchant ops"} with case file`, { level: "L3", output: file });
    this.audit.append(kase.id, "agent", "case.escalated", file, this.world.now());
    this.emitUpdate();
    return file;
  }

  private systemEscalate(kase: Case, reason: string, rootCause: string) {
    if (TERMINAL.has(kase.status)) return;
    const first = this.world.merchants.get(kase.merchantId)?.owner.split(" ")[0] ?? "";
    const m = render("handoff", kase.lang, { name: first, eta: fmtIST(this.world.now() + 4 * HOUR) });
    this.recordMessage(kase, { from: "agent", to: "merchant", lang: kase.lang, text: m.text, gloss: m.gloss, channel: kase.channel });
    this.escalate(kase, { reason, severity: /risk|fraud|P1|P2/i.test(reason + rootCause) ? "high" : "medium", rootCause, recommendedAction: "Review the case file and contact the merchant" });
  }

  /** Model or tool outage: no half-finished actions, straight to the human queue with the case file. */
  private failSafe(kase: Case, e: Error) {
    if (TERMINAL.has(kase.status)) return;
    const outage = e instanceof ModelOutage;
    this.trace(kase, "HANDOFF", outage ? "Model outage — failing safe to the human queue" : "Runtime error — failing safe", { detail: e.message, level: "L3" });
    this.systemEscalate(kase, outage ? "Model providers unavailable (Groq and Gemini)" : `Runtime error: ${e.message}`, kase.rootCause ?? "Diagnosis incomplete; see evidence");
    kase.status = "FAILED_SAFE";
    this.emitUpdate();
  }

  // ------------------------------------------------------------------ watchers & detection

  addWatcher(caseId: string, kind: Watcher["kind"], ref: string, hours: number) {
    const w: Watcher = { id: `W-${String(this.seq++).padStart(4, "0")}`, caseId, kind, ref, deadline: this.world.now() + Math.max(1, Math.min(hours, 120)) * HOUR, status: "ACTIVE" };
    this.watchers.set(w.id, w);
    const kase = this.cases.get(caseId)!;
    if (kase.status === "IN_PROGRESS") kase.status = "WATCHING";
    return w;
  }

  private activeWatchers(caseId: string) {
    return [...this.watchers.values()].filter((w) => w.caseId === caseId && w.status === "ACTIVE");
  }

  private checkWatchers() {
    for (const w of this.watchers.values()) {
      if (w.status !== "ACTIVE") continue;
      const kase = this.cases.get(w.caseId)!;
      let done = false;
      let detail = "";
      if (w.kind === "TXN_CREDIT") {
        const t = this.world.txnByRrn(w.ref);
        done = t?.beneficiaryCredit !== "PENDING";
        detail = `RRN ${w.ref} ${t?.beneficiaryCredit}`;
      } else if (w.kind === "SETTLEMENT") {
        const s = this.world.settlements.get(w.ref);
        done = s?.status === "SETTLED";
        detail = `Batch ${w.ref} ${s?.status}${s?.utr ? ` UTR ${s.utr}` : ""}`;
      } else {
        const d = this.world.disputes.get(w.ref);
        done = d?.status !== "OPEN";
        detail = `Dispute ${w.ref} ${d?.status}`;
      }
      if (done) {
        w.status = "FIRED";
        this.trace(kase, "EVENT", "Watcher fired", { detail });
        this.audit.append(kase.id, "watcher", "watcher.fired", { watcher: w.id, detail }, this.world.now());
        this.enqueue(kase.id, async () => {
          kase.status = "IN_PROGRESS";
          this.brains.get(kase.id)!.event(`Watcher ${w.id} fired: ${detail}. Verify and close.`, { type: "WATCHER_FIRED", kind: w.kind, ref: w.ref });
          await this.drive(kase);
        });
      } else if (this.world.now() > w.deadline) {
        w.status = "BREACHED";
        this.trace(kase, "EVENT", "Watcher deadline passed", { detail, level: "L3" });
        this.audit.append(kase.id, "watcher", "watcher.breached", { watcher: w.id, detail }, this.world.now());
        this.systemEscalate(kase, `Deadline guardrail: ${detail} not confirmed in time`, "Counterparty did not complete within the committed time");
      }
    }
  }

  private seenStuck = new Set<string>();

  private detectStuck() {
    const now = this.world.now();
    for (const t of this.world.txns.values()) {
      if (t.payerDebit !== "SUCCESS" || t.beneficiaryCredit !== "PENDING" || this.seenStuck.has(t.rrn)) continue;
      if (now - t.ts < this.config.stuckAfterMin * MIN) continue;
      const covered = [...this.cases.values()].some((c) => c.facts[`txn:${t.rrn}`] || this.targets.get(c.id)?.rrns.has(t.rrn));
      this.seenStuck.add(t.rrn);
      if (covered) continue;
      const mins = Math.round((now - t.ts) / MIN);
      this.inbound(t.merchantId, `Payment RRN ${t.rrn} of ₹${t.amount} from ${t.payerVpa}: payer debited, merchant credit pending for ${mins} min. No complaint yet.`, "event", { proactive: true });
    }
  }

  private onWorld(e: WorldEvent) {
    if (e.type === "txn.credited") {
      const m = this.world.merchants.get(e.txn.merchantId)!;
      e.txn.soundboxAnnounced = true;
      this.world.announce(m.id, e.txn.amount, soundboxLine(m.lang, e.txn.amount));
    }
    this.emit("world", e);
  }

  // ------------------------------------------------------------------ messages & trace

  deliverMessage(kase: Case, to: "merchant" | "payer", text: string, gloss?: string) {
    if (to === "payer") {
      const rrn = [...this.targets.get(kase.id)!.rrns][0] ?? Object.keys(kase.facts).find((k) => k.startsWith("txn:") && (kase.facts[k].value as any).merchant_credit === "PENDING")?.slice(4);
      if (!rrn) throw new Error("No payer identified for this case yet");
    }
    const lang = detectLang(text, to === "payer" ? "en" : kase.lang);
    return this.recordMessage(kase, { from: "agent", to, lang, text, gloss, channel: to === "payer" ? "in-app" : kase.channel === "event" ? "whatsapp" : kase.channel });
  }

  private recordMessage(kase: Case, m: Omit<ChatMessage, "id" | "caseId" | "simTs">) {
    const msg: ChatMessage = { ...m, id: `MSG-${this.seq++}`, caseId: kase.id, simTs: this.world.now() };
    this.messages.push(msg);
    this.emit("message", msg);
    return msg;
  }

  private trace(kase: Case, stage: Stage, title: string, extra: Partial<TraceEvent> = {}) {
    const ev: TraceEvent = {
      id: `EV-${this.seq++}`,
      caseId: kase.id,
      stage,
      simTs: this.world.now(),
      tPlus: Math.round((this.world.now() - kase.openedAt) / 1000),
      title,
      ...extra,
    };
    this.traces.get(kase.id)!.push(ev);
    this.emit("trace", ev);
    return ev;
  }

  private emitUpdate() {
    this.emit("update");
  }

  // ------------------------------------------------------------------ views

  metrics() {
    const all = [...this.cases.values()];
    const resolved = all.filter((c) => c.status === "RESOLVED");
    const touchless = resolved.filter((c) => !c.actions.some((a) => a.level === "L2"));
    const ttr = resolved.map((c) => (c.closedAt! - c.openedAt) / MIN).sort((a, b) => a - b);
    const disputes = all.filter((c) => c.workflow === "dispute");
    return {
      cases: all.length,
      resolved: resolved.length,
      autoResolved: touchless.length,
      autoResolveRate: all.length ? touchless.length / all.length : 0,
      escalated: all.filter((c) => c.status === "ESCALATED" || c.status === "FAILED_SAFE").length,
      awaitingApproval: [...this.approvals.values()].filter((a) => a.status === "PENDING").length,
      watching: all.filter((c) => c.status === "WATCHING").length,
      proactive: all.filter((c) => c.proactive).length,
      medianMinutesToResolve: ttr.length ? ttr[Math.floor(ttr.length / 2)] : null,
      missedDisputeDeadlines: disputes.filter((c) => [...this.world.disputes.values()].some((d) => d.merchantId === c.merchantId && d.status === "OPEN" && this.world.now() > d.deadline)).length,
      proactiveUpdatesSent: this.messages.filter((m) => m.from === "agent").length,
    };
  }

  snapshot() {
    return {
      now: this.world.now(),
      nowLabel: fmtIST(this.world.now()),
      config: this.config,
      brain: this.brainKind(),
      providers: configuredProviders().map((p) => p.name),
      policy: this.policy,
      cases: [...this.cases.values()].sort((a, b) => b.openedAt - a.openedAt),
      approvals: [...this.approvals.values()],
      watchers: [...this.watchers.values()],
      messages: this.messages,
      announcements: this.world.announcements,
      merchants: [...this.world.merchants.values()].map((m) => ({ id: m.id, owner: m.owner, business: m.business, area: m.area, lang: m.lang, soundboxId: m.soundboxId })),
      upcoming: this.world.pending(),
      metrics: this.metrics(),
    };
  }

  caseDetail(id: string) {
    const kase = this.cases.get(id);
    if (!kase) return null;
    return {
      case: kase,
      trace: this.traces.get(id) ?? [],
      messages: this.messages.filter((m) => m.caseId === id),
      approvals: [...this.approvals.values()].filter((a) => a.caseId === id),
      watchers: [...this.watchers.values()].filter((w) => w.caseId === id),
      audit: this.audit.list(id),
    };
  }
}

function revealDeep(v: any, vault: PiiVault): any {
  if (typeof v === "string") return vault.reveal(v);
  if (Array.isArray(v)) return v.map((x) => revealDeep(x, vault));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revealDeep(x, vault)]));
  return v;
}

function label(tool: string, input: any) {
  const map: Record<string, string> = {
    lookup_merchant: "Looked up merchant profile",
    search_transactions: "Searched the payments ledger",
    get_bank_status: `Checked beneficiary bank for RRN ${input?.rrn}`,
    get_udir_status: `Checked UDIR and TAT rules for RRN ${input?.rrn}`,
    get_settlement_status: "Checked settlement batches",
    get_kyc_profile: "Pulled KYC profile",
    verify_bank_account: "Ran penny-drop verification",
    get_risk_signals: "Checked risk signals",
    get_dispute: "Checked open disputes",
    collect_dispute_evidence: `Collected evidence for ${input?.dispute_id}`,
    search_sop: "Retrieved SOPs and NPCI/RBI rules",
    raise_bank_ticket: `Raised ${input?.kind} ticket with the bank`,
    set_watcher: `Armed ${input?.kind} watcher on ${input?.ref}`,
    send_message: `Messaged the ${input?.to}`,
    initiate_refund: `Initiated refund of ₹${input?.amount}`,
    release_settlement_hold: `Released settlement ${input?.batch_id}`,
    file_dispute_evidence: `Filed evidence for ${input?.dispute_id}`,
  };
  return map[tool] ?? tool;
}

export type { Lang };
