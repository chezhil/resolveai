# Ideation: keywords, research and what we built

Written 31 Oct 2026. "Built" means in this branch and checked as described; "planned" means not built.

## Keyword map

| Keyword | What we took it to mean | Status |
|---|---|---|
| ai team | The Track 3 "autonomous AI teammate" framing: a teammate with an owner's mindset, not a chatbot | Built: the product itself |
| FalkorDB or alternative | Graph memory for agents. FalkorDB is a graph database with Node and Python clients and MCP and Graphiti integrations | Planned. Listed as a connector; schema below |
| switch MCP | Let users plug in their own tools and switch the brain | Built: MCP server (HTTP and stdio), connectors page, brain selector |
| Wispr Flow | Voice dictation app that types into any text field | Built as a compatibility note: plain inputs work with it. No Wispr API integration (we found no official developer docs) |
| Paytm | The merchant platform and host of the hackathon | Named on the landing page with an independence disclaimer |
| roadblock | Policy BLOCK decisions: show why an action was stopped and what unblocks it | Partly built: trace shows blocks and reasons. Planned: an "unblock path" line on every block |
| money | Verified settlement of money, the core promise | Built: verifier re-reads the ledger |
| flagship | Position as Paytm's flagship support teammate | Pitch language only |
| PaytmAiCommunity | Unclear. Probably a community tag or channel for the event | Needs the team to confirm |
| Support | The support workflows A to G | Built |
| redline | Hard limits no prompt can cross (P1, P3, P6, P10, P13) | Built: shown on the landing page |
| investor | An investor view: unit economics and the pilot ask | Partly built: Impact tab and the "what is real" section |
| overexplain | Do not overexplain: one line first, detail on demand | Planned: concise and detailed toggle for trace text |

Ambiguous items need your confirmation: ai team, roadblock, flagship, PaytmAiCommunity.

## Research notes

- **FalkorDB**: graph database used for GraphRAG and agent memory; docs describe an MCP server and a Graphiti MCP server for persistent agent memory, and Node.js, Python and LangChain support. We did not verify package names. Source: docs.falkordb.com.
- **Wispr Flow**: desktop and mobile dictation. Third-party directories disagree on whether a public API exists; one lists API access only in an enterprise tier. We treat it as an input method, not an integration.
- **Sarvam AI** (docs.sarvam.ai): Saaras v3 speech-to-text for 23 languages, Bulbul v3 text-to-speech for 11, Sarvam-105B as flagship chat model, Mayura for translation. Sarvam-M is marked deprecated. Model ids in `voice/sarvam.ts` are env-overridable because the docs showed both `saaras:v3` and `saaras:v4`. None of it has been run against the live API from this repo.
- **Open-source patterns** worth borrowing: HumanLayer (approval channels), SHUGO (policy as YAML, hash-chained audit), Langfuse and Phoenix (trace UI), tau-bench (customer-service agent evals).

## FalkorDB graph memory: planned schema

```
(:Merchant {id})-[:RECEIVED]->(:Txn {rrn, amount})<-[:PAID]-(:Payer {vpa_hash})
(:Case {id, workflow})-[:ABOUT]->(:Txn)
(:Case)-[:RAISED_FLAG]->(:Risk {code})
```

Queries it would unlock: payers who dispute across many merchants, merchants with repeat stuck-payment banks, and rings of cases sharing a device. Run with `docker run -p 6379:6379 falkordb/falkordb`, behind a `GraphMemory` interface with an in-memory fallback so the demo never depends on it.

## What we built in this branch

- New landing page (dark ledger design, one cyan accent) with a motion-explained loop diagram, 7 interface languages, Paytm and Sarvam AI mentions and an independence disclaimer.
- Console restyled (soft light theme, self-hosted Geist fonts, no third-party font requests).
- MCP server: `POST /mcp` (Streamable HTTP, JSON responses, optional `MCP_TOKEN`) and `server/src/mcp/stdio.ts`. Seven tools; no money-moving tool is exposed; covered by `server/test/mcp.test.ts`.
- Connectors page at `/app/plugins`: status of every integration, copyable setup commands, a working MCP "list tools" test and a Sarvam translate test.
- Sarvam adapter: updated model defaults, 11 languages, a translate call, and an opt-in Sarvam-105B fallback (`SARVAM_CHAT=1`).
- Clock buttons disabled while a case is mid-run (see Problems found).

## Not done

- Agent replies in languages beyond English, Hindi and Kannada need a Sarvam key (translate path); not tested live.
- Interface translations were written by an AI assistant and need native review.
- FalkorDB, concise/detailed toggle, per-block "unblock path", investor page.
- Branch is local; nothing pushed, nothing deployed.
