// Knowledge base the agent retrieves from: regulator rules plus internal SOPs.
// Retrieval is a small BM25-style scorer — enough to ground answers without a vector DB.
// Internal SOP entries are illustrative and would be replaced with Paytm's own runbooks.

export interface KbDoc {
  id: string;
  source: string;
  title: string;
  text: string;
}

export const KB: KbDoc[] = [
  {
    id: "RBI-TAT-UPI-P2M",
    source: "RBI circular on harmonisation of TAT for failed transactions (Sep 2019)",
    title: "UPI P2M — customer debited, merchant not credited",
    text:
      "UPI payment to merchant: account debited but transaction confirmation not received at merchant location. " +
      "Auto-reversal must happen within T+5 days. Compensation of Rs 100 per day is payable to the customer beyond T+5.",
  },
  {
    id: "RBI-TAT-UPI-P2P",
    source: "RBI circular on harmonisation of TAT for failed transactions (Sep 2019)",
    title: "UPI — debited but beneficiary account not credited",
    text:
      "If the transaction is not credited to the beneficiary account, auto-reversal must happen by T+1. " +
      "Compensation of Rs 100 per day is payable beyond T+1.",
  },
  {
    id: "NPCI-UDIR",
    source: "NPCI Unified Dispute and Issue Resolution (UDIR)",
    title: "Raising and tracking UPI complaints online",
    text:
      "UDIR lets a PSP raise a complaint against a UPI transaction by RRN and track it to closure. " +
      "Pending-credit complaints are routed to the beneficiary bank for a push credit or reversal decision.",
  },
  {
    id: "NPCI-CHARGEBACK-AUTO",
    source: "NPCI chargeback process (2025 automation update)",
    title: "Timed chargeback handling",
    text:
      "Chargeback and representation steps are processed automatically against fixed timelines. " +
      "If the beneficiary side does not file a representation with evidence before the deadline, the chargeback is accepted against the merchant.",
  },
  {
    id: "SOP-FAILED-CREDIT",
    source: "ResolveAI SOP (illustrative)",
    title: "Soundbox silent but customer says paid",
    text:
      "Check the ledger and beneficiary bank status before the device. If payer debit is SUCCESS and merchant credit is PENDING, " +
      "raise a PUSH_CREDIT ticket via UDIR, set a watcher on the credit, and tell the merchant the exact expected time in their language. " +
      "Notify the payer so they do not pay twice. Close only after the ledger shows the credit.",
  },
  {
    id: "SOP-SETTLEMENT-NAME",
    source: "ResolveAI SOP (illustrative)",
    title: "Settlement held for bank account name mismatch",
    text:
      "Run penny-drop verification on the payout account. If the bank holder name contains the PAN name with match score at least 0.85 " +
      "(for example a proprietorship styled 'SHOP NAME PROP OWNER NAME'), the hold can be released. Releases above Rs 10,000 need one-click approval from an ops lead.",
  },
  {
    id: "SOP-DISPUTE-EVIDENCE",
    source: "ResolveAI SOP (illustrative)",
    title: "Representation for goods-not-received chargebacks",
    text:
      "Collect QR scan log, payer authentication, soundbox announcement, invoice and device geo evidence. " +
      "File the representation well before the deadline and record the NPCI acknowledgement reference.",
  },
  {
    id: "SOP-PAYOUT-CHANGE",
    source: "ResolveAI SOP (illustrative)",
    title: "Payout bank account change requests",
    text:
      "Support channels, human or AI, must never change a merchant payout account. Changes go only through in-app re-KYC with video verification. " +
      "Urgent requests combined with SIM swap or new-device signals are a known social-engineering pattern: escalate to the fraud desk.",
  },
  {
    id: "SOP-COMMS",
    source: "ResolveAI SOP (illustrative)",
    title: "How to talk to merchants",
    text:
      "Reply in the merchant's language. Give an exact time, not a range. Never ask the merchant to raise another ticket. " +
      "Never include full account numbers, PAN or phone numbers in messages.",
  },
];

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

export function searchKb(query: string, k = 3) {
  const q = tokenize(query);
  const docs = KB.map((d) => ({ d, toks: tokenize(`${d.title} ${d.text}`) }));
  const avg = docs.reduce((s, x) => s + x.toks.length, 0) / docs.length;
  const df = (w: string) => docs.filter((x) => x.toks.includes(w)).length;
  const scored = docs.map(({ d, toks }) => {
    let score = 0;
    for (const w of new Set(q)) {
      const tf = toks.filter((t) => t === w).length;
      if (!tf) continue;
      const idf = Math.log(1 + (docs.length - df(w) + 0.5) / (df(w) + 0.5));
      score += idf * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (toks.length / avg))));
    }
    return { ...d, score: Number(score.toFixed(3)) };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}
