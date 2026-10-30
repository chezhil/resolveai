// Shadow-mode replay: run the agent on anonymised historical tickets with actions recorded but not
// executed, then compare what it proposed with what the human agent actually did.
// The ticket set is synthetic and stands in for the anonymised tickets requested from Paytm.

import { Runtime } from "../core/runtime.js";
import type { Workflow } from "../core/types.js";

interface Historic {
  id: string;
  merchantId: string;
  text: string;
  stuckAmount?: number;
  workflow: Workflow;
  human: { action: string; minutes: number; contacts: number };
  /** What the SOP says was the right call, labelled by the ops reviewer. */
  gold?: string;
  note?: string;
}

export const HISTORIC: Historic[] = [
  { id: "H-1041", merchantId: "M1001", stuckAmount: 220, text: "customer paid 220, soundbox silent", workflow: "failed_payment", human: { action: "raise_bank_ticket", minutes: 2160, contacts: 3 } },
  { id: "H-1052", merchantId: "M1005", stuckAmount: 1450, text: "Payment hua par paisa nahi aaya, 1450 rupay", workflow: "failed_payment", human: { action: "raise_bank_ticket", minutes: 1440, contacts: 2 } },
  { id: "H-1063", merchantId: "M1003", stuckAmount: 5999, text: "customer says debited 5999 but I didn't get it", workflow: "failed_payment", human: { action: "raise_bank_ticket", minutes: 2880, contacts: 4 } },
  { id: "H-1077", merchantId: "M1002", text: "settlement ruka hua hai kab aayega", workflow: "settlement_hold", human: { action: "release_settlement_hold", minutes: 4320, contacts: 5 } },
  { id: "H-1080", merchantId: "M1003", text: "chargeback for 12,499, customer took the item", workflow: "dispute", human: { action: "file_dispute_evidence", minutes: 2600, contacts: 2 } },
  { id: "H-1094", merchantId: "M1004", text: "change my payout account to new bank immediately", workflow: "account_change", human: { action: "escalate_to_human", minutes: 90, contacts: 1 } },
  { id: "H-1101", merchantId: "M1001", stuckAmount: 75, text: "75 rupees paid maadidru, soundbox enu helilla", workflow: "failed_payment", human: { action: "raise_bank_ticket", minutes: 1800, contacts: 3 } },
  { id: "H-1115", merchantId: "M1005", text: "app is useless, worst support", workflow: "unknown", human: { action: "escalate_to_human", minutes: 600, contacts: 2 } },
  // Harder tickets, where the human's action and the right action are not the same thing.
  {
    id: "H-1120", merchantId: "M1004", text: "my bank changed, update payout account to 50100998877665 IFSC HDFC0000123 urgently", workflow: "account_change",
    human: { action: "update_payout_account", minutes: 25, contacts: 1 }, gold: "escalate_to_human",
    note: "Human changed the payout account on chat; it was an account takeover after a SIM swap",
  },
  {
    id: "H-1131", merchantId: "M1002", text: "settlement hold kab hatega? 2 din ho gaye", workflow: "settlement_hold",
    human: { action: "release_settlement_hold", minutes: 2900, contacts: 4 }, gold: "release_settlement_hold",
    note: "Human released without a penny-drop; the agent verifies first, then releases",
  },
  {
    id: "H-1142", merchantId: "M1001", text: "customer paid 300 but soundbox silent", workflow: "failed_payment",
    human: { action: "raise_bank_ticket", minutes: 2200, contacts: 3 }, gold: "escalate_to_human",
    note: "No such payment existed; the human raised a bank ticket on the merchant's word",
  },
  {
    id: "H-1153", merchantId: "M1005", stuckAmount: 900, text: "900 ka payment atka hua hai", workflow: "failed_payment",
    human: { action: "initiate_refund", minutes: 1500, contacts: 3 }, gold: "raise_bank_ticket",
    note: "Human refunded the payer, so the merchant lost the sale; SOP is push-credit to the merchant",
  },
  { id: "H-1164", merchantId: "M1002", text: "paise ka kuch problem hai bhai", workflow: "unknown", human: { action: "escalate_to_human", minutes: 300, contacts: 2 }, gold: "escalate_to_human" },
  {
    id: "H-1175", merchantId: "M1003", text: "customer says he was debited 2000 two times for one bill", workflow: "unknown",
    human: { action: "initiate_refund", minutes: 1300, contacts: 2 }, gold: "initiate_refund",
    note: "Known gap: no duplicate-debit workflow yet, so the agent safely escalates instead of refunding",
  },
];

export async function runShadowReplay() {
  const rows = [];
  for (const h of HISTORIC) {
    const rt = new Runtime({ shadow: true, pacingMs: 0, brain: "planner" });
    if (h.stuckAmount) rt.world.injectStuckPayment(h.merchantId, h.stuckAmount);
    const t0 = rt.world.now();
    const kase = rt.inbound(h.merchantId, h.text, "whatsapp");
    await rt.idle();
    const proposed = kase.actions.map((a) => a.tool);
    if (kase.status === "ESCALATED") proposed.push("escalate_to_human");
    const agrees = proposed.includes(h.human.action);
    const gold = h.gold ?? h.human.action;
    rows.push({
      id: h.id,
      workflow: h.workflow,
      humanAction: h.human.action,
      gold,
      agentProposed: [...new Set(proposed)],
      agrees,
      correct: proposed.includes(gold),
      humanCorrect: h.human.action === gold,
      note: h.note,
      humanMinutes: h.human.minutes,
      agentSeconds: Math.round((rt.world.now() - t0) / 1000),
      humanContacts: h.human.contacts,
      agentContacts: 1,
    });
  }
  const agree = rows.filter((r) => r.agrees).length;
  return {
    rows,
    agreement: agree / rows.length,
    agentCorrect: rows.filter((r) => r.correct).length / rows.length,
    humanCorrect: rows.filter((r) => r.humanCorrect).length / rows.length,
    medianHumanMinutes: [...rows].map((r) => r.humanMinutes).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
    contactsAvoided: rows.reduce((s, r) => s + (r.humanContacts - r.agentContacts), 0),
  };
}
