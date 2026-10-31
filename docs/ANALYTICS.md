# Analytics and proof

The page at `/app/analytics` answers one question: does ResolveAI actually work, and compared with what? Nothing on it is typed in. Every figure is computed from the running system, and every limit is stated on the page itself (the **Method and limits** note at the bottom).

![The Analytics page](media/08-analytics.png)

## Where the numbers come from

| Figure | Source | Computed by |
|---|---|---|
| Right calls, agent vs human (14/14 vs 11/14) | Shadow replay of 14 historical tickets | `server/src/evals/shadow.ts` → `GET /api/proof` |
| Median time to a decision (28 h vs 17 s) | The same replay: the ticket's recorded human minutes, and the agent's seconds on the **simulated clock** | `summarise()` in `web/src/lib/analytics.ts` |
| Contacts avoided (23) | Human contacts per ticket minus one agent contact | same |
| Golden cases (35/35), checks (106/106), red-team (11/11) | The golden suite on the offline planner | `server/src/evals/golden.ts` |
| Per-case duration chart, p50 / p95 | Wall-clock compute per golden case, demo pacing off | `goldenLatency()` |
| Policy refusals (forged call, replay, injection, forged approval, payout change by chat, PII leak) | The golden cases that assert those refusals (R01, R02, G14, G16, G06, R11) | `Refusals` in `Analytics.tsx` |
| Session charts (outcomes, verdicts, levels, workflows, ₹ waiting) | Your room's live snapshot, from the cases you have run | `sessionStats()` |

## How to read it honestly

- **The tickets are synthetic.** The 14 replay tickets stand in for the anonymised tickets we would ask Paytm for. A reviewer labelled the right action for each. Treat the percentages as a method demonstration, not a production measurement.
- **The planner was written against these workflows**, so it is expected to do well on them. The LLM path runs through the same tools, policy and verifier, but only when a model key is configured.
- **Time is time to a decision, not time to money.** Agent seconds are on the simulated clock in shadow mode. A case still waits for the real bank or settlement event; that is the watcher and the verifier.
- **14 tickets cannot carry a confidence interval.** The next step is a 30-day shadow pilot on real tickets.
- **A blocked attempt is not an action.** On ticket H-1120 the agent attempts the payout change, policy returns `BLOCK`, and the agent escalates. The page shows that as "Policy blocked", not as something the agent did.

## The page, top to bottom

1. **Headline band**: five numbers, each with its comparison.
2. **Time to a decision, ticket by ticket**: a log-scale dumbbell, human against agent. A coral ring marks a ticket where the human's action was wrong.
3. **Right call, by workflow**: agent and human accuracy per workflow.
4. **Where the human call was wrong**: one card per miss, with the agent's action and any policy-blocked attempt.
5. **Golden suite by category**, **speed of the loop**, **what the policy engine refuses**.
6. **This session**: what the agent is doing right now. Press **Run all demo scenarios** to fill it.
7. **Why teams would use it**: a capability matrix against an FAQ bot and a human working across five tabs, and a side-by-side of one merchant's day. The ResolveAI column links to evidence above; the other two columns describe the typical setup and are not a measurement of any product.
8. **Method and limits**.

## The data endpoint

`GET /api/proof` returns `{ brain, golden, shadow, policyRules, generatedAt, ttlSeconds }`.

- One run is shared by every visitor for `PROOF_TTL_MS` (default 10 minutes), so a landing-page view never re-runs the suite. First call about 1 s, then milliseconds.
- It needs no room, so a visit allocates nothing.
- It is rate limited per IP (30 per minute). **Behind Railway the per-IP limiters may not take effect**; see [HANDOFF.md](HANDOFF.md) §8 (`TRUST_PROXY_HOPS`).
- `POST /api/evals/run` (the **Re-run the evidence** button, and the Evals tab) still runs a fresh suite, rate limited to 6 per minute.

## Where else it appears

- **Landing page → Proof**: the headline numbers are fetched live; a labelled static fallback shows only if the API is unreachable. Below them, a human-against-agent timeline and accuracy bars animate in from the same data.
- **Landing page → hero**: three live chips (golden cases, red-team, replayed tickets).

## Checking it yourself

```bash
npm start                                   # or npm run dev
node scripts/verify-analytics.mjs http://localhost:8787
```

The script (Chrome required, like the other `verify-*` scripts) checks the landing proof, the Analytics page and its charts, `/api/proof` caching and rate limiting, the core scenarios (A resolves, D escalates, B waits for approval), motion and reduced-motion behaviour, and phone width. Against a remote host it reports the rate limiter as a warning instead of failing.
