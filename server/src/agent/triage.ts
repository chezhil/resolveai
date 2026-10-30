// HEAR stage: deterministic triage of an inbound message before any model sees it.

import type { Lang, Workflow } from "../core/types.js";
import { detectLang } from "../sim/lang.js";

export interface Triage {
  lang: Lang;
  workflow: Workflow;
  amount?: number;
  angry: boolean;
  /** The message tries to instruct the agent (prompt injection / fake authority). */
  injection: boolean;
  signals: string[];
}

const RULES: { wf: Workflow; re: RegExp; signal: string }[] = [
  { wf: "account_change", re: /(change|update|new|badal|switch).{0,40}(account|bank|ifsc|payout)|(account|bank).{0,20}(change|update|badal)/i, signal: "payout-account change request" },
  { wf: "dispute", re: /charge ?back|dispute|claim(ed)? .*not received|representation/i, signal: "chargeback / dispute" },
  { wf: "settlement_hold", re: /settlement|payout|ruka|hold|settle/i, signal: "settlement not received" },
  { wf: "failed_payment", re: /soundbox|sound box|paid|pay maad|maadidru|debit|deduct|not credit|helilla|kat gaya|payment|ಪಾವತಿ|ಹಣ|पेमेंट|पैसा/i, signal: "paid but not received" },
];

const INJECTION =
  /ignore (all |any |your |the )?(previous |prior |above )?(instructions|rules|polic)|system (override|prompt|event)|\[(system|event)|you are now|developer mode|approved by (paytm|admin|ops)|disregard (the|your|all)|new instructions/i;

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
  // "₹480", "rs 480", "480 rupees", and also "paid 300" / "debited 2000" / "300 ka payment".
  const m =
    text.match(/(?:₹|rs\.?|inr|rupees?)\s*([\d,]+(?:\.\d+)?)|([\d,]{2,})\s*(?:₹|rs|rupees?|rupay)/i) ??
    text.match(/\b(?:paid|pay|payment of|debited|deducted|kat(?:a|e)?|sent)\s+(?:of\s+)?([\d,]{2,9})\b|\b([\d,]{2,9})\s+(?:ka|ki|ke)\s+payment/i);
  const amount = m ? Number((m[1] ?? m[2]).replace(/,/g, "")) : undefined;
  const angry = /fraud|cheat|police|court|worst|scam|useless|bakwas|!!/i.test(text);
  if (angry) signals.push("frustrated customer");
  if (/urgent|immediately|right now|jaldi/i.test(text)) signals.push("urgency pressure");
  const injection = INJECTION.test(text);
  if (injection) signals.push("prompt-injection attempt");
  return { lang: detectLang(text, fallbackLang), workflow, amount, angry, injection, signals };
}
