// Run ResolveAI as a local MCP server over stdio:
//   claude mcp add resolveai -- npx tsx server/src/mcp/stdio.ts
// Logs go to stderr so stdout stays a clean JSON-RPC stream.

import "../env.js";
import readline from "node:readline";
import { getRoom } from "../rooms.js";
import { handleMcp } from "./handler.js";

const room = getRoom("mcp-stdio");
const rl = readline.createInterface({ input: process.stdin });

rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
    return;
  }
  const out = await handleMcp(msg, room);
  if (out) process.stdout.write(`${JSON.stringify(out)}\n`);
});

console.error("[resolveai-mcp] ready on stdio");
