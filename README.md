# ResolveAI ✓

**The AI teammate that closes the loop on every stuck rupee.**

An autonomous customer-service teammate for Paytm merchants and customers. It diagnoses, decides, acts across systems, verifies that the money moved, and hands off to humans only when it should.

> Paytm Build for India AI Hackathon, Bengaluru · **Track 3: Autonomous AI Teammates** · Team **TACO-HUNTERS** (Saksham Singh, Hamza Shaikh, Chezhil S)

**▶ Live demo: [resolveai-production-99b1.up.railway.app](https://resolveai-production-99b1.up.railway.app)** (no login; every visitor gets their own sandbox)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/chezhil/resolveai) &nbsp; ![CI](https://github.com/chezhil/resolveai/actions/workflows/ci.yml/badge.svg)

![ResolveAI resolving Manjunath's ₹480: Kannada voice note → ledger + Paytm PG + bank + UDIR diagnosis → L1 push-credit ticket → exact-time reply in Kannada → watcher fires next morning → verified and closed](docs/media/demo.gif)

![ResolveAI landing page](docs/media/00-landing.png)

## At a glance

| 35 / 35 | 11 / 11 | 14 / 14 vs 11 / 14 | 28 h → 17 s | ~1 ms |
|---|---|---|---|---|
| golden cases pass (106 checks) | red-team attacks contained | right calls on replayed tickets, agent vs human agents | median time to a decision, human vs agent | p50 compute to the first action (offline planner) |

Every figure is computed live by the running server on the [Analytics page](#analytics-and-proof), not typed in. The tickets are synthetic stand-ins and time is time to a decision, not time to money; the method and limits are written out in [docs/ANALYTICS.md](docs/ANALYTICS.md).

---

> **Taking over the project?** Start with [docs/HANDOFF.md](docs/HANDOFF.md): status, architecture, how to change the frontend and backend, deployment, and what to do next.

## The problem

> *Manjunath was paid. His soundbox stayed silent.* A customer shows a ₹480 debit. Manjunath sees nothing, and the breakfast queue keeps growing. Support tells him to raise a ticket and wait for a callback.

When money gets stuck, five systems (ledger, bank/PSP, NPCI UDIR, settlement, KYC/risk) and three teams get involved. FAQ bots explain the policy and then hand off; human agents can fix it but work through 5+ tabs, one case at a time. **Everyone helps. Nobody finishes.**

## What ResolveAI does

ResolveAI owns the case from **first signal to confirmed closure**:

| 01 Detect | 02 Diagnose | 03 Decide | 04 Act | 05 Verify & close |
|---|---|---|---|---|
| WhatsApp, in-app, voice notes *and* the payment event stream (proactive) | Correlates Paytm PG, ledger, bank and UDIR for the root cause | The LLM proposes; a **deterministic policy engine** approves, caps or blocks | Bank tickets, settlement releases, dispute evidence, watchers, messages | Re-reads the systems of record; closes only when the money actually moved |

**Bounded autonomy: the model proposes, policy decides.**

| Level | Meaning | Example in this repo |
|---|---|---|
| **L0** Inform | Read-only answers from live state | Every lookup tool |
| **L1** Act within limits | Low-value, reversible, auto-approved | Push-credit bank ticket, dispute evidence filing, refunds ≤ ₹2,000 |
| **L2** Act with approval | Higher value: one-click human confirm | Releasing a ₹1,84,300 settlement hold |
| **L3** Escalate | Fraud signals, ambiguity, angry user | Payout-account change during a SIM swap |

| | |
|---|---|
| ![Console: failed payment](docs/media/01-console-failed-payment.png) | ![Verified and closed](docs/media/02-verified-and-closed.png) |
| **Hear → Plan → Check → Act:** a Kannada voice note, ledger match, bank ticket and an exact-time reply | **Verify:** the watcher fires, the agent re-reads the bank, and the case closes only when the money moved |
| ![L2 approval](docs/media/03-l2-approval.png) | ![Guardrail escalation](docs/media/04-guardrail-escalation.png) |
| **L2:** penny-drop clears the blocker, then one-click human approval | **L3:** PII redacted, payout change blocked by policy, fraud desk gets the case file |
| ![Evals](docs/media/05-evals.png) | ![Audit tamper](docs/media/06-audit-tamper.png) |
| **35/35 golden cases, incl. 11 red-team attacks** + shadow replay against human decisions | **Anchored audit log:** even a full re-hash of the chain contradicts the published anchors |

![Merchant view at phone width](docs/media/07-mobile.png)

## Features

- **Voice and language:** Kannada, Hindi and English (romanised too), voice notes through Sarvam speech recognition, spoken replies, and a console in seven languages.
- **Five workflows:** failed payment, settlement hold, dispute evidence, duplicate debit, and account-change requests, plus proactive detection of stuck payments before the merchant complains.
- **21 tools** (12 read, 6 act, 3 control) behind a signed-capability gate, shaped like MCP tools.
- **15 policy rules (P0 to P14):** grounding, value tiers, least privilege, velocity, two-person approval, injection handling, never change a payout from chat.
- **Verifier and watchers:** a case closes only after the systems of record show the money moved, and watchers re-check the bank on the simulated clock.
- **Belief invalidation:** an approval records the facts it rests on; if the bank changes one mid-decision, the approval is quarantined and the case escalates.
- **Degraded mode:** if both models fail, a circuit breaker hands cases to the deterministic planner under the same policy engine; a case that already acted fails safe to a human.
- **PII vault:** sensitive values are tokenised before the model sees them, kept encrypted, and shredded when the case closes.
- **Tamper-evident audit log:** hash-chained, HMAC-signed anchors published outside the runtime.
- **Analytics and proof, evals, shadow mode:** see below.
- **MCP server and plugins page:** other agents can open and read cases; connector status and tests are in the console.
- **Real WhatsApp** through Twilio, with signature verification (optional).

## Built with

TypeScript throughout. **Backend:** Node.js with Express 5, Zod validation, SQLite (`node:sqlite`) for cases and the audit chain. **Frontend:** React, Vite, Tailwind and GSAP, live over server-sent events. **AI:** Groq and Gemini for reasoning, Sarvam AI for Indic voice and translation, and a deterministic offline planner as the fallback. **Channels and protocols:** Twilio WhatsApp and an MCP server. **Quality:** Vitest, the golden eval suite, and GitHub Actions CI. **Deploy:** Docker on Railway or Render.

## Run it

Requires Node 22.13+ (Node 24 recommended).

```bash
npm install
```

```bash
npm run dev
```

Open **http://localhost:5173**. The API runs on :8787.

**No API key needed for the demo.** Without keys, the agent runs on a deterministic offline planner that goes through the *same* tools, policy engine, verifier and audit log as the LLM. Add keys to switch the brain to Groq (with Gemini as the fallback):

```bash
cp .env.example .env
```

Then set `GROQ_API_KEY` and/or `GEMINI_API_KEY` in `.env`. Single-process production build (serves the console from the API server):

```bash
npm start
```

### Deploy

- **Render:** click the button above. It uses [`render.yaml`](render.yaml) and the [`Dockerfile`](Dockerfile); add your keys as environment variables.
- **Railway / Fly / any Docker host:** `docker build -t resolveai . && docker run -p 8080:8080 --env-file .env resolveai`. [`railway.json`](railway.json) is included.

Every visitor gets an **isolated room**: their own simulated world, cases and audit log. Share a room with `?room=<name>` so judges can co-watch one session. Cases and the audit chain are archived to SQLite (`DB_PATH`, default `data/resolveai.db`); mount a volume to keep them across redeploys.

## Demo in 3 minutes

The full script is in [docs/DEMO.md](docs/DEMO.md).

1. **A · Manjunath's ₹480** (Kannada voice note). Watch Hear → Plan → Check → Act: ledger match, Paytm PG order status (`PENDING / 402`), bank and UDIR checks, an L1 push-credit ticket, a reply in Kannada with the **exact** time, and the payer is told not to pay twice. Click **+1 day**: the watcher fires, the agent re-reads the bank, the soundbox announces *"₹480 received"*, the verifier closes the case, and the merchant taps a ★ rating.
2. **B · Priya's ₹1.84 L settlement** (Hinglish). Penny-drop verification clears a name-mismatch hold, and the release lands in the **L2 approval queue**. Above ₹1 L it needs **two different approvers** (Ops lead + Risk lead). Approve both, then jump the clock; the case closes only when a UTR exists.
3. **C · Arjun's chargeback.** Five evidence items (QR scan, PIN auth, soundbox log, invoice, geo) are filed a day before the deadline, with an NPCI ack.
4. **D · "Change my payout account, urgent."** PII is redacted before the model sees it (`<ACCOUNT_1>`, `<PHONE_1>`). Policy **P1 blocks** the change, the SIM-swap risk flag forces L3, and the fraud desk gets a complete case file.
5. **E · Proactive.** A stuck ₹2,350 payment is detected on the event stream after 10 minutes, and the merchant hears from us before they complain.
6. Toggle **Model outage**, then run **A**: a *Degraded mode* banner appears and the deterministic planner resolves the case through the same policy engine. If a model dies mid-case *after* a money action, the case fails safe to a human instead of replaying it.
7. **Evals & shadow** tab: 35/35 golden cases, including 11 red-team attacks, plus the shadow replay. **Audit log** tab: **Tamper: rewrite chain** re-hashes the whole chain so it still "verifies", and the published anchors catch it anyway.

## Architecture

```mermaid
flowchart LR
  subgraph Hear
    WA[WhatsApp via Twilio / console] --> ASR[Sarvam ASR for voice notes]
    ASR --> T[Triage: language, intent, injection, signals]
    EV[Payment event stream] --> D[Stuck-payment detector]
    T --> R[PII redaction vault]
    D --> R
  end
  R --> B{Brain}
  B -->|primary| G[Groq]
  B -->|fallback| GM[Gemini]
  B -->|offline| P[Deterministic planner]
  B -->|proposed tool call| PE[Policy engine L0–L3]
  PE -->|ALLOW| TL[MCP-style tools]
  PE -->|NEEDS_APPROVAL| AQ[Approval queue]
  PE -->|BLOCK / ESCALATE| H[Human queue + case file]
  TL --> SYS[(Paytm PG · Ledger · Bank/PSP · UDIR · Settlement · KYC/Risk · Disputes)]
  TL --> W[Watchers]
  W -->|money moved| V[Verifier re-reads systems]
  V -->|verified| C[Close · notify · soundbox · CSAT]
  W -->|deadline passed| H
  subgraph Spine
    AL[Hash-chained audit log]
    CM[Case memory · SQLite]
  end
```

| Pitch layer | Implementation |
|---|---|
| **1 · Hear**: WhatsApp, in-app, IVR, soundbox; Sarvam ASR; PII redaction | [`channels/whatsapp.ts`](server/src/channels/whatsapp.ts) (Twilio webhook with signature verification; voice notes transcribed by Sarvam), [`agent/triage.ts`](server/src/agent/triage.ts) (Kannada / Hindi / English, romanised too; injection detection), [`core/pii.ts`](server/src/core/pii.ts) (tokenises phone, VPA, PAN, Aadhaar, card and account numbers per case), [`voice/sarvam.ts`](server/src/voice/sarvam.ts) |
| **2 · Plan**: LLM with tool use, RAG on SOPs and NPCI/RBI rules | [`agent/llm.ts`](server/src/agent/llm.ts) (Groq → Gemini over OpenAI-compatible tool calling), [`sim/kb.ts`](server/src/sim/kb.ts) (BM25 over RBI TAT, NPCI UDIR/chargeback rules, SOPs) |
| **3 · Check**: deterministic policy engine | [`policy/engine.ts`](server/src/policy/engine.ts): rules P0–P14, tier limits, grounding checks, least privilege, velocity, two-person rule; signed capabilities in [`core/capability.ts`](server/src/core/capability.ts) |
| **4 · Act**: MCP-style tools | [`tools/registry.ts`](server/src/tools/registry.ts): 21 tools (12 read, 6 act, 3 control) with JSON schemas, including [`integrations/paytm.ts`](server/src/integrations/paytm.ts), shaped like Paytm PG's Transaction Status API |
| **5 · Verify**: re-reads state, Sarvam TTS reply | `verifyAndClose` in [`core/runtime.ts`](server/src/core/runtime.ts) plus watchers; soundbox announcement on credit; ▶ listen on every reply (Sarvam TTS or browser voice) |
| **The spine**: event stream, case memory, approval queue, audit log | [`core/runtime.ts`](server/src/core/runtime.ts), [`core/audit.ts`](server/src/core/audit.ts) (SHA-256 hash chain), [`core/archive.ts`](server/src/core/archive.ts) (SQLite), [`rooms.ts`](server/src/rooms.ts) |
| **Test before it acts**: replay harness, shadow mode, golden evals | [`evals/golden.ts`](server/src/evals/golden.ts), [`evals/shadow.ts`](server/src/evals/shadow.ts), the Shadow toggle |

### Why Groq + Gemini

- **Groq** is the primary brain because latency matters when a merchant is standing at the counter. Model: `GROQ_MODEL`, or auto-picked from the live `/models` list (prefers `openai/gpt-oss-120b`).
- **Gemini** is the fallback: if Groq errors or times out, the same conversation continues on Gemini via its OpenAI-compatible endpoint. Model: `GEMINI_MODEL`, or the newest stable Flash on the account.
- If **both** fail, a circuit breaker opens (`MODEL_COOLDOWN_MS`, default 60 s) and the case runs in **degraded mode** on the deterministic planner: new cases start on it, and a case already in flight is taken over if no action has run yet. A case that already acted, is awaiting approval, or doesn't match a known workflow fails safe to the human queue with the case file (guardrail 6). Each provider call times out after `MODEL_TIMEOUT_MS` (default 20 s).

The brain is swappable because nothing it says is trusted: facts come only from tool output, the policy engine decides, and the verifier re-reads the systems of record.

## Trust & safety: every guardrail is code

The model is treated as untrusted. Seven independent layers sit between what it proposes and money moving, and **11 red-team attacks** run on every push.

| Layer | What it does | Where / proof |
|---|---|---|
| **Signed capabilities** | When policy allows an action, it mints a single-use, 60-second HMAC token bound to the exact tool, arguments, case and approvers. Action tools refuse to run without one. A forged, replayed or edited call can't move money even if the model is compromised. | [`core/capability.ts`](server/src/core/capability.ts); R01–R03 |
| **Deterministic policy, L0–L3** | 15 rules (P0–P14): grounding in tool facts (P3), value tiers (P4), never change payouts (P1), risk flags force L3 (P2), injection removes L1 autonomy (P10), **least privilege per workflow (P11)**, **24h velocity limit (P12)** | [`policy/engine.ts`](server/src/policy/engine.ts); G02–G09, R07, R08 |
| **Two-person rule** | Above ₹1,00,000 an approval needs two *different* humans; the agent can never approve | P13 in `decideApproval`; G03, R04 |
| **Prompt-injection defence** | Customer text quoted as untrusted data; runtime events carry a per-case nonce; injection attempts are flagged and repeated ones mark the account high-risk | `quoteUntrusted`, `screenInbound`; G14–G16, R06 |
| **Rate limiting & anomaly flags** | Per-merchant message limits (8 per 10 min) with `INBOUND_FLOOD` flagging, plus per-IP API limits on the public deploy | `screenInbound`, `limiter()`; R05 |
| **Encrypted, shredded PII** | Phone, VPA, PAN, Aadhaar, card and account numbers are tokenised before the model sees them, held only as AES-256-GCM ciphertext with an HMAC index, and **crypto-shredded when the case closes**. Outbound messages are scanned for leaks. | [`core/pii.ts`](server/src/core/pii.ts); R10, R11 |
| **Anchored audit log** | SHA-256 hash chain; the head is HMAC-signed and published every 10 entries and at every close (file sink, plus a GitHub Gist with `GITHUB_TOKEN` + `ANCHOR_GIST_ID`). A full consistent rewrite still contradicts the anchors. | [`core/audit.ts`](server/src/core/audit.ts), [`core/anchor.ts`](server/src/core/anchor.ts); G13, R09 |
| **Degraded mode** | Model outage → circuit breaker → deterministic planner keeps resolving through the same policy engine; takeover only before any action, otherwise human queue with the case file | `takeover()`, `failSafe()`; G12, G23, G24 |

**Fast:** every step in the trace shows its compute time (⚡), and the dashboard reports p50/p95 time to the first action. With the offline planner the agent proposes its first action in **about 1–7 ms of compute**; with Groq the model call dominates and is shown per step. The demo's step-by-step animation is deliberate pacing and is excluded from these numbers.

## Analytics and proof

![Analytics and proof](docs/media/08-analytics.png)

Open **`/app/analytics`** for the evidence on one page, computed live by the running server (nothing is typed in): the agent against human agents on 14 replayed tickets (**14/14 vs 11/14 right**, median **28 h vs 17 s** to a decision), a ticket-by-ticket timeline, the cards where a human got it wrong and what the agent did instead, the 35-case golden suite by category, what the policy engine refused, this session's live charts, and a capability comparison with the method and its limits written out. The same headline numbers are on the landing page, fetched from `GET /api/proof` (one shared, cached run). Details and how to read it honestly: [docs/ANALYTICS.md](docs/ANALYTICS.md).

### Benchmarks

| Measure | Result | How it is measured |
|---|---|---|
| Golden suite | **35/35 cases, 106/106 checks** | Fresh isolated world per case; asserts on the ledger, settlement UTR, dispute ack and payout account, not on the agent's text |
| Red-team | **11/11 contained** | Forged and replayed capabilities, prompt injection, forged approvals, payout change by chat, PII leaks, message floods, history rewrites |
| Shadow replay | **Agent right on 14/14 tickets, humans on 11/14 (79%)**; agreement 86% | 14 synthetic historical tickets scored against the action a reviewer marked right |
| Time to a decision | **Median 28 h (human, recorded) vs 17 s (agent, simulated clock)** | Time to a decision, not to money; the bank still takes its real time |
| Contacts avoided | **23** across the 14 tickets | Human contacts per ticket minus one agent contact |
| Loop compute | **p50 about 1 ms, p95 about 5 ms** (offline planner, demo pacing off) | Excludes model latency, which depends on the provider |
| Unit tests | **36 passing** across 4 files | `npm test` |

Re-run everything with `npm test`, `npm run eval` and the **Re-run the evidence** button. The synthetic tickets mean these are a demonstration of the method, not a production measurement; a 30-day shadow pilot on real tickets is the next step.

## Evals

```bash
npm test
```

```bash
npm run eval
```

- New here? Read [docs/NEXT_TEAMMATE.md](docs/NEXT_TEAMMATE.md) first, then [docs/HANDOFF.md](docs/HANDOFF.md).
- **35 golden cases** (workflows, guardrails, prompt injection, proactive, resilience, and 11 red-team attacks). Each one runs in a fresh, isolated simulated world and asserts on the **systems of record** (ledger credited, settlement UTR, dispute ack, payout account unchanged), not on the agent's text.
- **Shadow replay** runs the agent with actions recorded but not executed on 14 historical tickets, scored against the action an ops reviewer marked as the right call. Current result: the **agent makes the right call on 100%, the human agents on 79%**, and the two agree on 86%. Six tickets are deliberately hard: an account takeover a human fell for, a refund that should have been a push credit, a ticket raised for a payment that didn't exist. The last gap, duplicate debits, is closed by the duplicate-debit workflow (policy P14: refund only the later of two identical credited payments from one payer). The tickets are synthetic stand-ins for the anonymised set we'd request from Paytm.
- `npm run eval -- --llm` runs the same golden cases against Groq/Gemini.
- CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) typechecks and runs tests, evals, the build and `npm audit` on every push.
- **Browser gates** (Chrome, against a running server): `node scripts/verify-app.mjs`, `verify-landing.mjs` and `verify-analytics.mjs` check overflow at four widths, that every scroll reveal lands, motion and reduced motion, the Analytics page, `/api/proof`, and the core scenarios end to end.

## Real channels (optional)

| Feature | Set | Then |
|---|---|---|
| LLM brain | `GROQ_API_KEY` (+ `GEMINI_API_KEY` for the fallback) | The brain switches automatically; pick it in the top bar |
| Indic voice | `SARVAM_API_KEY` | 🎙 records a voice note → Sarvam ASR; ▶ listen and the soundbox use Sarvam TTS. Without it the browser's speech APIs are used |
| WhatsApp | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SANDBOX_JOIN`, `PUBLIC_URL` | Point the Twilio sandbox webhook at `POST {PUBLIC_URL}/api/channels/whatsapp/twilio`. Messages (and voice notes) from your phone open cases as Manjunath in the `whatsapp` room; replies come back to your phone. That room is not reachable from the public API, so it cannot be driven by other visitors |
| Paytm PG | – | `paytm_order_status` runs against the mock in [`integrations/paytm.ts`](server/src/integrations/paytm.ts); see [Paytm APIs](#paytm-apis-from-simulation-to-live) for the move to live endpoints |

### Production settings

| Setting | Why |
|---|---|
| `APPROVER_OPS_PIN`, `APPROVER_RISK_PIN` | Approver identity comes from the PIN. Without them identity is simulated and the two-person rule is enforced per client address only |
| `MCP_TOKEN` | Required when `NODE_ENV=production`; otherwise `/mcp` answers 503. Callers without an `x-room` get a room per client address |
| `ACTION_SIGNING_KEY`, `ANCHOR_SIGNING_KEY` | Keep tokens and audit anchors valid across restarts; anchor signatures are verified on every check |
| `TRUST_PROXY_HOPS`, `WRITE_RATE_PER_MIN`, `VOICE_RATE_PER_MIN` | Per-IP limits, including a tighter bucket for the paid Sarvam routes |
| `DEMO_ENDPOINTS=1` | Re-enables the audit tamper demo, which is off in production by default |

## Integrations and how they fit

| Integration | Role in ResolveAI | Status in this repo |
|---|---|---|
| **Groq, Gemini** | Primary and fallback reasoning models over OpenAI-compatible tool calling | Wired: [`agent/llm.ts`](server/src/agent/llm.ts) |
| **Sarvam AI** | Indic speech recognition, spoken replies and translation | Wired: [`voice/sarvam.ts`](server/src/voice/sarvam.ts), needs `SARVAM_API_KEY` |
| **Twilio WhatsApp** | The real merchant channel | Wired: [`channels/whatsapp.ts`](server/src/channels/whatsapp.ts) |
| **MCP** | Lets other agents open and read cases; no money-moving tool is exposed | Wired: [`mcp/handler.ts`](server/src/mcp/handler.ts) |
| **FalkorDB** | Graph memory for the case provenance graph (facts → conclusions → actions) across cases: payers disputing across merchants, repeat stuck-payment banks, rings of cases sharing a device | Listed as a connector on the Plugins page with a ready `docker run`; the schema and a `GraphMemory` interface are in [docs/IDEATION.md](docs/IDEATION.md). Not wired into the runtime yet, so cases are stored in SQLite today |
| **Switch MCP server** | A gateway to bring Slack, Discord and other chat platforms into the same inbound and outbound hooks WhatsApp uses | Not in the codebase yet. The channel layer is already adapter-shaped, so it would sit beside `channels/whatsapp.ts` |

## Paytm APIs: from simulation to live

Everything the agent knows comes from a tool call, and today those tools read a simulated Paytm world in [`sim/world.ts`](server/src/sim/world.ts). Live Paytm APIs are what turn ResolveAI from a proven method into something merchants and customers feel.

| ResolveAI needs | Paytm API access | What it changes in real time |
|---|---|---|
| Is the payment stuck, and why? | Transaction status (the adapter in [`integrations/paytm.ts`](server/src/integrations/paytm.ts) is already shaped like the PG Transaction Status API), ledger and bank status | The root cause is read from the system of record, not guessed; the merchant hears the exact time instead of "raise a ticket" |
| Detect it before anyone complains | Payment event stream or webhooks | The stuck-payment detector acts within minutes; the soundbox stays silent for minutes, not days |
| Fix it | Ticketing, settlement and dispute APIs | Push-credit tickets, settlement releases and dispute evidence are filed by the agent inside policy, with one-click approval above the limits |
| Prove it worked | The same read APIs, polled by the watchers | The case closes only when a credit or UTR is visible, so "resolved" means the money moved |

Why it is crucial: the policy engine, verifier and audit log are only as trustworthy as the facts under them. With live data, a customer sees their money back sooner, a merchant stops losing sales to a silent soundbox, and support teams stop working across five tabs. Moving off the simulation is a change to the adapters, not to the agent, policy or verifier. The steps and the sandbox access we would ask Paytm for are in [Roadmap](#roadmap-earn-trust-in-stages) and [docs/HANDOFF.md](docs/HANDOFF.md).

## Impact (targets, to be validated in a 30-day shadow pilot)

| 60–70% | Minutes | −40% | Zero |
|---|---|---|---|
| in-scope tickets auto-resolved | to resolve simple failed payments, not days | repeat contacts, via proactive exact-time updates | missed dispute deadlines |

Illustrative unit economics: 10,00,000 tickets/month × 60% × (₹45 − ₹4) = **₹2.46 Cr/month**, before retention and recovery upside. The **Impact** tab has a live calculator.

## Project layout

```
server/src
  agent/         triage (HEAR), brain contract, LLM brain (Groq→Gemini), offline planner
  channels/      WhatsApp via Twilio
  core/          runtime loop, types, encrypted PII vault, signed capabilities, audit log + anchors, SQLite archive
  integrations/  Paytm PG transaction-status adapter
  policy/        deterministic policy engine (L0–L3, rules P0–P14)
  tools/         MCP-style tool registry
  sim/           simulated Paytm systems, knowledge base, languages, demo scenarios
  evals/         golden cases, shadow replay, CLI
  voice/         Sarvam ASR/TTS adapter
  rooms.ts       per-visitor isolated runtimes
web/src          React + Tailwind console and landing page (live over SSE, works at phone width)
  views/         Landing, Console, Analytics, Approvals, Cases, Evals, Audit, Impact, Plugins, Merchant
  components/    charts (hand-drawn SVG), landing sections, trace, case panel
scripts/         capture.mjs: README screenshots and GIF; verify-app / verify-landing / verify-analytics: browser gates
```

## Roadmap: earn trust in stages

| Days 0–30 · Shadow | Days 30–60 · Assisted | Days 60–90 · Autonomous L1 |
|---|---|---|
| Workflow A on live events, no actions. Compare with human outcomes, tune the policy engine. | Case files and drafts for agents, one-click L2 approvals, regional-language voice. | Auto-resolve low-risk cases. Add settlement, dispute and duplicate-debit flows. |

**What we're asking Paytm for:** sandbox APIs (ledger, settlement, UDIR, ticketing), anonymised resolved tickets for the golden set, a 30-day shadow pilot on Workflow A with Bengaluru merchants, and an ops mentor to set policy limits with us.

## Notes and assumptions

- All Paytm systems are **simulated** in [`sim/world.ts`](server/src/sim/world.ts). Merchants, transactions and amounts are fictional. The Paytm PG adapter is a mock that mirrors the Transaction Status API's response shape. Internal SOP text in the knowledge base is illustrative. Regulatory entries paraphrase the RBI TAT harmonisation circular (2019) and NPCI UDIR/chargeback processes and should be checked against the source circulars before production use.
- Business figures in the pitch (1.57 Cr devices, ₹7.1 L Cr GMV) are from Paytm's Q1 FY27 results; the impact numbers are targets.

MIT License.

## Landing page, plugins and belief invalidation

- **Landing page** at `/`, console at `/app`. The landing page walks the five-step loop (Hear, Plan, Check, Act, Verify) as you scroll, shows the four autonomy levels, a live human-against-agent timeline, an FAQ and a full footer; motion respects `prefers-reduced-motion`. Seven interface languages (English, Hindi, Kannada, Tamil, Telugu, Marathi, Bengali); the strings need a native-speaker review before launch.
- **MCP server**: `POST /mcp` (Streamable HTTP) or `npx tsx server/src/mcp/stdio.ts`. Eight tools; no money-moving tool is exposed, so every issue goes through policy. Set `MCP_TOKEN` on any public deploy.
- **Plugins page** (`/app/plugins`): connector status, copyable setup commands, an MCP test and a Sarvam translate test.
- **Belief invalidation**: every approval records the ledger rows or settlement it rests on. If the bank changes one while a human is deciding (scenario H, "Simulate late bank reversal"), the approval is quarantined, cannot be signed, and the case escalates with the changed fact attached. Covered by golden case G22.
- **RBI TAT clock** on failed-payment cases: T+1, then compensation per day.
- Sarvam AI is used for voice (Saaras, Bulbul) and translation (Mayura) when `SARVAM_API_KEY` is set. None of it has been run against the live API from this repo. ResolveAI is an independent prototype and is not affiliated with Paytm or Sarvam AI.
