# Demo script (3–4 minutes)

Setup: `npm run dev`, open http://localhost:5173, click **Reset**. Set the browser window to at least 1400px wide so the three columns fit.

## 0:00 · The hook (Console tab)

> "Manjunath was paid. His soundbox stayed silent. Today he raises a ticket and waits for days. Watch our teammate close it in minutes."

Click **A · Manjunath's ₹480**.

Point at, in order:
- **HEAR**: the Kannada voice note, language detection, and *"What the model sees"* (PII redacted).
- **PLAN**: *"Check the ledger first, not the device."* The agent searches the ledger and finds the ₹480 debit with the credit pending, among the healthy payments.
- **CHECK**: policy `P3 · P4` allows the bank ticket because the debit and the pending credit are **tool-confirmed** and the ticket is reversible (L1).
- The phone gets a **Kannada** reply with the **exact** time (EN gloss below it). The payer gets *"don't pay again."*
- Case file: L0 → L1 lit, confirmed facts with their source tool, and a watcher armed.

> "It doesn't say 'raise a request'. It raised it, promised an exact time, and it keeps the case open until the money lands."

Click **+1 day** (sim clock). The watcher fires, the agent **re-reads** the bank, the soundbox announces the credit (turn on 🔊 voice), and the verifier closes: **Verified & closed**.

## 1:15 · Policy decides (B)

Click **B · Priya's ₹1.84 L settlement** (Hinglish).
- Penny-drop: *"PRIYA FASHIONS PROP PRIYA SHARMA"* contains the PAN name (0.91).
- The release is above the L1 cap, so it lands in the **one-click approval** card (L2). The merchant is told what happens next.
- Click **Approve**, then **+1 day**. It closes only once the **UTR** exists.

## 2:00 · Guardrails (D + outage)

Click **D · "Change my payout account, urgent"**.
- The account and phone are tokenised (`<ACCOUNT_1>`, `<PHONE_1>`) before the model sees them.
- The agent proposes the change, and **P1 BLOCKS** it. A live SIM-swap flag (P2) forces L3.
- The fraud desk gets a full **case file**: root cause, steps, evidence, recommended action.

Toggle **Model outage**, run **F**, and the case **fails safe** to humans. Toggle it back off.

## 2:45 · Proactive + proof

Click **E**: a stuck payment is caught on the event stream and the merchant hears first.

**Evals & shadow** tab → **Run with offline planner**: 13/13 golden cases asserted on the ledger, settlement and dispute systems, plus shadow-replay agreement with human actions.

**Audit log** → **Tamper demo**: the chain breaks at the edited entry.

**Impact** tab: ₹2.46 Cr/month at pilot targets; drag the sliders.

## Closing line

> "Not a chatbot. A teammate that gets the job done. L0 to L3 bounded autonomy, minutes not days, and one owner per case to confirmed closure."
