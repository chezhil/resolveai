// HEAR stage: deterministic triage of an inbound message before any model sees it.

import type { Lang, Workflow } from "../core/types.js";
import { detectLang } from "../sim/lang.js";

export interface Triage {
  lang: Lang;
  workflow: Workflow;
  amount?: number;
  angry: boolean;
  signals: string[];
}

const RULES: { wf: Workflow; re: RegExp; signal: string }[] = [
  { wf: "account_change", re: /(change|update|new|badal|switch).{0,40}(account|bank|ifsc|payout)|(account|bank).{0,20}(change|update|badal)/i, signal: "payout-account change request" },
  { wf: "dispute", re: /charge ?back|dispute|claim(ed)? .*not received|representation/i, signal: "chargeback / dispute" },
  { wf: "settlement_hold", re: /settlement|payout|ruka|hold|settle/i, signal: "settlement not received" },
  { wf: "failed_payment", re: /soundbox|sound box|paid|pay maad|maadidru|debit|deduct|not credit|helilla|kat gaya|payment|ಪಾವತಿ|ಹಣ|पेमेंट|पैसा/i, signal: "paid but not received" },
];

export function triage(text: string, fallbackLang: Lang): Triage {
  const signals: string[] = [];
  let workflow: Workflow = "unknown";
  for (const r of RULES) {
    if (r.re.test(text)) {
      workflow = r.wf;
      signals.push(r.signal);
      break;
    }
  }
  const m = text.match(/(?:₹|rs\.?|inr|rupees?)\s*([\d,]+(?:\.\d+)?)|([\d,]{2,})\s*(?:₹|rs|rupees?|rupay)/i);
  const amount = m ? Number((m[1] ?? m[2]).replace(/,/g, "")) : undefined;
  const angry = /fraud|cheat|police|court|worst|scam|useless|bakwas|!!/i.test(text);
  if (angry) signals.push("frustrated customer");
  if (/urgent|immediately|right now|jaldi/i.test(text)) signals.push("urgency pressure");
  return { lang: detectLang(text, fallbackLang), workflow, amount, angry, signals };
}
