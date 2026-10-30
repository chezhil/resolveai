// PlannerBrain: a deterministic, offline planner that follows the same SOPs as the LLM and goes
// through exactly the same tools, policy engine and verifier. It powers the demo without API keys,
// the golden-case evals in CI, and the fallback story when models are unavailable.

import type { Brain, BrainTurn, ToolCall, ToolResult } from "./brain.js";
import type { Case } from "../core/types.js";
import type { Runtime } from "../core/runtime.js";
import { render } from "../sim/lang.js";

type Out = Record<string, any>;

export class PlannerBrain implements Brain {
  readonly kind = "planner" as const;
  private phase = "start";
  private n = 0;
  private results = new Map<string, Out>();
  private errors = new Map<string, string>();
  private events: { text: string; data?: Record<string, unknown> }[] = [];
  private data: Record<string, any> = {};

  constructor(
    private rt: Runtime,
    private kase: Case,
  ) {}

  private call(name: string, input: Out): ToolCall {
    return { id: `pl_${this.kase.id}_${++this.n}`, name, input };
  }

  private turn(thought: string, calls: ToolCall[]): BrainTurn {
    return { thought, calls, by: "planner:deterministic" };
  }

  private get firstName() {
    return this.rt.world.merchants.get(this.kase.merchantId)?.owner.split(" ")[0] ?? "there";
  }

  private msg(key: Parameters<typeof render>[0], args: Record<string, string | number>, to: "merchant" | "payer" = "merchant") {
    const lang = to === "payer" ? "en" : this.kase.lang;
    const { text, gloss } = render(key, lang, { name: this.firstName, ...args });
    return this.call("send_message", { to, text, english_gloss: gloss });
  }

  observe(results: ToolResult[]) {
    for (const r of results) {
      if (r.isError) this.errors.set(r.call.name, JSON.stringify(r.output));
      else this.results.set(r.call.name, r.output as Out);
    }
  }

  event(text: string, data?: Record<string, unknown>) {
    this.events.push({ text, data });
  }

  async next(): Promise<BrainTurn> {
    const m = this.kase.merchantId;
    const ev = this.events.shift();
    if (ev?.data?.type === "WATCHER_BREACHED") return this.turn("Deadline passed without confirmation; the runtime has escalated.", []);
    if (ev?.data?.type === "FOLLOW_UP") return this.followUp();

    switch (this.kase.workflow) {
      case "failed_payment":
        return this.failedPayment(m, ev);
      case "settlement_hold":
        return this.settlement(m, ev);
      case "dispute":
        return this.dispute(m);
      case "account_change":
        return this.accountChange(m);
      default:
        return this.unknown(m);
    }
  }

  /** Repeat contact: answer with live status instead of opening a new case. */
  private followUp(): BrainTurn {
    const eta = this.results.get("raise_bank_ticket")?.bank_eta;
    if (this.kase.workflow === "failed_payment" && eta) {
      return this.turn("Repeat contact. Re-send the exact status; nothing new to do.", [this.msg("failedPaymentMerchant", { amount: this.data.amount, eta })]);
    }
    if (this.kase.workflow === "settlement_hold" && this.data.batch) {
      return this.turn("Repeat contact. Re-send the status.", [this.msg("settlementPending", { amount: this.data.batch.amount, holder: this.data.holder ?? "" })]);
    }
    return this.turn("Repeat contact; work already in progress.", []);
  }

  private escalate(reason: string, rootCause: string, action: string, severity: "low" | "medium" | "high" = "medium") {
    this.phase = "done";
    return this.turn(`Handing off: ${reason}`, [
      this.msg("handoff", { eta: "today, 6:00 pm" }),
      this.call("escalate_to_human", { reason, severity, root_cause: rootCause, recommended_action: action }),
    ]);
  }

  private failedPayment(m: string, ev?: { data?: Record<string, unknown> }): BrainTurn {
    switch (this.phase) {
      case "start": {
        this.phase = "match";
        const tri = this.rt.triageOf(this.kase.id);
        return this.turn(
          this.kase.proactive
            ? "Event stream shows a payer debit with no merchant credit. Pull the ledger and SOP before the merchant has to ask."
            : "Merchant says a customer paid but the soundbox stayed silent. Check the ledger first, not the device.",
          [
            this.call("lookup_merchant", { merchant_id: m }),
            this.call("search_transactions", { merchant_id: m, since_minutes: 60, ...(tri?.amount ? { amount: tri.amount } : {}) }),
            this.call("search_sop", { query: "soundbox silent customer paid debited credit pending merchant" }),
          ],
        );
      }
      case "match": {
        const txns: Out[] = this.results.get("search_transactions")?.transactions ?? [];
        const stuck = txns.find((t) => t.payer_debit === "SUCCESS" && t.merchant_credit === "PENDING");
        if (!stuck) return this.escalate("No stuck payment matches the complaint", "All recent payments show as credited", "Ask the merchant for the customer's UPI reference", "low");
        this.data.rrn = stuck.rrn;
        this.data.amount = stuck.amount;
        this.phase = "diagnose";
        return this.turn(`Matched ₹${stuck.amount} (RRN ${stuck.rrn}): payer debited, merchant credit pending. Confirm with Paytm PG and the bank, and check the TAT window.`, [
          this.call("paytm_order_status", { order_id: stuck.order_id }),
          this.call("get_bank_status", { rrn: stuck.rrn }),
          this.call("get_udir_status", { rrn: stuck.rrn }),
        ]);
      }
      case "diagnose": {
        const bank = this.results.get("get_bank_status");
        const udir = this.results.get("get_udir_status");
        const pg = this.results.get("paytm_order_status")?.body?.resultInfo;
        this.phase = "notify";
        return this.turn(
          `Paytm PG says ${pg?.resultStatus ?? "?"} (${pg?.resultCode ?? "-"}); bank confirms ${bank?.beneficiary_status}: ${bank?.reason}. Within the RBI window (resolve by ${udir?.resolve_by}). L1 action: raise a push-credit ticket.`,
          [this.call("raise_bank_ticket", { rrn: this.data.rrn, kind: "PUSH_CREDIT" })],
        );
      }
      case "notify": {
        if (this.errors.has("raise_bank_ticket")) return this.escalate("Could not raise bank ticket", "Credit pending at beneficiary bank", "Raise the UDIR ticket manually");
        const eta = this.results.get("raise_bank_ticket")?.bank_eta;
        this.phase = "wait";
        return this.turn(`Bank committed to ${eta}. Arm a watcher, tell ${this.firstName} the exact time in their language, and reassure the payer.`, [
          this.call("set_watcher", { kind: "TXN_CREDIT", ref: this.data.rrn, deadline_hours: 30 }),
          this.msg("failedPaymentMerchant", { amount: this.data.amount, eta }),
          this.msg("failedPaymentPayer", { amount: this.data.amount, eta, business: this.rt.world.merchants.get(m)?.business ?? "the merchant" }, "payer"),
        ]);
      }
      case "wait": {
        if (ev?.data?.type !== "WATCHER_FIRED") return this.turn("Waiting on the bank; watcher armed.", []);
        this.phase = "close";
        return this.turn("Watcher fired. Re-read the bank status myself before telling anyone.", [this.call("get_bank_status", { rrn: this.data.rrn })]);
      }
      case "close": {
        const bank = this.results.get("get_bank_status");
        if (bank?.beneficiary_status !== "CREDITED") {
          this.phase = "wait";
          return this.turn("Not credited yet; keep waiting.", []);
        }
        this.phase = "done";
        return this.turn("Ledger shows the credit. Confirm to the merchant and close with verification.", [
          this.msg("creditLanded", { amount: this.data.amount }),
          this.call("close_case", {
            resolution_summary: `₹${this.data.amount} (RRN ${this.data.rrn}) credited after push-credit ticket; merchant and payer informed.`,
            root_cause: "Beneficiary bank CBS timeout after payer debit",
          }),
        ]);
      }
      default:
        return this.turn("Nothing further.", []);
    }
  }

  private settlement(m: string, ev?: { data?: Record<string, unknown> }): BrainTurn {
    switch (this.phase) {
      case "start":
        this.phase = "diagnose";
        return this.turn("Merchant says the settlement hasn't arrived. Check settlement batches, KYC and the SOP together.", [
          this.call("lookup_merchant", { merchant_id: m }),
          this.call("get_settlement_status", { merchant_id: m }),
          this.call("get_kyc_profile", { merchant_id: m }),
          this.call("search_sop", { query: "settlement held bank account name mismatch release" }),
        ]);
      case "diagnose": {
        const held = (this.results.get("get_settlement_status")?.batches ?? []).find((b: Out) => b.status === "ON_HOLD");
        if (!held) return this.escalate("No held batch found", "Settlements are flowing", "Check bank-side credit of last UTR", "low");
        this.data.batch = held;
        this.phase = "verify";
        return this.turn(`Batch ${held.batch_id} (₹${held.amount.toLocaleString("en-IN")}) is held for ${held.hold_reason}. Run a penny-drop and check risk before proposing a release.`, [
          this.call("verify_bank_account", { merchant_id: m }),
          this.call("get_risk_signals", { merchant_id: m }),
        ]);
      }
      case "verify": {
        const v = this.results.get("verify_bank_account");
        if (!v || v.name_match_score < 0.85) return this.escalate("Bank holder name does not match PAN", "Genuine name mismatch", "Request a cancelled cheque / bank letter via re-KYC");
        this.data.holder = v.bank_holder_name;
        this.phase = "propose";
        return this.turn(`Penny-drop holder "${v.bank_holder_name}" contains PAN name "${v.pan_name}" (score ${v.name_match_score}). Blocker cleared; propose the release.`, [
          this.call("release_settlement_hold", {
            batch_id: this.data.batch.batch_id,
            justification: `Penny-drop SUCCESS; holder "${v.bank_holder_name}" matches PAN name "${v.pan_name}" with score ${v.name_match_score}. No risk flags.`,
          }),
        ]);
      }
      case "propose": {
        const r = this.results.get("release_settlement_hold");
        this.phase = "await";
        if (r?.status === "PENDING_APPROVAL") {
          return this.turn("Above the L1 cap, so it's in the approval queue. Tell the merchant exactly what happens next.", [
            this.msg("settlementPending", { amount: this.data.batch.amount, holder: this.data.holder }),
          ]);
        }
        return this.settlement(m, ev);
      }
      case "await": {
        if (ev?.data?.type === "APPROVAL_DECIDED") {
          if (ev.data.decision !== "APPROVED") return this.escalate("Ops lead rejected the release", "Name mismatch hold", "Follow up with re-KYC");
          this.phase = "settled";
          return this.turn("Approved and released. Watch the payout until a UTR confirms it.", [
            this.call("set_watcher", { kind: "SETTLEMENT", ref: this.data.batch.batch_id, deadline_hours: 6 }),
          ]);
        }
        if (this.results.get("release_settlement_hold")?.status === "PROCESSING") {
          this.phase = "settled";
          return this.turn("Released within L1. Watch the payout.", [this.call("set_watcher", { kind: "SETTLEMENT", ref: this.data.batch.batch_id, deadline_hours: 6 })]);
        }
        return this.turn("Waiting for approval.", []);
      }
      case "settled": {
        if (ev?.data?.type !== "WATCHER_FIRED") return this.turn("Waiting for the payout UTR.", []);
        this.phase = "close";
        return this.turn("Watcher fired. Re-read settlement status.", [this.call("get_settlement_status", { merchant_id: m })]);
      }
      case "close": {
        const b = (this.results.get("get_settlement_status")?.batches ?? []).find((x: Out) => x.batch_id === this.data.batch.batch_id);
        this.phase = "done";
        return this.turn(`Settled with UTR ${b?.utr}. Inform and close.`, [
          this.msg("settlementReleased", { amount: this.data.batch.amount, utr: b?.utr ?? "-" }),
          this.call("close_case", {
            resolution_summary: `Settlement ${this.data.batch.batch_id} released after penny-drop verification and approval; paid with UTR ${b?.utr}.`,
            root_cause: "Proprietorship-styled bank holder name flagged as mismatch against PAN",
          }),
        ]);
      }
      default:
        return this.turn("Nothing further.", []);
    }
  }

  private dispute(m: string): BrainTurn {
    switch (this.phase) {
      case "start":
        this.phase = "evidence";
        return this.turn("Chargeback raised. Find the dispute and its deadline first.", [
          this.call("lookup_merchant", { merchant_id: m }),
          this.call("get_dispute", { merchant_id: m }),
          this.call("search_sop", { query: "chargeback representation evidence goods not received deadline" }),
        ]);
      case "evidence": {
        const d = (this.results.get("get_dispute")?.disputes ?? []).find((x: Out) => x.status === "OPEN");
        if (!d) return this.escalate("No open dispute found", "Unknown", "Check with acquiring bank", "low");
        this.data.d = d;
        this.phase = "file";
        return this.turn(`${d.dispute_id}: ₹${d.amount.toLocaleString("en-IN")}, "${d.reason}", ${d.hours_left}h left. Pull QR, auth, soundbox, invoice and geo evidence.`, [
          this.call("collect_dispute_evidence", { dispute_id: d.dispute_id }),
        ]);
      }
      case "file": {
        const ids = (this.results.get("collect_dispute_evidence")?.evidence ?? []).map((e: Out) => e.evidence_id);
        this.phase = "close";
        return this.turn(`${ids.length} independent pieces show the payer was present, authenticated and received goods. File now, well before the deadline.`, [
          this.call("file_dispute_evidence", { dispute_id: this.data.d.dispute_id, evidence_ids: ids }),
        ]);
      }
      case "close": {
        const f = this.results.get("file_dispute_evidence");
        if (!f) return this.escalate("Filing failed", "Dispute open", "File representation manually before deadline", "high");
        this.phase = "done";
        return this.turn(`Filed, NPCI ack ${f.ack_ref}. Inform the merchant and close.`, [
          this.msg("disputeFiled", { amount: this.data.d.amount, dispute: this.data.d.dispute_id, ack: f.ack_ref, margin: `${Math.floor(this.data.d.hours_left)} hours` }),
          this.call("close_case", {
            resolution_summary: `Representation for ${this.data.d.dispute_id} filed with ${f.evidence_filed.length} evidence items; NPCI ack ${f.ack_ref}.`,
            root_cause: "Payer-initiated goods-not-received chargeback contradicted by device evidence",
          }),
        ]);
      }
      default:
        return this.turn("Nothing further.", []);
    }
  }

  private accountChange(m: string): BrainTurn {
    switch (this.phase) {
      case "start":
        this.phase = "propose";
        return this.turn("Request to change the payout bank account. Check identity risk and policy first.", [
          this.call("lookup_merchant", { merchant_id: m }),
          this.call("get_risk_signals", { merchant_id: m }),
          this.call("search_sop", { query: "payout bank account change request" }),
        ]);
      case "propose": {
        const text = this.kase.inbound;
        const acct = text.match(/\b\d{9,18}\b/)?.[0] ?? "unknown";
        const ifsc = text.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/)?.[0] ?? "unknown";
        this.phase = "handoff";
        return this.turn("The merchant asked for the change; propose it and let policy rule.", [
          this.call("update_payout_account", { merchant_id: m, new_account_no: acct, new_ifsc: ifsc }),
        ]);
      }
      case "handoff": {
        const flags: Out[] = this.results.get("get_risk_signals")?.flags ?? [];
        this.phase = "done";
        return this.turn("Policy P1 blocked it and risk flags are live. Refuse safely and escalate to the fraud desk with the case file.", [
          this.msg("accountChangeRefused", {}),
          this.call("escalate_to_human", {
            reason: "Payout-account change requested over chat with live risk signals",
            severity: "high",
            root_cause: `Likely account-takeover attempt: ${flags.map((f) => `${f.code} (${f.note})`).join("; ")}; urgent change request`,
            steps_taken: ["Checked risk signals", "Retrieved payout-change SOP", "Change blocked by policy P1", "Merchant told to use in-app re-KYC"],
            recommended_action: "Call the merchant on the pre-SIM-swap verified number; freeze payout changes for 72h; review the new device session",
          }),
        ]);
      }
      default:
        return this.turn("Nothing further.", []);
    }
  }

  private unknown(m: string): BrainTurn {
    if (this.phase === "start") {
      this.phase = "handoff";
      return this.turn("Intent unclear. Gather context before deciding.", [
        this.call("lookup_merchant", { merchant_id: m }),
        this.call("search_sop", { query: this.kase.inboundRedacted.slice(0, 200) }),
      ]);
    }
    if (this.phase === "handoff") return this.escalate("Ambiguous request", "Could not map the request to a known workflow", "Call the merchant to clarify");
    return this.turn("Nothing further.", []);
  }
}
