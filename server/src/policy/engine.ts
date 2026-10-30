// Deterministic policy engine: the model proposes, policy decides.
// Every proposed tool call is classified into L0–L3 and given a verdict. The engine trusts
// tool-established facts and live system state only, never the model's own claims.

import type { Case, Level, PolicyDecision } from "../core/types.js";
import type { ToolCtx, ToolDef } from "../tools/registry.js";
import { findLeaks } from "../core/pii.js";

export interface PolicyConfig {
  /** Max refund the agent may issue on its own. */
  l1RefundCap: number;
  /** Max settlement release the agent may do on its own. */
  l1ReleaseCap: number;
  /** Above this, even a human approval is not enough from this queue: escalate. */
  l2Cap: number;
  nameMatchMin: number;
  maxActionsPerCase: number;
  shadow: boolean;
}

export const DEFAULT_POLICY: PolicyConfig = {
  l1RefundCap: 2000,
  l1ReleaseCap: 10000,
  l2Cap: 500000,
  nameMatchMin: 0.85,
  maxActionsPerCase: 10,
  shadow: false,
};

export const RULES: Record<string, string> = {
  P0: "Read-only lookups are always allowed (L0).",
  P1: "Never change a merchant's payout account from a support channel.",
  P2: "High-severity risk flags on the merchant force L3 for any money or account action.",
  P3: "No action without tool-confirmed facts: the ledger, not the model, must show the problem.",
  P4: "Value tiers: small and reversible is L1, larger needs one-click human approval (L2), largest escalates (L3).",
  P5: "Per-case action budget; runaway loops go to a human.",
  P6: "Outgoing messages must not contain account numbers, PAN, Aadhaar or phone numbers.",
  P7: "Dispute evidence can only be filed inside the representation window.",
  P8: "Shadow mode: actions are recorded, not executed.",
  P9: "One refund per transaction; never refund what was already credited back.",
};

const decide = (verdict: PolicyDecision["verdict"], level: Level, rules: string[], reasons: string[]): PolicyDecision => ({
  verdict,
  level,
  rules,
  reasons,
});

const fact = (k: Case, key: string) => k.facts[key]?.value as any;

export function evaluate(tool: ToolDef, input: any, ctx: ToolCtx, cfg: PolicyConfig, opts: { approved?: boolean } = {}): PolicyDecision {
  const { kase, rt } = ctx;

  if (tool.kind === "read") return decide("ALLOW", "L0", ["P0"], ["Read-only"]);
  if (tool.name === "escalate_to_human") return decide("ALLOW", "L3", ["P2"], ["Hand-off to a human with the case file"]);
  if (tool.name === "close_case") return decide("ALLOW", "L0", ["P3"], ["Closure is gated by the independent verifier"]);
  if (tool.name === "set_watcher") return decide("ALLOW", "L1", ["P4"], ["Watchers are reversible"]);

  // P1 — hard block, regardless of who asks or what the model thinks.
  if (tool.name === "update_payout_account") {
    return decide("BLOCK", "L3", ["P1"], ["Payout accounts are changed only via in-app re-KYC with video verification. Escalate to the fraud desk."]);
  }

  // P5 — runaway protection.
  const acted = kase.actions.filter((a) => a.verdict === "ALLOW" || a.verdict === "SHADOW").length;
  if (acted >= cfg.maxActionsPerCase) return decide("ESCALATE", "L3", ["P5"], [`Action budget of ${cfg.maxActionsPerCase} used`]);

  // P2 — risk flags read straight from the risk system, not from the conversation.
  const merchant = rt.world.merchants.get(kase.merchantId);
  const high = merchant?.risk.flags.filter((f) => f.severity === "high") ?? [];
  if (high.length && tool.name !== "send_message") {
    return decide("ESCALATE", "L3", ["P2"], high.map((f) => `Risk flag ${f.code}: ${f.note}`));
  }

  // P6 — outbound PII.
  if (tool.name === "send_message") {
    const leaks = findLeaks(ctx.vault.reveal(String(input?.text ?? "")));
    if (leaks.length) return decide("BLOCK", "L1", ["P6"], [`Message contains ${leaks.join(", ")}`]);
    return finalize(decide("ALLOW", "L1", ["P4"], ["Customer communication"]), cfg);
  }

  // P3 — grounding, per action.
  if (tool.name === "raise_bank_ticket") {
    const rrn = String(input?.rrn);
    const t = fact(kase, `txn:${rrn}`);
    const b = fact(kase, `bank:${rrn}`);
    if (!t) return decide("BLOCK", "L1", ["P3"], [`No ledger fact for RRN ${rrn}: call search_transactions first`]);
    if (!b) return decide("BLOCK", "L1", ["P3"], [`Bank status not checked for RRN ${rrn}: call get_bank_status first`]);
    if (t.payer_debit !== "SUCCESS" || b.status !== "CREDIT_PENDING_AT_BENEFICIARY") {
      return decide("BLOCK", "L1", ["P3"], [`Ledger shows debit=${t.payer_debit}, bank=${b.status}; nothing is stuck`]);
    }
    return finalize(decide("ALLOW", "L1", ["P3", "P4"], ["Debit confirmed and credit pending at beneficiary (tool-confirmed); ticket is reversible"]), cfg);
  }

  if (tool.name === "initiate_refund") {
    const amount = Number(input?.amount);
    const txn = rt.world.txns.get(String(input?.txn_id));
    const known = txn && fact(kase, `txn:${txn.rrn}`);
    if (!txn || !known) return decide("BLOCK", "L1", ["P3"], ["Transaction not confirmed by a ledger lookup in this case"]);
    if (txn.beneficiaryCredit === "REVERSED") return decide("BLOCK", "L1", ["P9"], ["Already reversed to payer"]);
    if (!(amount > 0) || amount > txn.amount) return decide("BLOCK", "L1", ["P3"], [`Refund ₹${amount} exceeds transaction ₹${txn.amount}`]);
    return tier(amount, cfg.l1RefundCap, cfg, opts.approved, "refund");
  }

  if (tool.name === "release_settlement_hold") {
    const s = rt.world.settlements.get(String(input?.batch_id));
    const known = fact(kase, `settlement:${input?.batch_id}`);
    const verify = fact(kase, `bankVerify:${kase.merchantId}`);
    if (!s || !known) return decide("BLOCK", "L1", ["P3"], ["Settlement batch not confirmed by get_settlement_status"]);
    if (s.merchantId !== kase.merchantId) return decide("BLOCK", "L3", ["P3"], ["Batch belongs to a different merchant"]);
    if (s.holdReason === "BANK_NAME_MISMATCH" && !(verify && verify.score >= cfg.nameMatchMin)) {
      return decide("BLOCK", "L1", ["P3"], [`Hold reason is a name mismatch; needs verify_bank_account with match ≥ ${cfg.nameMatchMin}`]);
    }
    return tier(s.amount, cfg.l1ReleaseCap, cfg, opts.approved, "settlement release");
  }

  if (tool.name === "file_dispute_evidence") {
    const d = rt.world.disputes.get(String(input?.dispute_id));
    const ev = fact(kase, `evidence:${input?.dispute_id}`) as string[] | undefined;
    if (!d || !fact(kase, `dispute:${input?.dispute_id}`)) return decide("BLOCK", "L1", ["P3"], ["Dispute not confirmed by get_dispute"]);
    if (!ev) return decide("BLOCK", "L1", ["P3"], ["Evidence not collected via collect_dispute_evidence"]);
    const ids: string[] = input?.evidence_ids ?? [];
    const unknown = ids.filter((x) => !ev.includes(x));
    if (unknown.length) return decide("BLOCK", "L1", ["P3"], [`Evidence ids not from the evidence store: ${unknown.join(", ")}`]);
    if (rt.world.now() > d.deadline) return decide("ESCALATE", "L3", ["P7"], ["Representation window has closed"]);
    return finalize(decide("ALLOW", "L1", ["P3", "P7"], ["Filing evidence before the deadline protects the merchant and is reviewable"]), cfg);
  }

  return decide("ESCALATE", "L3", ["P4"], [`No policy covers ${tool.name}; defaulting to a human`]);
}

function tier(amount: number, l1Cap: number, cfg: PolicyConfig, approved: boolean | undefined, what: string) {
  const rupees = `₹${amount.toLocaleString("en-IN")}`;
  if (amount <= l1Cap) return finalize(decide("ALLOW", "L1", ["P3", "P4"], [`${what} of ${rupees} is within the L1 cap of ₹${l1Cap.toLocaleString("en-IN")}`]), cfg);
  if (amount <= cfg.l2Cap) {
    if (approved) return finalize(decide("ALLOW", "L2", ["P4"], [`${what} of ${rupees} approved by a human`]), cfg);
    return decide("NEEDS_APPROVAL", "L2", ["P3", "P4"], [`${what} of ${rupees} is above the L1 cap; needs one-click approval`]);
  }
  return decide("ESCALATE", "L3", ["P4"], [`${what} of ${rupees} is above the L2 cap`]);
}

function finalize(d: PolicyDecision, cfg: PolicyConfig): PolicyDecision {
  if (cfg.shadow && d.verdict === "ALLOW") return { ...d, verdict: "SHADOW", rules: [...d.rules, "P8"], reasons: [...d.reasons, "Shadow mode: recorded, not executed"] };
  return d;
}
