// Connector registry: what ResolveAI can plug into, whether it is configured here, and how to
// connect it. Powers the Integrations page. Status reflects configuration only; "configured"
// does not mean the live service has been exercised.

import { configuredProviders } from "../agent/llm.js";
import { sarvamEnabled, sarvamModels, SARVAM_LANGS } from "../voice/sarvam.js";
import { whatsappEnabled } from "../channels/whatsapp.js";
import { MCP_TOOLS } from "../mcp/handler.js";

export type ConnectorStatus = "connected" | "available" | "planned";

export interface Connector {
  id: string;
  name: string;
  group: "Brain" | "Voice & language" | "Channel" | "Agent tools" | "Memory";
  status: ConnectorStatus;
  detail: string;
  /** Env vars or commands needed to turn it on. */
  setup: string[];
}

export function connectors(publicUrl?: string): Connector[] {
  const llm = configuredProviders().map((p) => p.name);
  const has = (n: string) => llm.includes(n as never);
  const m = sarvamModels();
  const base = publicUrl ?? "http://localhost:8787";
  return [
    { id: "groq", name: "Groq", group: "Brain", status: has("groq") ? "connected" : "available", detail: "Primary tool-calling LLM (OpenAI-compatible).", setup: ["GROQ_API_KEY=…"] },
    { id: "gemini", name: "Google Gemini", group: "Brain", status: has("gemini") ? "connected" : "available", detail: "Fallback LLM if Groq fails.", setup: ["GEMINI_API_KEY=…"] },
    {
      id: "sarvam-chat",
      name: "Sarvam-105B",
      group: "Brain",
      status: has("sarvam") ? "connected" : "available",
      detail: `Indic-first chat model as a third fallback (${m.chat}). Tool calling verified against the live API.`,
      setup: ["SARVAM_API_KEY=…", "SARVAM_CHAT=1"],
    },
    {
      id: "sarvam-voice",
      name: "Sarvam Saaras + Bulbul",
      group: "Voice & language",
      status: sarvamEnabled() ? "connected" : "available",
      detail: `Voice-note speech-to-text (${m.asr}) and spoken replies (${m.tts}) in ${Object.keys(SARVAM_LANGS).length} languages.`,
      setup: ["SARVAM_API_KEY=…"],
    },
    {
      id: "sarvam-translate",
      name: "Sarvam Translate",
      group: "Voice & language",
      status: sarvamEnabled() ? "connected" : "available",
      detail: `Translates any agent reply into ${Object.keys(SARVAM_LANGS).length - 1} Indian languages (${m.translate}). Falls back to built-in templates for English, Hindi and Kannada.`,
      setup: ["SARVAM_API_KEY=…"],
    },
    {
      id: "wispr",
      name: "Wispr Flow dictation",
      group: "Voice & language",
      status: "available",
      detail: "No integration needed: the message box and approval fields are plain inputs, so Wispr Flow can dictate straight into them on desktop and mobile.",
      setup: ["Install Wispr Flow, focus any ResolveAI input, hold the dictation key"],
    },
    { id: "whatsapp", name: "WhatsApp (Twilio)", group: "Channel", status: whatsappEnabled() ? "connected" : "available", detail: "Real WhatsApp messages and voice notes, signature-verified.", setup: ["TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, PUBLIC_URL"] },
    {
      id: "mcp-http",
      name: "MCP server (HTTP)",
      group: "Agent tools",
      status: "connected",
      detail: `${MCP_TOOLS.length} tools for any MCP client. Money actions are not exposed; issues go through policy.`,
      setup: [`claude mcp add --transport http resolveai ${base}/mcp`],
    },
    {
      id: "mcp-stdio",
      name: "MCP server (local CLI)",
      group: "Agent tools",
      status: "available",
      detail: "Run ResolveAI as a local stdio MCP server for Claude Code, Cursor or Claude Desktop.",
      setup: ["claude mcp add resolveai -- npx tsx server/src/mcp/stdio.ts"],
    },
    {
      id: "falkordb",
      name: "FalkorDB graph memory",
      group: "Memory",
      status: "planned",
      detail: "Merchant, payer, transaction and case graph for repeat-issue and ring detection. Planned; not built.",
      setup: ["docker run -p 6379:6379 falkordb/falkordb"],
    },
  ];
}
