# ResolveAI: README for the next teammate

Read this first, then [HANDOFF.md](HANDOFF.md) (the full system guide from Chezhil). This file covers only what changed after that handoff and what is left. Written 30 Oct 2026, the night before the offline finals on 31 Oct.

## 1. What changed since HANDOFF.md

All work is on the local branch `feature/finals-polish`, cut from `main` at `63113c8`. **It is not committed or pushed yet.** Check `git status` first.

| Change | Files |
|---|---|
| **Duplicate-debit workflow** (the one shadow-replay miss, H-1175). Triage detects "debited twice", the planner confirms two identical credited payments in the ledger, refunds only the later one, tells merchant and payer, and the verifier closes. | `agent/triage.ts`, `agent/planner.ts` (`duplicateDebit`), `core/types.ts` (`Workflow`), `sim/lang.ts` (3 templates: `duplicateMerchant`, `duplicatePayer`, `duplicatePending`) |
| **Policy P14**: a duplicate refund must be the later payment, the full amount, same payer, same amount, within 15 minutes, both seen in this case's ledger lookup. Above ₹2,000 it needs one-click approval like any refund. `duplicate_debit` may only use `initiate_refund` and `send_message` (P11). | `policy/engine.ts` |
| **Simulated world**: `World.injectDuplicateDebit(merchantId, amount, payer?)` creates two credited payments 6 and 4 minutes ago. | `sim/world.ts` |
| **Scenario G** ("Customer paid ₹1,800 twice", Arjun Electronics) appears in the console automatically. | `sim/scenarios.ts` |
| **4 new golden cases**: G18 happy path, G19 two different payers is not a duplicate (escalates), G20 large refund needs approval then executes, G21 P14 blocks refunding the earlier payment or a partial amount. Shadow ticket H-1175 now seeds a real duplicate. | `evals/golden.ts`, `evals/shadow.ts` |
| **Guided demo** card at the top of the console: A, next morning, B, two approvals, D, G, with a caption per step. Uses only the existing API. | `web/src/components/DemoGuide.tsx`, `web/src/views/Console.tsx` |
| Docs: counts updated to 32 golden cases and 100% shadow. | `README.md`, `docs/DEMO.md` |

## 2. Verified (30 Oct, local, offline planner)

- `npm run typecheck` clean, 17 unit tests pass, **32/32 golden cases** pass.
- Shadow replay: agent right on **14/14** tickets (was 13/14), humans 79%.
- Production build served locally; clicked through the guided demo in a browser. Results: A resolved, B at L2 waiting for payout, D escalated L3, G (duplicate debit) resolved L1.

## 3. Not verified, open risks

1. **Groq/Gemini have still never run.** No API key is set anywhere. `npm run eval -- --llm` has not been run, so the LLM prompt and tool schemas are untested, and the new duplicate path is only proven for the offline planner. The system prompt in `agent/llm.ts` does not mention duplicate debits; if you use the LLM brain, add a line about it and run the golden cases. For the live demo keep `BRAIN=planner` unless the LLM evals pass.
2. **Possible intermittent race, seen once, not reproduced.** In one browser run of the guided demo, case A (failed payment) showed an extra "Escalated to merchant ops with case file" trace at +24h and ended with max level L3, though it still verified and closed. Three API reruns of the same sequence (A, jump 1,440 min, then B) were clean (L1). If you see it again, look at `checkWatchers` and `drive` in `core/runtime.ts` (`systemEscalate` after a "Waiting on the bank" turn with no watcher event). Using +26 hours instead of +1 day (what the golden cases use) avoids the 24-hour boundary.
3. **Sarvam voice, Twilio WhatsApp and the Gist anchor sink** are unchanged and still never run against the real services (see HANDOFF §9).
4. **Scenario B after approval stays "WATCHING"** until you jump the clock again (+3 hours) so the UTR exists. The guided demo does not do that step for you. Click **+1 day** after step 4.
5. **Scenario G has not been run on the live Railway site**, only locally.

## 4. Before you push (read this)

- **Every push to `main` auto-deploys to Railway and restarts the app, wiping every in-progress demo session.** Do not push to `main` while judges are using the site. Work on the branch, open a PR, and merge only when CI is green and nobody is demoing.
- Railway deploys even when CI fails unless "Wait for CI" is enabled in the Railway dashboard.
- Suggested order tonight: commit the branch, push it (not `main`), let CI run, open a PR, merge early tomorrow before judging starts, then open the live site and run scenario G once to confirm.
- Accept the GitHub invitation if you have not: https://github.com/chezhil/resolveai/invitations (invites expire after 7 days).

## 5. Commands

```bash
npm install              # Node 22.13+ (CI uses 24)
npm run dev              # API :8787 + console :5173
npm test                 # unit tests + golden suite
npm run eval             # golden cases + shadow replay, readable output
npm run eval -- --llm    # same against Groq then Gemini (needs keys in .env)
npm run typecheck
npm start                # production build, one process on $PORT
```

Note: `npm install` may rewrite `package-lock.json` (removes `libc` fields) on some npm versions. Run `git checkout package-lock.json` before you commit.

## 6. What to do next, in order

1. **Tonight:** commit and push the branch (see §4), confirm CI is green.
2. **Tonight:** get a Groq key, put it in `.env`, run `npm run eval -- --llm`, and fix the prompt until the cases pass. If it is flaky, keep the planner for the demo and say so honestly.
3. **Tomorrow before judging:** rehearse [DEMO.md](DEMO.md) on the live URL with `?room=judges`. Record a 60 to 90 second backup video in case the venue Wi-Fi fails.
4. **Freeze `main`** before judging starts.
5. **After the finals:** persistent rooms (SQLite or Redis), real Paytm PG sandbox behind the `PaytmPg` interface, LLM evals in CI behind a secret, branch protection plus "Wait for CI" on Railway.

## 7. How to add another workflow (the pattern used for duplicate debit)

1. `core/types.ts`: add to `Workflow`.
2. `agent/triage.ts`: add a regex rule (order matters: put specific rules before generic ones like "debit").
3. `policy/engine.ts`: add the workflow to `WORKFLOW_TOOLS` (P11) and any new rule to `RULES`.
4. `agent/planner.ts`: add a `case` in `next()` and a phase-based method like `duplicateDebit`.
5. `sim/lang.ts`: add reply templates (English plus Kannada or Hindi where you can).
6. `evals/golden.ts`: add a happy path, a near-miss, an approval path and a policy-block case. Assert on world state, not on the agent's words.
7. `sim/scenarios.ts` and, if useful, a step in `DemoGuide.tsx`.

## 8. Judge answers specific to the new work

- **"Can it refund the wrong payment?"** No. P14 only allows the later payment, for the full amount, with both payments confirmed in the ledger in this case. G21 proves it, and G19 proves a look-alike from another payer is not refunded.
- **"What about large duplicates?"** Above ₹2,000 it goes to one-click human approval (L2), and above ₹1 L it needs two people (G20).
- **"Are the 100% shadow numbers real?"** They are on 14 synthetic tickets we wrote, so they show the workflow works, not field accuracy. The ask to Paytm is real anonymised tickets.
