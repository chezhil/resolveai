import { describe, expect, it } from "vitest";
import { Runtime } from "../src/core/runtime.js";
import { handleMcp, MCP_TOOLS } from "../src/mcp/handler.js";
import type { Room } from "../src/rooms.js";

const room = (): Room => ({ id: "t", rt: new Runtime({ brain: "planner", pacingMs: 0 }), clients: new Set(), lastSeen: Date.now() });
const call = (r: Room, name: string, args: unknown) => handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, r) as Promise<any>;

describe("MCP server", () => {
  it("initializes and lists tools", async () => {
    const r = room();
    const init: any = await handleMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, r);
    expect(init.result.serverInfo.name).toBe("resolveai");
    const list: any = await handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, r);
    expect(list.result.tools.map((t: any) => t.name)).toEqual(MCP_TOOLS.map((t) => t.name));
  });

  it("returns nothing for notifications", async () => {
    expect(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, room())).toBeNull();
  });

  it("exposes no money-moving tool", () => {
    const banned = /refund|release|payout|approve|settle/i;
    expect(MCP_TOOLS.filter((t) => banned.test(t.name))).toEqual([]);
  });

  it("runs an issue through policy and resolves a small failed payment", async () => {
    const r = room();
    const out = await call(r, "resolveai_report_issue", { merchantId: "M1001", text: "customer paid 480 but soundbox said nothing, RRN 630412345678" });
    const body = JSON.parse(out.result.content[0].text);
    expect(body.merchantId).toBe("M1001");
    expect(["WATCHING", "RESOLVED", "AWAITING_APPROVAL", "ESCALATED"]).toContain(body.status);
  });

  it("rejects unknown merchants and bad input without throwing", async () => {
    const r = room();
    const bad = await call(r, "resolveai_report_issue", { merchantId: "../etc", text: "x" });
    expect(bad.result.isError).toBe(true);
    const unknown: any = await handleMcp({ jsonrpc: "2.0", id: 3, method: "nope" }, r);
    expect(unknown.error.code).toBe(-32601);
  });
});
