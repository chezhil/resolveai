// ResolveAI as an MCP server (Model Context Protocol, JSON-RPC 2.0).
// Any MCP client (Claude Code, Cursor, Claude Desktop, a local CLI) can report an issue, read a
// case, run a demo scenario or search the knowledge base. Money actions are never exposed as
// tools: an issue goes through the same triage -> brain -> policy -> capability -> verifier
// pipeline as a WhatsApp message, and approvals stay with humans in the console.

import type { Room } from "../rooms.js";
import { SCENARIOS } from "../sim/scenarios.js";
import { searchKb } from "../sim/kb.js";
import { RULES } from "../policy/engine.js";

const PROTOCOL = "2025-03-26";

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, any>, room: Room) => Promise<unknown> | unknown;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

const caseSummary = (room: Room, id: string) => {
  const k = room.rt.cases.get(id);
  if (!k) throw new Error(`Unknown case ${id}`);
  const messages = room.rt.caseDetail(id)?.messages ?? [];
  return {
    id: k.id,
    merchantId: k.merchantId,
    workflow: k.workflow,
    status: k.status,
    maxLevel: k.maxLevel,
    summary: k.summary ?? null,
    rootCause: k.rootCause ?? null,
    actions: k.actions.map((a) => ({ tool: a.tool, level: a.level, verdict: a.verdict })),
    awaitingApproval: [...room.rt.approvals.values()].filter((a) => a.caseId === id && a.status === "PENDING").map((a) => ({ id: a.id, tool: a.tool, summary: a.summary })),
    lastAgentMessage: [...messages].reverse().find((m: any) => m.from === "agent" && m.to === "merchant")?.text ?? null,
  };
};

export const MCP_TOOLS: McpTool[] = [
  {
    name: "resolveai_report_issue",
    description:
      "Report a merchant's payment problem in plain text (any language). ResolveAI diagnoses it against the simulated Paytm systems, acts only within policy, and returns the case status. Money above the limits waits for a human approval in the console.",
    inputSchema: obj({ merchantId: { type: "string", description: "Merchant id, e.g. M1001" }, text: { type: "string", description: "The merchant's message" } }, ["merchantId", "text"]),
    run: async ({ merchantId, text }, room) => {
      if (!/^M\d{3,6}$/.test(String(merchantId))) throw new Error("merchantId must look like M1001");
      if (!room.rt.world.merchants.has(merchantId)) throw new Error(`Unknown merchant ${merchantId}`);
      const k = room.rt.inbound(merchantId, String(text).slice(0, 2000), "in-app");
      await room.rt.idle();
      return caseSummary(room, k.id);
    },
  },
  {
    name: "resolveai_get_case",
    description: "Get the current status, actions and last message of a case.",
    inputSchema: obj({ caseId: { type: "string" } }, ["caseId"]),
    run: ({ caseId }, room) => caseSummary(room, String(caseId)),
  },
  {
    name: "resolveai_list_cases",
    description: "List recent cases in this session with status and risk level.",
    inputSchema: obj({}),
    run: (_a, room) => [...room.rt.cases.values()].slice(-20).map((k) => ({ id: k.id, merchantId: k.merchantId, workflow: k.workflow, status: k.status, maxLevel: k.maxLevel })),
  },
  {
    name: "resolveai_list_pending_approvals",
    description: "List actions waiting for human approval. Read-only: approving happens in the console with an approver PIN.",
    inputSchema: obj({}),
    run: (_a, room) => [...room.rt.approvals.values()].filter((a) => a.status === "PENDING").map((a) => ({ id: a.id, caseId: a.caseId, tool: a.tool, amount: a.amount, required: a.required, summary: a.summary })),
  },
  {
    name: "resolveai_run_scenario",
    description: "Run a built-in demo scenario (A failed payment, B settlement hold, C dispute, D account change, E proactive, F angry/vague, G duplicate debit).",
    inputSchema: obj({ id: { type: "string", enum: SCENARIOS.map((s) => s.id) } }, ["id"]),
    run: async ({ id }, room) => {
      const s = SCENARIOS.find((x) => x.id === id);
      if (!s) throw new Error("Unknown scenario");
      s.run(room.rt);
      await room.rt.idle();
      return [...room.rt.cases.values()].slice(-3).map((k) => caseSummary(room, k.id));
    },
  },
  {
    name: "resolveai_advance_clock",
    description: "Move the simulated clock forward (minutes, max 10080) so watchers fire and money lands.",
    inputSchema: obj({ minutes: { type: "integer", minimum: 1, maximum: 10080 } }, ["minutes"]),
    run: async ({ minutes }, room) => {
      room.rt.advance(Math.max(1, Math.min(10080, Math.floor(Number(minutes)))));
      await room.rt.idle();
      return { now: room.rt.snapshot().nowLabel };
    },
  },
  {
    name: "resolveai_search_kb",
    description: "Search the RBI / NPCI / SOP knowledge base the agent uses.",
    inputSchema: obj({ query: { type: "string" } }, ["query"]),
    run: ({ query }) => searchKb(String(query), 3),
  },
  {
    name: "resolveai_policy_rules",
    description: "List the deterministic policy rules (P0 to P14) that gate every action.",
    inputSchema: obj({}),
    run: () => RULES,
  },
];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

/** Handle one JSON-RPC message. Returns null for notifications (no response). */
export async function handleMcp(msg: Rpc, room: Room, serverVersion = "1.0.0") {
  const { id = null, method, params } = msg;
  if (!method) return fail(id, -32600, "Invalid request");
  if (id === null || id === undefined) return null;
  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "resolveai", version: serverVersion },
        instructions: "ResolveAI: autonomous support teammate for Paytm merchants (simulated systems). Use resolveai_report_issue to open a case.",
      });
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: MCP_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = MCP_TOOLS.find((t) => t.name === params?.name);
      if (!tool) return fail(id, -32602, `Unknown tool ${params?.name}`);
      try {
        const out = await tool.run(params?.arguments ?? {}, room);
        return ok(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        return ok(id, { isError: true, content: [{ type: "text", text: (e as Error).message }] });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}
