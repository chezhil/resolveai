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
    rows.push({
      id: h.id,
      workflow: h.workflow,
      humanAction: h.human.action,
      agentProposed: [...new Set(proposed)],
      agrees,
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
    medianHumanMinutes: [...rows].map((r) => r.humanMinutes).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
    contactsAvoided: rows.reduce((s, r) => s + (r.humanContacts - r.agentContacts), 0),
  };
}
