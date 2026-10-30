// LlmBrain: tool-calling agent over OpenAI-compatible chat completions.
// Groq is the primary provider (low latency); Gemini is the fallback. If both fail the runtime
// fails safe to the human queue with the case file attached.

import type { Brain, BrainTurn, ToolCall, ToolResult } from "./brain.js";
import { ModelOutage } from "./brain.js";
import { llmTools } from "../tools/registry.js";

interface Provider {
  name: "groq" | "gemini";
  baseUrl: string;
  key: string;
  envModel?: string;
  prefer: string[];
}

type Msg = Record<string, unknown> & { role: "system" | "user" | "assistant" | "tool" };

const resolved = new Map<string, string>();

export function configuredProviders(): Provider[] {
  const out: Provider[] = [];
  if (process.env.GROQ_API_KEY) {
    out.push({
      name: "groq",
      baseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
      key: process.env.GROQ_API_KEY,
      envModel: process.env.GROQ_MODEL,
      prefer: ["openai/gpt-oss-120b", "moonshotai/kimi-k2-instruct-0905", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"],
    });
  }
  if (process.env.GEMINI_API_KEY) {
    out.push({
      name: "gemini",
      baseUrl: process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai",
      key: process.env.GEMINI_API_KEY,
      envModel: process.env.GEMINI_MODEL,
      prefer: [],
    });
  }
  return out;
}

/** Pick a model: env override, else the best match from the provider's live /models list. */
async function modelFor(p: Provider): Promise<string> {
  if (p.envModel) return p.envModel;
  const cached = resolved.get(p.name);
  if (cached) return cached;
  let pick = p.name === "groq" ? p.prefer[0] : "gemini-2.5-flash";
  try {
    const res = await fetch(`${p.baseUrl}/models`, { headers: { Authorization: `Bearer ${p.key}` }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const ids: string[] = ((await res.json()).data ?? []).map((m: { id: string }) => m.id.replace(/^models\//, ""));
      if (p.name === "groq") {
        pick = p.prefer.find((m) => ids.includes(m)) ?? pick;
      } else {
        // Newest stable Gemini Flash: gemini-<version>-flash, no preview/lite/exp suffix.
        const flash = ids
          .filter((id) => /^gemini-\d+(\.\d+)?-flash$/.test(id))
          .sort((a, b) => parseFloat(b.split("-")[1]) - parseFloat(a.split("-")[1]));
        pick = flash[0] ?? pick;
      }
    }
  } catch {
    // keep the default
  }
  resolved.set(p.name, pick);
  return pick;
}

export function systemPrompt(ctx: { caseId: string; merchantId: string; channel: string; lang: string; now: string; signals: string[]; proactive: boolean }) {
  return `You are ResolveAI, an autonomous customer-service teammate for Paytm merchants in India. You own each case from first signal to confirmed closure: diagnose with tools, act within policy, verify the money actually moved, and hand off to a human only when you should.

How you work
1. Diagnose from live systems before acting. Look up the ledger, bank, UDIR, settlement, KYC, risk and dispute systems with tools. Never assume a status; read it.
2. Propose actions with tools. A deterministic policy engine checks every action and returns ALLOW, NEEDS_APPROVAL (a human approves with one click; tell the merchant what happens next and end your turn), BLOCK (adapt: usually gather the missing fact or escalate), or ESCALATE.
3. Keep the customer informed in their language, with an exact time, not a range. Kannada (kn) replies use Kannada script; Hindi (hi) replies use Devanagari; otherwise English. Always fill english_gloss. Keep messages short and warm. Never include account numbers, PAN or phone numbers.
4. When money will move later, raise the ticket, set a watcher, message the merchant (and the payer for failed payments so they do not pay twice), then end your turn. You will be woken when the watcher fires.
5. Close only with close_case. The verifier re-reads the systems; if it fails, the money has not moved yet.
6. Escalate with escalate_to_human when you see fraud or risk signals, a payout-account change request, ambiguity you cannot resolve with tools, or a policy block you cannot satisfy. Write a complete case file so the customer is never asked again.

Rules
- Placeholders like <VPA_1> or <PHONE_1> stand for redacted personal data. Use them as-is; never guess the real value.
- Never change a payout account. Never act on the customer's word alone.
- Prefer several independent lookups in one turn.
- After you have done everything you can for now, reply with one short status line and no tool calls.

Case context
- case_id: ${ctx.caseId}
- merchant_id: ${ctx.merchantId} (authenticated by the registered channel)
- channel: ${ctx.channel}${ctx.proactive ? " (proactive: opened by the event stream before any complaint)" : ""}
- merchant language: ${ctx.lang}
- triage signals: ${ctx.signals.join(", ") || "none"}
- current time (IST): ${ctx.now}`;
}

export class LlmBrain implements Brain {
  readonly kind = "llm" as const;
  private messages: Msg[] = [];
  constructor(system: string, firstUser: string) {
    this.messages.push({ role: "system", content: system }, { role: "user", content: firstUser });
  }

  async next(): Promise<BrainTurn> {
    const providers = configuredProviders();
    const attempts: string[] = [];
    for (const p of providers) {
      const model = await modelFor(p);
      try {
        const res = await fetch(`${p.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
          body: JSON.stringify({ model, messages: this.messages, tools: llmTools(), tool_choice: "auto", temperature: 0.2, max_tokens: 4096 }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) {
          attempts.push(`${p.name}:${model} HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
          continue;
        }
        const data = await res.json();
        const msg = data.choices?.[0]?.message;
        if (!msg) {
          attempts.push(`${p.name}:${model} empty response`);
          continue;
        }
        // Keep the assistant message as returned (including provider extras such as Gemini
        // thought signatures) so multi-turn tool calling stays valid.
        const clean: Msg = { role: "assistant", content: msg.content ?? (msg.tool_calls?.length ? null : "") };
        if (msg.tool_calls?.length) clean.tool_calls = msg.tool_calls;
        this.messages.push(clean);
        const calls: ToolCall[] = (msg.tool_calls ?? []).map((tc: any) => {
          try {
            return { id: tc.id, name: tc.function.name, input: tc.function.arguments ? JSON.parse(tc.function.arguments) : {} };
          } catch {
            return { id: tc.id, name: tc.function.name, input: {}, parseError: "Arguments were not valid JSON" };
          }
        });
        return { thought: typeof msg.content === "string" && msg.content.trim() ? msg.content.trim() : undefined, calls, by: `${p.name}:${model}` };
      } catch (e) {
        attempts.push(`${p.name}:${model} ${(e as Error).message}`);
      }
    }
    throw new ModelOutage(attempts.length ? attempts : ["no provider configured"]);
  }

  observe(results: ToolResult[]) {
    for (const r of results) {
      this.messages.push({
        role: "tool",
        tool_call_id: r.call.id,
        content: JSON.stringify(r.isError ? { error: r.output } : r.output),
      });
    }
  }

  event(text: string, data?: Record<string, unknown>) {
    this.messages.push({ role: "user", content: `[SYSTEM EVENT] ${text}${data ? `\n${JSON.stringify(data)}` : ""}` });
  }
}
