# Demo script (3–4 minutes)

Setup: `npm run dev`, open http://localhost:5173, click **Reset**. Set the browser window to at least 1400px wide so the three columns fit.

## 0:00 · The hook (Console tab)

> "Manjunath was paid. His soundbox stayed silent. Today he raises a ticket and waits for days. Watch our teammate close it in minutes."

Click **A · Manjunath's ₹480**.

Point at, in order:
- **HEAR**: the Kannada voice note, language detection, and *"What the model sees"* (PII redacted).
- **PLAN**: *"Check the ledger first, not the device."* The agent searches the ledger and finds the ₹480 debit with the credit pending, among the healthy payments, then confirms with Paytm PG's transaction status (`PENDING / 402`), the bank and UDIR.
- **CHECK**: policy `P3 · P4` allows the bank ticket because the debit and the pending credit are **tool-confirmed** and the ticket is reversible (L1).
- The phone gets a **Kannada** reply with the **exact** time (EN gloss below it). The payer gets *"don't pay again."*
- Case file: L0 → L1 lit, confirmed facts with their source tool, and a watcher armed.

> "It doesn't say 'raise a request'. It raised it, promised an exact time, and it keeps the case open until the money lands."

Click **+1 day** (sim clock). The watcher fires, the agent **re-reads** the bank, the soundbox announces the credit (turn on 🔊 voice), and the verifier closes: **Verified & closed**. Tap ▶ listen on the Kannada reply, then give it ★★★★★.

## 1:15 · Policy decides (B)

Click **B · Priya's ₹1.84 L settlement** (Hinglish).
- Penny-drop: *"PRIYA FASHIONS PROP PRIYA SHARMA"* contains the PAN name (0.91).
- The release is above the L1 cap, so it lands in the **one-click approval** card (L2). The merchant is told what happens next.
- It's above ₹1 L, so the **two-person rule** applies: click **Approve as Ops lead**, show that the same button is now disabled, then click **Approve as Risk lead**. Then **+1 day**. It closes only once the **UTR** exists.

## Optional · Guided demo

The **Guided demo** card at the top of the console walks A → +1 day → B → two approvals → D → G with a caption per step. Use it if you want the stepper to drive, or ignore it and click scenarios yourself. Scenario **G** (duplicate debit) shows the later of two identical payments refunded and the earlier one untouched.

## 2:00 · Guardrails (D + outage)

Click **D · "Change my payout account, urgent"**.
- The account and phone are tokenised (`<ACCOUNT_1>`, `<PHONE_1>`) before the model sees them.
- The agent proposes the change, and **P1 BLOCKS** it. A live SIM-swap flag (P2) forces L3.
- The fraud desk gets a full **case file**: root cause, steps, evidence, recommended action.

Toggle **Model outage** and run **A**: the *Degraded mode* banner appears and the offline planner still resolves it through the same policy engine. Line: "If Groq and Gemini both go down, merchants don't notice. If a model dies after it has moved money, we never replay it; a human gets the case file." Toggle it back off.

## 2:45 · Proactive + proof

Click **E**: a stuck payment is caught on the event stream and the merchant hears first.

**Evals & shadow** tab → **Run with offline planner** (or Groq → Gemini if keys are set): 35/35 golden cases, including 11 red-team attacks (forged and replayed capabilities, double approval, message floods, repeated injection, least privilege, velocity, history rewrite, PII leaks), asserted on the ledger, settlement and dispute systems. In the shadow replay the agent makes the right call on 100% of tickets vs 79% for humans. Be upfront that the 14 tickets are synthetic.

**Audit log** → **Tamper: rewrite chain**: the attacker re-hashes everything so the chain still says *valid*, yet the published anchors flag the rewrite. Say: "even someone with database access can't rewrite history quietly."

**Impact** tab → *Security posture*: signed capabilities issued and refused, PII vaults shredded, anchors published, first-action latency.

**Impact** tab: ₹2.46 Cr/month at pilot targets; drag the sliders.

## Closing line

> "Not a chatbot. A teammate that gets the job done. L0 to L3 bounded autonomy, minutes not days, and one owner per case to confirmed closure."

## Bonus: a late bank message (scenario H)

Run scenario H (a 4,500 rupee duplicate debit). The refund waits for approval and the card lists the facts it rests on. Click Simulate late bank reversal: the approval is quarantined, cannot be signed, and the case goes to a human with the changed fact attached. Wait for the agent to finish each step before moving the clock.

