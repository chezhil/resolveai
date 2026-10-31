// MCP-style tool surface the agent works through. Each tool declares its kind (read / act / control),
// how much money it can move, and which facts its result establishes. Facts come only from tool
// output, never from the model, which is what the policy engine and the verifier trust.

import type { Case, Fact } from "../core/types.js";
import type { Runtime } from "../core/runtime.js";
import type { PiiVault } from "../core/pii.js";
import { searchKb } from "../sim/kb.js";
import { fmtIST, HOUR, MIN } from "../sim/world.js";
import { orderIdFor } from "../integrations/paytm.js";

export interface ToolCtx {
  rt: Runtime;
  kase: Case;
  vault: PiiVault;
  /** Signed, single-use capability minted by the policy engine for this exact call. */
  capability?: string;
}

export type ToolKind = "read" | "act" | "control";

export interface ToolDef {
  name: string;
  kind: ToolKind;
  description: string;
  schema: Record<string, unknown>;
  /** Rupee value this call could move, for policy tiering. */
  amount?: (input: any, ctx: ToolCtx) => number | undefined;
  run: (input: any, ctx: ToolCtx) => unknown | Promise<unknown>;
  facts?: (input: any, output: any, ctx: ToolCtx) => Omit<Fact, "source" | "at">[];
}

const iso = (ts?: number) => (ts ? fmtIST(ts) : null);
const str = (description: string) => ({ type: "string" as const, description });
const num = (description: string) => ({ type: "number" as const, description });
const obj = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object" as const,
  properties,
  required,
  additionalProperties: false,
});

function need(input: any, ...keys: string[]) {
  for (const k of keys) if (input?.[k] === undefined || input[k] === "") throw new Error(`Missing required field: ${k}`);
}

function merchantOf(ctx: ToolCtx, id: string) {
  const m = ctx.rt.world.merchants.get(id);
  if (!m) throw new Error(`Unknown merchant ${id}`);
  return m;
}

const maskAcct = (a: string) => `••••${a.slice(-4)}`;

const RAW_TOOLS: ToolDef[] = [
  // ------------------------------------------------------------------ reads (L0)
  {
    name: "lookup_merchant",
    kind: "read",
    description: "Get the merchant profile: business, area, preferred language, soundbox id, KYC status and masked payout account.",
    schema: obj({ merchant_id: str("Merchant id, e.g. M1001") }, ["merchant_id"]),
    run: (i, ctx) => {
      need(i, "merchant_id");
      const m = merchantOf(ctx, i.merchant_id);
      return {
        merchant_id: m.id,
        owner: m.owner,
        business: m.business,
        area: m.area,
        phone: m.phone,
        preferred_language: m.lang,
        soundbox_id: m.soundboxId,
        kyc_status: m.kyc.status,
        payout_account: `${m.payoutAccount.bank} ${maskAcct(m.payoutAccount.accountNo)}`,
      };
    },
    facts: (i, o) => [{ key: `merchant:${i.merchant_id}`, value: { owner: o.owner, lang: o.preferred_language } }],
  },
  {
    name: "search_transactions",
    kind: "read",
    description:
      "Search the payments ledger for a merchant. Filter by exact amount and/or recency. Shows payer debit and merchant credit status for each payment.",
    schema: obj(
      {
        merchant_id: str("Merchant id"),
        amount: num("Optional exact amount in rupees"),
        since_minutes: num("Optional look-back window in minutes (default 7 days)"),
      },
      ["merchant_id"],
    ),
    run: (i, ctx) => {
      need(i, "merchant_id");
      merchantOf(ctx, i.merchant_id);
      const rows = ctx.rt.world.searchTxns(i.merchant_id, { amount: i.amount, sinceMinutes: i.since_minutes });
      return {
        count: rows.length,
        transactions: rows.slice(0, 12).map((t) => ({
          txn_id: t.txnId,
          order_id: orderIdFor(t),
          rrn: t.rrn,
          amount: t.amount,
          time: iso(t.ts),
          payer_vpa: t.payerVpa,
          payer_debit: t.payerDebit,
          merchant_credit: t.beneficiaryCredit,
          soundbox_announced: t.soundboxAnnounced,
          ...(t.remark && { payer_remark: t.remark }),
        })),
      };
    },
    facts: (_i, o) =>
      o.transactions.map((t: any) => ({
        key: `txn:${t.rrn}`,
        value: { txn_id: t.txn_id, amount: t.amount, payer_debit: t.payer_debit, merchant_credit: t.merchant_credit },
      })),
  },
  {
    name: "get_bank_status",
    kind: "read",
    description: "Ask the beneficiary bank / PSP switch for the live status of a UPI payment by RRN, including why a credit is pending.",
    schema: obj({ rrn: str("12-digit UPI RRN") }, ["rrn"]),
    run: (i, ctx) => {
      need(i, "rrn");
      const t = ctx.rt.world.txnByRrn(String(i.rrn));
      if (!t) throw new Error(`No transaction with RRN ${i.rrn}`);
      const ticket = [...ctx.rt.world.tickets.values()].find((k) => k.rrn === t.rrn);
      return {
        rrn: t.rrn,
        amount: t.amount,
        payer_debit: t.payerDebit,
        beneficiary_status: t.bankStatus,
        reason:
          t.bankStatus === "CREDIT_PENDING_AT_BENEFICIARY"
            ? "Beneficiary bank CBS timed out after debit; response not reconciled"
            : t.bankStatus === "CREDITED"
              ? `Credited to merchant at ${iso(t.creditedAt)}`
              : "Reversed to payer",
        open_ticket: ticket ? { ticket_id: ticket.ticketId, status: ticket.status, eta: iso(ticket.eta) } : null,
      };
    },
    facts: (i, o) => [{ key: `bank:${i.rrn}`, value: { status: o.beneficiary_status, debit: o.payer_debit } }],
  },
  {
    name: "paytm_order_status",
    kind: "read",
    description:
      "Paytm Payment Gateway Transaction Status API for an order: resultStatus TXN_SUCCESS / PENDING / TXN_FAILURE with the bank's RRN. Use it to confirm what Paytm's own ledger says.",
    schema: obj({ order_id: str("Order id (from search_transactions) or txn id") }, ["order_id"]),
    run: async (i, ctx) => {
      need(i, "order_id");
      return ctx.rt.paytm.orderStatus(String(i.order_id));
    },
    facts: (_i, o) => [{ key: `pg:${o.body.bankTxnId}`, value: { status: o.body.resultInfo.resultStatus, code: o.body.resultInfo.resultCode } }],
  },
  {
    name: "get_udir_status",
    kind: "read",
    description: "Check NPCI UDIR for a UPI payment: any complaint on file, the regulatory TAT rule that applies and whether we are within the window.",
    schema: obj({ rrn: str("12-digit UPI RRN") }, ["rrn"]),
    run: (i, ctx) => {
      need(i, "rrn");
      const t = ctx.rt.world.txnByRrn(String(i.rrn));
      if (!t) throw new Error(`No transaction with RRN ${i.rrn}`);
      const reversalDue = t.ts + 5 * 24 * HOUR;
      const ticket = [...ctx.rt.world.tickets.values()].find((k) => k.rrn === t.rrn);
      return {
        rrn: t.rrn,
        txn_type: "P2M",
        complaint: ticket ? { udir_ref: ticket.udirRef, status: ticket.status } : null,
        tat_rule: "RBI-TAT-UPI-P2M: resolve or auto-reverse by T+5; Rs 100/day compensation after",
        resolve_by: iso(reversalDue),
        within_window: ctx.rt.world.now() < reversalDue,
      };
    },
    facts: (i, o) => [{ key: `udir:${i.rrn}`, value: { within_window: o.within_window, resolve_by: o.resolve_by } }],
  },
  {
    name: "get_settlement_status",
    kind: "read",
    description: "List a merchant's recent settlement batches with status and any hold reason.",
    schema: obj({ merchant_id: str("Merchant id") }, ["merchant_id"]),
    run: (i, ctx) => {
      need(i, "merchant_id");
      merchantOf(ctx, i.merchant_id);
      const rows = [...ctx.rt.world.settlements.values()].filter((s) => s.merchantId === i.merchant_id);
      return {
        batches: rows.map((s) => ({
          batch_id: s.batchId,
          amount: s.amount,
          txn_count: s.txnCount,
          status: s.status,
          hold_reason: s.holdReason ?? null,
          held_since: iso(s.heldSince),
          settled_at: iso(s.settledAt),
          utr: s.utr ?? null,
        })),
      };
    },
    facts: (_i, o) => o.batches.map((b: any) => ({ key: `settlement:${b.batch_id}`, value: { status: b.status, amount: b.amount, hold_reason: b.hold_reason } })),
  },
  {
    name: "get_kyc_profile",
    kind: "read",
    description: "Get KYC status, the name on PAN, open KYC issues and the payout account holder name on file.",
    schema: obj({ merchant_id: str("Merchant id") }, ["merchant_id"]),
    run: (i, ctx) => {
      need(i, "merchant_id");
      const m = merchantOf(ctx, i.merchant_id);
      return {
        kyc_status: m.kyc.status,
        pan: m.kyc.pan,
        pan_name: m.kyc.panName,
        payout_holder_name_on_file: m.payoutAccount.holderName,
        issues: m.kyc.issues,
      };
    },
    facts: (i, o) => [{ key: `kyc:${i.merchant_id}`, value: { status: o.kyc_status, issues: o.issues } }],
  },
  {
    name: "verify_bank_account",
    kind: "read",
    description: "Run a penny-drop verification on the merchant's payout account and score the bank holder name against the PAN name.",
    schema: obj({ merchant_id: str("Merchant id") }, ["merchant_id"]),
    run: (i, ctx) => {
      need(i, "merchant_id");
      const m = merchantOf(ctx, i.merchant_id);
      const holder = m.payoutAccount.holderName;
      const contains = holder.toUpperCase().includes(m.kyc.panName.toUpperCase());
      const score = contains ? 0.91 : 0.42;
      return {
        account: `${m.payoutAccount.bank} ${maskAcct(m.payoutAccount.accountNo)}`,
        penny_drop: "SUCCESS",
        bank_holder_name: holder,
        pan_name: m.kyc.panName,
        name_match_score: score,
        note: contains ? "Proprietorship styling; PAN name contained in holder name" : "Names differ materially",
      };
    },
    facts: (i, o) => [{ key: `bankVerify:${i.merchant_id}`, value: { score: o.name_match_score, holder: o.bank_holder_name } }],
  },
  {
    name: "get_risk_signals",
    kind: "read",
    description: "Get fraud and risk signals for a merchant (SIM swap, new device, velocity anomalies).",
    schema: obj({ merchant_id: str("Merchant id") }, ["merchant_id"]),
    run: (i, ctx) => {
      need(i, "merchant_id");
      const m = merchantOf(ctx, i.merchant_id);
      return { flags: m.risk.flags.map((f) => ({ code: f.code, severity: f.severity, note: f.note, at: iso(f.at) })) };
    },
    facts: (i, o) => [{ key: `risk:${i.merchant_id}`, value: o.flags.map((f: any) => `${f.code}:${f.severity}`) }],
  },
  {
    name: "get_dispute",
    kind: "read",
    description: "List open chargebacks/disputes for a merchant with amount, reason and the representation deadline.",
    schema: obj({ merchant_id: str("Merchant id") }, ["merchant_id"]),
    run: (i, ctx) => {
      need(i, "merchant_id");
      merchantOf(ctx, i.merchant_id);
      const now = ctx.rt.world.now();
      return {
        disputes: [...ctx.rt.world.disputes.values()]
          .filter((d) => d.merchantId === i.merchant_id)
          .map((d) => ({
            dispute_id: d.disputeId,
            txn_id: d.txnId,
            amount: d.amount,
            reason: d.reason,
            status: d.status,
            deadline: iso(d.deadline),
            hours_left: Math.round(((d.deadline - now) / HOUR) * 10) / 10,
            ack_ref: d.ackRef ?? null,
          })),
      };
    },
    facts: (_i, o) => o.disputes.map((d: any) => ({ key: `dispute:${d.dispute_id}`, value: { status: d.status, hours_left: d.hours_left, amount: d.amount } })),
  },
  {
    name: "collect_dispute_evidence",
    kind: "read",
    description: "Pull QR scan, payer authentication, soundbox, invoice and device-location evidence for a dispute.",
    schema: obj({ dispute_id: str("Dispute id") }, ["dispute_id"]),
    run: (i, ctx) => {
      need(i, "dispute_id");
      const items = [...ctx.rt.world.evidence.values()].filter((e) => e.disputeId === i.dispute_id);
      if (!items.length) throw new Error(`No evidence found for ${i.dispute_id}`);
      return { evidence: items.map((e) => ({ evidence_id: e.id, kind: e.kind, summary: e.summary, time: iso(e.ts) })) };
    },
    facts: (i, o) => [{ key: `evidence:${i.dispute_id}`, value: o.evidence.map((e: any) => e.evidence_id) }],
  },
  {
    name: "search_sop",
    kind: "read",
    description: "Retrieve relevant SOPs and NPCI/RBI rules (TATs, chargeback timelines, payout-change policy). Cite the id when you rely on one.",
    schema: obj({ query: str("What you need to know") }, ["query"]),
    run: (i) => {
      need(i, "query");
      return { results: searchKb(String(i.query)).map((d) => ({ id: d.id, source: d.source, title: d.title, text: d.text })) };
    },
    facts: (_i, o) => o.results.map((r: any) => ({ key: `sop:${r.id}`, value: r.title })),
  },

  // ------------------------------------------------------------------ actions (policy-gated)
  {
    name: "raise_bank_ticket",
    kind: "act",
    description:
      "Raise a UDIR ticket with the beneficiary bank for a stuck UPI payment: PUSH_CREDIT to get the merchant credited, or REVERSAL to refund the payer. Returns the bank's committed ETA.",
    schema: obj(
      { rrn: str("12-digit UPI RRN"), kind: { type: "string", enum: ["PUSH_CREDIT", "REVERSAL"] } },
      ["rrn", "kind"],
    ),
    amount: (i, ctx) => ctx.rt.world.txnByRrn(String(i.rrn))?.amount,
    run: (i, ctx) => {
      need(i, "rrn", "kind");
      const t = ctx.rt.world.raiseBankTicket(String(i.rrn), i.kind);
      return { ticket_id: t.ticketId, udir_ref: t.udirRef, kind: t.kind, status: t.status, bank_eta: iso(t.eta) };
    },
    facts: (i, o) => [{ key: `ticket:${i.rrn}`, value: { ticket_id: o.ticket_id, eta: o.bank_eta } }],
  },
  {
    name: "set_watcher",
    kind: "control",
    description:
      "Watch a money movement and wake this case when it completes or when the deadline passes. kind TXN_CREDIT watches an RRN, SETTLEMENT a batch id, DISPUTE a dispute id.",
    schema: obj(
      {
        kind: { type: "string", enum: ["TXN_CREDIT", "SETTLEMENT", "DISPUTE"] },
        ref: str("RRN, batch id or dispute id"),
        deadline_hours: num("Escalate to a human if not complete within this many hours"),
      },
      ["kind", "ref", "deadline_hours"],
    ),
    run: (i, ctx) => {
      need(i, "kind", "ref", "deadline_hours");
      const w = ctx.rt.addWatcher(ctx.kase.id, i.kind, String(i.ref), Number(i.deadline_hours));
      return { watcher_id: w.id, kind: w.kind, ref: w.ref, escalate_if_not_done_by: iso(w.deadline) };
    },
  },
  {
    name: "send_message",
    kind: "act",
    description:
      "Send a message to the merchant or to the payer on their channel. Write in the recipient's language (Kannada script for kn, Devanagari for hi). Give exact times. Never include account numbers, PAN or phone numbers. Put an English translation in `english_gloss`.",
    schema: obj(
      {
        to: { type: "string", enum: ["merchant", "payer"] },
        text: str("Message in the recipient's language"),
        english_gloss: str("English translation for the ops console"),
      },
      ["to", "text"],
    ),
    run: (i, ctx) => {
      need(i, "to", "text");
      const msg = ctx.rt.deliverMessage(ctx.kase, i.to, ctx.vault.reveal(String(i.text)), i.english_gloss);
      return { delivered: true, message_id: msg.id, channel: msg.channel };
    },
  },
  {
    name: "initiate_refund",
    kind: "act",
    description: "Refund a payer for a specific transaction. Small refunds auto-approve; larger ones go to the human approval queue. For a duplicate debit, refund only the later of the two identical payments, for its full amount (policy P14).",
    schema: obj(
      { txn_id: str("Transaction id"), amount: num("Refund amount in rupees"), reason: str("Why") },
      ["txn_id", "amount", "reason"],
    ),
    amount: (i) => Number(i.amount),
    run: (i, ctx) => {
      need(i, "txn_id", "amount");
      const t = ctx.rt.world.txns.get(i.txn_id);
      if (!t) throw new Error(`Unknown txn ${i.txn_id}`);
      t.beneficiaryCredit = "REVERSED";
      t.bankStatus = "REVERSED_TO_PAYER";
      return { refund_id: `RFD-${t.txnId.slice(-4)}`, amount: i.amount, status: "INITIATED", eta: iso(ctx.rt.world.now() + 2 * HOUR) };
    },
  },
  {
    name: "release_settlement_hold",
    kind: "act",
    description: "Release a settlement batch that is on hold once the blocker has been cleared with tool-confirmed evidence.",
    schema: obj({ batch_id: str("Settlement batch id"), justification: str("Evidence that the blocker is cleared") }, ["batch_id", "justification"]),
    amount: (i, ctx) => ctx.rt.world.settlements.get(i.batch_id)?.amount,
    run: (i, ctx) => {
      need(i, "batch_id");
      const s = ctx.rt.world.releaseSettlement(i.batch_id) as any;
      return { batch_id: s.batchId, status: s.status, amount: s.amount, expected_payout: iso(s.expectedPayoutAt) };
    },
    facts: (i, o) => [{ key: `settlement:${i.batch_id}`, value: { status: o.status, amount: o.amount, hold_reason: null } }],
  },
  {
    name: "file_dispute_evidence",
    kind: "act",
    description: "File a chargeback representation with the collected evidence ids before the deadline. Returns the NPCI acknowledgement.",
    schema: obj(
      { dispute_id: str("Dispute id"), evidence_ids: { type: "array", items: { type: "string" } } },
      ["dispute_id", "evidence_ids"],
    ),
    amount: (i, ctx) => ctx.rt.world.disputes.get(i.dispute_id)?.amount,
    run: (i, ctx) => {
      need(i, "dispute_id", "evidence_ids");
      const d = ctx.rt.world.fileEvidence(i.dispute_id, i.evidence_ids);
      return { dispute_id: d.disputeId, status: d.status, evidence_filed: d.evidenceFiled, ack_ref: d.ackRef, filed_at: iso(ctx.rt.world.now()) };
    },
    facts: (i, o) => [{ key: `dispute:${i.dispute_id}`, value: { status: o.status, ack: o.ack_ref } }],
  },
  {
    name: "update_payout_account",
    kind: "act",
    description: "Change the bank account a merchant's settlements are paid into.",
    schema: obj(
      { merchant_id: str("Merchant id"), new_account_no: str("New account number"), new_ifsc: str("New IFSC") },
      ["merchant_id", "new_account_no", "new_ifsc"],
    ),
    amount: () => Number.POSITIVE_INFINITY,
    run: () => {
      throw new Error("unreachable: policy P1 blocks payout changes");
    },
  },

  // ------------------------------------------------------------------ control
  {
    name: "escalate_to_human",
    kind: "control",
    description:
      "Hand the case to a human with a complete case file so the customer is never re-asked. Use for fraud/risk signals, ambiguity, policy blocks, or anything you cannot verify.",
    schema: obj(
      {
        reason: str("Why a human is needed"),
        severity: { type: "string", enum: ["low", "medium", "high"] },
        root_cause: str("Root cause as far as tool evidence shows"),
        steps_taken: { type: "array", items: { type: "string" } },
        recommended_action: str("What the human should do next"),
      },
      ["reason", "severity", "root_cause", "recommended_action"],
    ),
    run: (i, ctx) => {
      need(i, "reason", "severity", "root_cause", "recommended_action");
      const file = ctx.rt.escalate(ctx.kase, {
        reason: String(i.reason),
        severity: i.severity,
        rootCause: String(i.root_cause),
        recommendedAction: String(i.recommended_action),
        stepsTaken: i.steps_taken,
      });
      return { escalated: true, queue: i.severity === "high" ? "fraud-desk" : "merchant-ops", case_file_items: file.evidence.length };
    },
  },
  {
    name: "close_case",
    kind: "control",
    description:
      "Close the case. The verifier independently re-reads the ledger/settlement/dispute systems; if the money has not actually moved, closing fails and you must keep working or wait on a watcher.",
    schema: obj({ resolution_summary: str("What was done and verified"), root_cause: str("Root cause") }, ["resolution_summary", "root_cause"]),
    run: (i, ctx) => {
      need(i, "resolution_summary", "root_cause");
      return ctx.rt.verifyAndClose(ctx.kase, String(i.resolution_summary), String(i.root_cause));
    },
  },
];

/** Every action tool sits behind the money rail: no valid capability, no execution. */
function guard(t: ToolDef): ToolDef {
  if (t.kind !== "act") return t;
  return {
    ...t,
    run: (input, ctx) => {
      ctx.rt.caps.verify(ctx.capability, { caseId: ctx.kase.id, tool: t.name, input });
      return t.run(input, ctx);
    },
  };
}

export const TOOLS: ToolDef[] = RAW_TOOLS.map(guard);
export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

/** Tool definitions in the OpenAI-compatible format that both Groq and Gemini accept. */
export function llmTools() {
  return TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.schema },
  }));
}

export const WATCH_INTERVAL = 5 * MIN;
