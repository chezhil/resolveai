// `npm run eval` — golden cases + shadow replay. Exits non-zero on any failure (used in CI).
//   --llm              run the golden cases against Groq/Gemini instead of the offline planner
//   --json <file>      also write a machine-readable report (pass rates per category, latency,
//                      shadow metrics); relative paths resolve from where you ran npm

import "../env.js";
import { configuredProviders } from "../agent/llm.js";
import { runGolden } from "./golden.js";
import { runShadowReplay } from "./shadow.js";
import { buildReport } from "./report.js";
import fs from "node:fs";
import path from "node:path";

function jsonTarget(argv: string[]): string | null {
  const i = argv.findIndex((a) => a === "--json" || a.startsWith("--json="));
  if (i < 0) return null;
  const value = argv[i].includes("=") ? argv[i].slice("--json=".length) : argv[i + 1];
  if (!value || value.startsWith("--")) {
    console.error("--json needs a file path, e.g. npm run eval -- --json eval-report.json");
    process.exit(2);
  }
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), value);
}
const jsonOut = jsonTarget(process.argv.slice(2));

const llm = process.argv.includes("--llm");
const results = await runGolden({ brain: llm ? "llm" : "planner" });

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
console.log(`\nResolveAI golden cases (${llm ? `LLM: ${configuredProviders().map((p) => p.name).join(" → ")}` : "offline planner"})\n`);
for (const r of results) {
  console.log(`${r.pass ? "✅" : "❌"} ${r.id}  ${pad(r.title, 70)} ${pad(String(r.status ?? "-"), 18)} ${r.maxLevel ?? ""}`);
  for (const c of r.checks.filter((c) => !c.pass)) console.log(`      ✗ ${c.name}${c.detail ? ` (${c.detail})` : ""}`);
}
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} golden cases passed`);

const shadow = await runShadowReplay();
console.log(`\nShadow replay on ${shadow.rows.length} historical tickets`);
for (const r of shadow.rows) {
  console.log(`${r.correct ? "✅" : "❌"} ${r.id}  human: ${pad(r.humanAction, 24)} right call: ${pad(r.gold, 24)} agent: ${r.agentProposed.join(", ")}`);
  if (r.note) console.log(`      ${r.note}`);
}
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
console.log(`\nAgent made the right call: ${pct(shadow.agentCorrect)} · human did: ${pct(shadow.humanCorrect)} · agreement with human: ${pct(shadow.agreement)} · contacts avoided: ${shadow.contactsAvoided}\n`);

if (jsonOut) {
  const report = buildReport({ brain: llm ? "llm" : "planner", golden: results, shadow });
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2) + "\n");
  console.log(`JSON report written to ${jsonOut}\n`);
}

process.exit(passed === results.length ? 0 : 1);
