# ResolveAI: team handoff

Everything you need to take over ResolveAI: what exists, how it works, how to change it, and what to do next.
Written 30 Oct 2026, the evening before the offline finals. **Updated 31 Oct (finals day):** Analytics and proof page, live landing proof, a landing-page rebuild, `GET /api/proof`, new verify scripts, and the corrections below (35 golden cases, the duplicate-debit flow is done, P14, the router and structure of the frontend).

---

## 1. Status at a glance

| | |
|---|---|
| **What it is** | An autonomous customer-service teammate for Paytm merchants. It diagnoses stuck payments, acts within policy, verifies the money moved, and hands off to humans with a case file. Track 3 (Autonomous AI Teammates), Paytm Build for India AI Hackathon, Bengaluru. |
| **Repo** | https://github.com/chezhil/resolveai (public, branch `main`) |
| **Live site** | https://resolveai-production-99b1.up.railway.app |
| **Finals** | **31 Oct 2026**, offline, Bengaluru |
| **CI** | GitHub Actions: typecheck → tests → evals → build, on every push ([ci.yml](../.github/workflows/ci.yml)) |
| **Tests** | 36 unit tests and **35/35 golden cases** (incl. 11 red-team attacks) pass. Shadow replay: agent right on 14/14 tickets vs 11/14 (79%) for humans. Browser gates: `scripts/verify-app.mjs`, `verify-landing.mjs`, `verify-analytics.mjs` (see §9) |
| **Brain on the live site** | **Offline planner.** No `GROQ_API_KEY`/`GEMINI_API_KEY` is set anywhere yet, so the LLM path has never run against a real API |
| **Pitch deck** | [docs/ResolveAI_Pitch.pdf](ResolveAI_Pitch.pdf) · Demo script: [docs/DEMO.md](DEMO.md) · Analytics page: [docs/ANALYTICS.md](ANALYTICS.md) |

### ⚠️ Read before you push

- **Every push to `main` auto-deploys to Railway and restarts the app.** That wipes every in-progress demo session (cases live in memory). **Don't push to `main` while judges are using the site.** Work on a branch and merge after judging.
- Railway deploys whatever lands on `main`, even if CI fails. Enable **"Wait for CI"** in the Railway service settings to change that (dashboard only).

---

## 2. Access and accounts

| What | Who has it | Notes |
|---|---|---|
| GitHub repo (write) | `chezhil` (owner). **Invited, pending acceptance:** `saksham-2x7`, `HamzaShaikh-source` | Accept at https://github.com/chezhil/resolveai/invitations (invites expire after 7 days) |
| Railway project `resolveai` (service `resolveai`) | Chezhil's account only | Auto-deploys from `main`. Teammates don't need Railway access to deploy, only to change env vars or see logs. Ask Chezhil, or have him invite you to the workspace |
| Railway plan | Free/trial tier, shared with Chezhil's `gridpulse` project | ResolveAI costs ≈ $0.04/day (121 MB RAM, ~0 CPU). Fine through the finals; the Hobby plan ($5/mo) removes any risk |
| API keys (Groq, Gemini, Sarvam, Twilio) | **None set** | See §8 for where to put them |

---

## 3. Run it locally

Requires **Node 22.13+** (Node 24 recommended; CI uses 24).

```bash
npm install
npm run dev          # API on :8787 + console on :5173 (open http://localhost:5173)
npm test             # unit tests + golden suite
npm run eval         # golden cases + shadow replay, readable output
npm run eval -- --llm   # same, against Groq → Gemini (needs keys)
npm run typecheck
npm start            # production: builds web, serves everything from one process on $PORT
node scripts/capture.mjs   # regenerate README screenshots + demo.gif (needs npm run dev + Google Chrome)
```

Put API keys in **`.env` at the repo root** (copy `.env.example`). It's git-ignored.

---

## 4. How it works

### The loop: Hear → Plan → Check → Act → Verify

```
merchant message / payment event
  │
  ▼ HEAR      triage.ts: language (kn/hi/en, romanised too), workflow, amount, injection/urgency signals
  │           pii.ts: phone/VPA/PAN/Aadhaar/card/account → <TOKENS>, encrypted per case
  ▼ PLAN      Brain proposes tool calls: LlmBrain (Groq → Gemini) or PlannerBrain (deterministic)
  ▼ CHECK     policy/engine.ts: L0–L3 verdict, rules P0–P14 (ALLOW / NEEDS_APPROVAL / BLOCK / ESCALATE / SHADOW)
  ▼ ACT       ALLOW → policy mints a signed one-time capability → tool runs against the simulated systems
  │           NEEDS_APPROVAL → approval queue (two humans above ₹1 L) → resumes the brain after
  ▼ VERIFY    watchers wake the case when money moves; close_case re-reads ledger/settlement/dispute
              and only closes if the money actually moved
underneath: hash-chained audit log + anchors, SQLite archive, per-visitor rooms, SSE to the console
```

**Core idea for anyone changing the agent:** the model is untrusted. Facts only come from tool output, policy decides, and the verifier re-reads the systems of record. The model can be swapped (planner, Groq, Gemini) without changing any guarantees.

### Directory map

```
server/src
  index.ts              Express API + SSE + per-IP rate limiter + static web serving
  env.ts                loads .env from repo root
  rooms.ts              one isolated Runtime per visitor (?room= / x-room header), idle eviction
  core/
    runtime.ts          ★ the agent loop: inbound(), drive(), execute(), approvals, watchers,
                          proactive detector, verifyAndClose, escalate, failSafe, metrics, snapshot
    types.ts            Case, TraceEvent, Approval, Watcher, ChatMessage…
    pii.ts              PiiVault: AES-256-GCM tokenisation, reveal, shred; findLeaks()
    capability.ts       signed single-use action tokens (HMAC-SHA256)
    audit.ts            hash-chained audit log (+ tamper demos)
    anchor.ts           publishes signed chain heads (memory, file, optional GitHub Gist)
    archive.ts          SQLite (node:sqlite) archive of cases + audit
  agent/
    triage.ts           deterministic HEAR stage
    brain.ts            Brain interface (next / observe / event)
    llm.ts              LlmBrain: OpenAI-compatible tool calling, Groq then Gemini; system prompt
    planner.ts          PlannerBrain: per-workflow state machines (same tools/policy as the LLM)
  policy/engine.ts      ★ all policy rules P0–P14, tool allowlists, value tiers
  tools/registry.ts     ★ 21 MCP-style tools with JSON schemas; action tools gated by capabilities
  integrations/paytm.ts Paytm PG transaction-status adapter (mock, real response shape)
  channels/whatsapp.ts  Twilio WhatsApp webhook (signature check) + outbound replies
  voice/sarvam.ts       Sarvam ASR/TTS adapter
  sim/
    world.ts            ★ simulated Paytm systems: merchants, txns, bank tickets, settlements, disputes, soundbox, clock
    scenarios.ts        demo scenarios A–F
    kb.ts               knowledge base (RBI/NPCI/SOP snippets) + BM25 search
    lang.ts             language detection + reply templates (Kannada, Hindi, English)
  evals/
    golden.ts           28 golden cases (G01–G17 + red-team R01–R11)
    shadow.ts           shadow replay on 14 synthetic historical tickets
    cli.ts              `npm run eval`
server/test/guardrails.test.ts   unit tests + runs the golden suite
web/src                 React console (see §6)
scripts/capture.mjs     screenshots + GIF via headless Chrome
Dockerfile, railway.json, render.yaml   deployment
```

### Demo data (simulated world)

| Merchant | Business | Language | Scenario |
|---|---|---|---|
| M1001 Manjunath K | Sri Manjunatha Darshini, Jayanagar | Kannada | **A** ₹480 credit pending (RRN 630412345678) · **F** angry/vague |
| M1002 Priya Sharma | Priya Fashions, Indiranagar | Hindi/Hinglish | **B** settlement STL-88213 ₹1,84,300 held for bank-name mismatch |
| M1003 Arjun Rao | Arjun Electronics, SP Road | English | **C** chargeback DSP-55102 ₹12,499, deadline in ~30 h |
| M1004 Ravi Kumar | QuickMart, Whitefield | English | **D** payout-change request + SIM-swap risk flag |
| M1005 Fatima Begum | Noor Medicals, Shivajinagar | Hindi | **E** injected stuck ₹2,350, proactive detection |

Sim clock starts at **31 Oct 2026, 08:12 IST**. Bank push-credits land at **7:10–7:30 am next day**, so demos use **+1 day**. Settlements pay out 2 h after release.

### Policy rules (server/src/policy/engine.ts)

| Rule | Meaning |
|---|---|
| P0 | Reads are always allowed (L0) |
| P1 | Never change a payout account from a support channel |
| P2 | High-severity risk flags force L3 for money/account actions |
| P3 | No action without tool-confirmed facts (grounding) |
| P4 | Value tiers: refunds ≤ ₹2,000 and releases ≤ ₹10,000 are L1; above → L2 approval; > ₹5 L → L3 |
| P5 | Max 10 actions per case |
| P6 | Outbound messages can't contain account/PAN/Aadhaar/phone numbers |
| P7 | Dispute evidence only inside the window |
| P8 | Shadow mode records instead of executing |
| P9 | One refund per transaction |
| P10 | Prompt injection in the message → every money action needs approval |
| P11 | Least privilege: allowed action tools per workflow (`WORKFLOW_TOOLS`) |
| P12 | Velocity: >5 money actions per merchant per 24 h → human |
| P13 | Two-person rule above ₹1,00,000 (enforced in `Runtime.decideApproval`) |
| P14 | Duplicate debit: refund only the later of two identical, credited payments from the same payer within 15 minutes, both seen in this case's ledger lookup |

---

## 5. Adding things on the backend

**A new tool:** add an entry to `RAW_TOOLS` in `tools/registry.ts` with `kind` (`read`/`act`/`control`), a JSON schema, `run`, and `facts` (what the result proves). If it's `act`, add a policy branch in `evaluateRules` (otherwise it escalates by default), add it to `WORKFLOW_TOOLS` for the workflows that may use it, and add a trace label in `label()` in `runtime.ts`. Capability gating is automatic.

**A new workflow** (duplicate debit is the worked example: `agent/planner.ts` `duplicateDebit`, rule P14, golden cases G18–G21): add a triage rule in `agent/triage.ts`, a `Workflow` type in `core/types.ts`, a `WORKFLOW_TOOLS` entry, a branch in `PlannerBrain.next()`, and a verifier condition in `verifyAndClose` if it moves money. Then add golden cases.

**A golden case:** append to `GOLDEN` in `evals/golden.ts`. Each runs in a fresh `Runtime`; assert on world state (`rt.world…`), not on the agent's words. `npm run eval` shows failures with details.

**A demo scenario:** add to `SCENARIOS` in `sim/scenarios.ts`. It appears in the console automatically.

---

## 6. Frontend guide (how to rework it)

### Stack

React 19 · Vite 8 · TypeScript · **Tailwind CSS v4** (configured in CSS, there's no `tailwind.config.js`) · `react-router` (landing at `/`, console at `/app/*`) · GSAP + ScrollTrigger on the landing page · a small SSE store (`lib/store.ts`), no state library. Charts are hand-drawn SVG and CSS (no chart library).

### Structure

```
web/src
  main.tsx              entry
  index.css             ★ design tokens (@theme), utilities `card`, `chunky`, `label`, animations
  App.tsx               shell: header (tabs, sim clock, brain select, Shadow/Model-outage toggles, Reset), metrics strip
  lib/api.ts            ★ all server types + api() fetch helper + ROOM + formatters
  lib/store.ts          ★ useLive(): SSE subscription → snapshot, traces per case, soundbox events
  lib/voice.ts          Sarvam/browser TTS + recording
  components/ui.tsx     Button, Pill, LevelBadge, StatusBadge, StageChip, SectionLabel, Empty, Json
  components/Trace.tsx  agent trace timeline (merges CHECK+ACT rows)
  components/CasePanel.tsx  case file, level ladder, facts, watchers, ApprovalCard (two-person)
  components/Phone.tsx  WhatsApp mock, mic, ▶ listen, CSAT stars; PayerPhone; Soundbox
  views/Console.tsx     3-column live console (scenarios + phone | trace | case file)
  views/Cases.tsx       case table, approval queue, human queue, SQLite archive
  views/Evals.tsx       golden + red-team + shadow replay
  views/Audit.tsx       audit chain, anchors, tamper buttons
  views/Impact.tsx      unit-economics calculator, live metrics, security posture, roadmap, rules
  views/Analytics.tsx   ★ proof and analytics page (/app/analytics): see docs/ANALYTICS.md
  views/Landing.tsx     landing page (/): hero, problem, how it works, playground, defence, autonomy, console tour, proof, languages, plugins, FAQ, honest
  views/Merchant.tsx, Approvals.tsx, Plugins.tsx   merchant phone, approval inbox, MCP plugins
  components/charts.tsx             SVG and CSS chart primitives (Dumbbell, Donut, PairBars, PassBars, MiniBars, Stat)
  components/ScenarioButtons.tsx    one-click scenario starters for empty pages
  components/landing/               HowItWorks, AutonomyLadder, ProofCharts, Faq, SiteFooter, GraphPanel
  lib/analytics.ts                  shared /api/proof loader (cached) and the pure functions behind every chart
  lib/reveal.ts                     scroll reveal: IntersectionObserver plus a scroll sweep (see gotchas)
```

### Data flow (keep this contract and you can redesign freely)

1. On load the console picks a **room** id (`?room=` or random per tab, in sessionStorage). Every request sends `x-room`; the SSE stream uses `/api/stream?room=`.
2. `useLive()` opens the SSE stream and receives:
   - `state`: the full `Snapshot` (cases, approvals, watchers, messages, merchants, metrics, config, clock). Debounced ~60 ms; **this is the source of truth**.
   - `trace`: one `TraceEvent` at a time (appended per case).
   - `message`: a chat message (also included in the next `state`).
   - `soundbox`: an announcement (drives the soundbox animation/voice).
3. User actions are plain POSTs via `api()`; the UI never mutates state locally and just waits for the next `state` event.

### API

| Method | Path | Body / notes |
|---|---|---|
| GET | `/api/stream?room=` | SSE: `state`, `trace`, `message`, `soundbox` |
| GET | `/api/state` | Snapshot |
| GET | `/api/meta` | scenarios, rules, tools, kb, voice/whatsapp availability |
| GET | `/api/cases/:id` | case + full trace + messages + approvals + watchers + audit |
| POST | `/api/scenarios/:id` | run scenario A–H (see `GET /api/meta` for the list) |
| POST | `/api/inbound` | `{merchantId, text, channel?}` → `{caseId}`; 429 if rate-limited |
| POST | `/api/approvals/:id` | `{decision: "APPROVED"\|"REJECTED", pin}` with approver PINs set; `{decision, by: "ops-lead"\|"risk-lead"}` when identity is simulated |
| POST | `/api/cases/:id/csat` | `{score: 1–5}` (resolved cases only) |
| POST | `/api/clock/advance` | `{minutes}` |
| POST | `/api/config` | `{brain?: "auto"\|"llm"\|"planner", shadow?, chaosModelOutage?}` |
| POST | `/api/reset` | new world for this room |
| POST | `/api/events/stuck-payment` | `{merchantId, amount}` |
| GET/POST | `/api/audit`, `/api/audit/verify`, `/api/audit/anchor`, `/api/audit/tamper` | tamper body `{seq, mode?: "rewrite"}` |
| GET | `/api/archive` | persisted cases |
| POST | `/api/evals/run` | `{brain}` → golden + shadow results (rate-limited 6/min/IP) |
| POST | `/api/voice/transcribe`, `/api/voice/tts` | Sarvam only |
| POST | `/api/channels/whatsapp/twilio` | Twilio webhook |
| GET | `/api/proof` | Shared, cached eval run for the landing page and Analytics: `{brain, golden, shadow, policyRules, generatedAt, ttlSeconds}`. No room needed. Rate limited 30/min/IP; cached for `PROOF_TTL_MS` (10 min) |
| GET | `/api/health` | |

Types for all of these live in `web/src/lib/api.ts`. Keep them in sync with `server/src/core/types.ts` by hand (no codegen).

### Design system

Taken from the pitch deck: cream dotted background, ink-navy 2px borders with hard offset shadows, saturated flat colours.
Tokens in `index.css`: `ink #121633`, `cream`, `brand #3039f2`, `sun` (yellow), `sky` (cyan), `rose` (pink), `mint` (green), `ember` (orange-red), `peach`, `sand`, `muted`.
Fonts: Bricolage Grotesque (display), Inter (body), JetBrains Mono (labels), Noto Sans Kannada/Devanagari for Indic text.
Colour meaning is consistent: **L0 sun, L1 sky, L2 rose, L3 ember**; stages HEAR sun, PLAN sky, CHECK rose, ACT mint, VERIFY ember.

### Reworking it: suggestions

- **Keep `lib/api.ts` + `lib/store.ts` as they are** and rebuild the views on top. Everything visual is replaceable.
- Good candidates: a **guided "demo mode"** (a stepper that runs A → +1 day → B → approve ×2 → D, with captions for the judges); a **dedicated judge view** (big trace + phone only); a **mobile merchant app** view at `/merchant` that shows just the phone; **router** (`react-router`) if you add pages.
- If you switch component libraries (shadcn/ui, etc.), map the colours to the tokens above to stay on-brand with the deck.

### Frontend gotchas we already hit

- **Tailwind v4 can't see dynamic class names** (`bg-${tone}`). Use static maps (see `LEVEL_BG` in CasePanel).
- **`useEffect(() => el.scrollIntoView({behavior:"smooth"}))`** crashes React in new Chrome, because smooth scrolling now returns a Promise. Always use braces in effects.
- Grids need `grid-cols-1` (and `min-w-0` on children) at small widths, or long content causes horizontal scroll on phones.
- `hidden md:inline-flex` on a component whose base class already has `inline-flex` doesn't hide it; wrap it in a span instead.
- Every fetch must send `x-room`, or you'll be looking at a different room's data.
- **Never let React own the `className` of an element that `useReveal` toggles.** The observer adds `.in` by hand; the next render that changes `className` overwrites it and the element goes back to `opacity: 0`. Put anything state-dependent on an inner element (see `HowItWorks.tsx`).
- **An IntersectionObserver never fires for an element you jump straight past** (fast scroll, `/#proof` deep link, anchor click). `useReveal` therefore also sweeps on scroll and reveals everything at or above the fold. Keep that if you rewrite it.
- Absolutely positioned `sr-only` spans inside an `overflow-x-auto` wrapper escape its clipping and widen the page on phones unless the wrapper is `relative`.
- Keys on revealed lists: key by index when the labels change with live data, or React remounts the nodes and they lose their `.in` class.

---

## 7. Deployment

- **Railway** (current): project `resolveai`, service `resolveai`, builds the [Dockerfile](../Dockerfile), auto-deploys from `main`, health check `/api/health`.
  - CLI (Chezhil's machine): `railway logs --service resolveai`, `railway metrics --service resolveai`, `railway variables --service resolveai --set KEY=value`.
  - Railway puts `railway.json` (config-as-code) into deprecation on 2026-12-01; migrate with `railway config migrate` after the hackathon.
- **Backup:** "Deploy to Render" button in the README (`render.yaml`, free tier). It sleeps after 15 min idle, so it's only a fallback.
- **Any Docker host:** `docker build -t resolveai . && docker run -p 8080:8080 --env-file .env resolveai`.
- State: per-visitor rooms are in memory (wiped on restart). The SQLite archive and anchor file are on the container filesystem, which Railway also wipes on redeploy unless you attach a volume and point `DB_PATH` at it.

---

## 8. Environment variables

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY`, `GROQ_MODEL` | Primary LLM. Model auto-picked from Groq's `/models` if unset (prefers `openai/gpt-oss-120b`) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Fallback LLM (newest stable Flash auto-picked) |
| `BRAIN` | `auto` (default) / `llm` / `planner` |
| `SARVAM_API_KEY` (+ `SARVAM_ASR_MODEL`, `SARVAM_TTS_MODEL`, `SARVAM_TTS_SPEAKER`) | Indic ASR/TTS (`saaras:v3`, `bulbul:v3` + speaker `priya` defaults; verified against the live API on 2026-10-31) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SANDBOX_JOIN`, `PUBLIC_URL`, `WHATSAPP_ROOM`, `WHATSAPP_MERCHANT_ID` | Real WhatsApp channel. Webhook: `POST {PUBLIC_URL}/api/channels/whatsapp/twilio`; watch at `/?room=whatsapp` |
| `ACTION_SIGNING_KEY`, `ANCHOR_SIGNING_KEY` | Fixed signing keys (random per process otherwise) |
| `GITHUB_TOKEN`, `ANCHOR_GIST_ID` | Publish audit anchors to a Gist (untested) |
| `DB_PATH` | SQLite archive path (default `data/resolveai.db`) |
| `PACING_MS` | Delay between trace steps in the live console (default 450) |
| `MAX_ROOMS`, `WRITE_RATE_PER_MIN` | Abuse limits for the public deploy |
| `APPROVER_OPS_PIN`, `APPROVER_RISK_PIN` | Approver PINs (6+ digits). When set, `/api/approvals/:id` takes `{decision, pin}` and the approver is bound to the PIN (constant-time compare); unset = simulated identity, shown in the UI |
| `APPROVAL_RATE_PER_MIN`, `TRUST_PROXY_HOPS`, `MAX_STREAMS_PER_IP` | Approval rate limit (10), proxy hops to trust for client IPs (1), open SSE streams per IP (30). **See the note below the table about `TRUST_PROXY_HOPS` on Railway** |
| `PROOF_TTL_MS` | How long `GET /api/proof` serves one shared eval run (default 600000 = 10 minutes) |
| `STRICT_TWO_PERSON` | `1` = with simulated approver identities, the two signatures on one approval must come from different client addresses. Off by default so one presenter can play both approvers in the demo |
| `PORT` / `API_PORT` | Production port / dev API port (8787) |

**`TRUST_PROXY_HOPS` on Railway (open, not yet fixed).** On 31 Oct, 120 parallel requests to `/api/proof` all returned 200 on the live site, although that route is limited to 30 per minute per IP. The same limiter guards the evals (6/min), voice (20/min), approvals and general write routes, so none of them is likely limiting per visitor there. The likely cause is more than one proxy hop in front of the app: with `TRUST_PROXY_HOPS=1` the app sees a rotating edge address, not the visitor's. Try `TRUST_PROXY_HOPS=2` on Railway and re-run `node scripts/verify-analytics.mjs <live url>`: it prints a `WARN` line until the limiter works. Do not set it higher than the real number of proxies, or clients can spoof their address.

Locally: `.env` at the repo root. On Railway: `railway variables --service resolveai --set …` or the dashboard (that triggers a redeploy).

---

## 9. What's verified and what isn't

**Verified:** all golden cases and tests in CI; the three browser gates in `scripts/` (below); the Analytics page, the live landing proof and `/api/proof` against the production build and the live Railway site (31 Oct); scenarios A, B, D, E and the Evals tab clicked through in a browser (desktop and phone width); the live Railway site (scenario A, two-person approval, SSE through Railway's proxy); Docker image builds and serves; SQLite archive writes; the anchor tamper demo.

**Not verified:**
- **Groq/Gemini**: no key has ever been set. The prompt and tool schemas are untested against a real model. This is the biggest risk for "is this really AI?" questions.
- **Sarvam** ASR/TTS and **Twilio WhatsApp**: code is complete, never run against the real services.
- **Gist anchor sink**: untested.
- Scenario **C** and **F** were tested only by evals, not clicked in the browser after the latest changes.
- **Per-IP rate limiting on Railway** (see §8).

### Browser gates (need Google Chrome; run against a running server)

```bash
node scripts/verify-app.mjs        http://localhost:8787   # 9 console pages x 4 widths: horizontal overflow, page errors
node scripts/verify-landing.mjs    http://localhost:8787   # landing at 4 widths: overflow, every reveal lands, fonts, no em/en dashes, console errors
node scripts/verify-analytics.mjs  http://localhost:8787   # Analytics, live proof, /api/proof, core scenarios, landing motion and reduced motion
```

`verify-landing.mjs` writes screenshots to `docs/media/check-v-*.png`; delete them before committing.

---

## 10. What to improve next (prioritised)

### Before judging (tonight / morning of 31 Oct)
1. **Get a Groq key, run `npm run eval -- --llm`, fix the prompt until the golden cases pass**, then set the key on Railway. If anything is flaky, keep `BRAIN=planner` for the live demo and show the LLM in a second tab.
2. Rehearse [docs/DEMO.md](DEMO.md) on the live URL; use `?room=judges` so the whole team sees the same session.
3. Record a 60–90 s narrated video as a backup in case the venue Wi-Fi fails.
4. Freeze `main` before judging.

### Next
- ~~Duplicate-debit workflow~~ (done: scenario G, P14, golden cases G18–G21, shadow ticket H-1175 now right).
- **Fix per-IP rate limiting on Railway** (`TRUST_PROXY_HOPS`, §8).
- **Real Paytm PG sandbox** behind the `PaytmPg` interface (`integrations/paytm.ts`), with checksum signing. The README section "Paytm APIs: from simulation to live" lists which API each part of the loop needs; the agent, policy and verifier do not change, only the adapters.
- **FalkorDB graph memory** behind a `GraphMemory` interface (schema in [IDEATION.md](IDEATION.md)); SQLite stays the system of record for cases and the audit chain until it is wired in.
- **Switch MCP gateway** for Slack, Discord and other chat platforms, beside `channels/whatsapp.ts` (same inbound and outbound hooks).
- **Persistent rooms** (state in SQLite or Redis) so restarts don't wipe sessions.
- **Wait-for-CI on Railway** and branch protection on `main` (PRs plus a required CI check).
- **LLM evals in CI** behind a secret, run nightly.
- A **judge view** in the frontend (§6). The guided demo card and the Analytics page already exist.

### Later / pitch roadmap
- Hindi/Kannada voice end to end on WhatsApp (Sarvam ASR → agent → Sarvam TTS voice note back).
- IVR channel; soundbox firmware hook for "money received" voice confirmations.
- Shadow mode on real anonymised tickets (the ask to Paytm), replacing the synthetic set in `evals/shadow.ts`.
- Ops dashboard roles and SSO for approvers (approver identity is just `ops-lead`/`risk-lead` today).
- Per-merchant language preference learning; CSAT-driven tuning.

---

## 11. Judge Q&A cheat sheet

- **"Is the money real?"** No. Every Paytm system is simulated (`sim/world.ts`); the Paytm PG adapter mirrors the real Transaction Status API response shape. The ask is sandbox APIs and a 30-day shadow pilot.
- **"What if the model hallucinates?"** It can't act on claims: actions need tool-confirmed facts (P3), the verifier re-reads the ledger before closing, and tools only run with a signed capability from policy.
- **"Prompt injection?"** Three injection evals (G14–G16) and two red-team ones (R06, R11). Customer text is quoted as data, events are nonce-signed, and injection removes L1 autonomy.
- **"Fraud?"** Payout changes are never possible (P1); SIM-swap flags force L3; two-person approval above ₹1 L; velocity limits.
- **"Data privacy?"** PII is tokenised before the model, encrypted per case and crypto-shredded at close; outbound leak scanning.
- **"How fast?"** First action in ~1–7 ms of compute with the planner; with Groq the model call is shown per step. The animation pacing is deliberate.
- **"Numbers?"** 60–70% auto-resolve, minutes not days, −40% repeat contacts, zero missed deadlines are **targets** for the shadow pilot. The ₹2.46 Cr/month unit economics uses illustrative inputs.
- **"Where is the proof?"** Open `/app/analytics` (or the Proof section on the landing page): every figure is computed live by the server. Be upfront about the limits it lists: synthetic tickets, a planner written against them, time to a decision rather than time to money, and 14 tickets is too few for a confidence interval.
- **Be upfront about the gaps:** the LLM path has never run against a real model, and the per-IP rate limiter is not confirmed effective behind Railway.

---

## 12. History (how we got here)

1. Built the full agent, simulated world, policy engine, console, evals and CI from the pitch deck (initial commit).
2. Switched the LLM from Claude to **Groq (primary) + Gemini (fallback)** at the team's request.
3. Added prompt-injection defences, the Paytm PG adapter, WhatsApp/Twilio, Sarvam voice, per-visitor rooms, the SQLite archive, CSAT, honest shadow tickets (found and fixed an amount-parsing bug), the mobile layout, Docker/Render/Railway config, and README media.
4. Deployed to Railway (deleted the old `attractive-learning`/ThreadLine project to free the slot), then switched to auto-deploy from GitHub.
5. Added the security layers: signed capabilities, two-person rule, rate limits and anomaly flags, least privilege, velocity, anchored audit, encrypted/shredded PII, latency metrics, and 11 red-team evals (found and fixed a proactive-detection bug during clock jumps).
