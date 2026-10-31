// Capture the console views used on the landing page (web/public/shots) and check shots (docs/media).
//   node scripts/shoot-console.mjs [baseUrl]
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = "web/public/shots";
const CHK = "docs/media";
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const room = `shoot-${Date.now().toString(36)}`;
const go = async (path) => {
  await p.goto(`${BASE}${path}${path.includes("?") ? "&" : "?"}room=${room}`);
  await p.waitForTimeout(900);
};

await go("/app");
await p.getByLabel("Brain").selectOption("planner");
// A resolved case first.
await p.getByRole("button", { name: /Manjunath/ }).first().click();
await p.waitForTimeout(2500);
await p.getByRole("button", { name: "+1 day", exact: true }).first().click();
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/console.png` });
await p.screenshot({ path: `${CHK}/check-app-console.png`, fullPage: true });

// Scenario H and the quarantine.
await p.getByRole("button", { name: /4,500 paid twice/ }).first().click();
await p.getByText("Rests on these facts").waitFor({ timeout: 15000 });
await p.screenshot({ path: `${CHK}/check-app-approval.png` });
await p.getByRole("button", { name: "Simulate late bank reversal" }).click();
await p.getByText("Belief invalidated").first().waitFor({ timeout: 10000 });
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/quarantine.png` });
await p.getByRole("tab", { name: "Provenance" }).click();
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/provenance.png` });
await p.getByRole("tab", { name: "Trace" }).click();

for (const [name, path] of [["approvals", "/app/approvals"], ["plugins", "/app/plugins"], ["evals", "/app/evals"], ["audit", "/app/audit"], ["cases", "/app/cases"], ["merchant", "/app/merchant"], ["impact", "/app/impact"]]) {
  await go(path);
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${name === "cases" || name === "merchant" || name === "impact" ? CHK + "/check-app-" : OUT + "/"}${name}.png` });
}
console.log("errors", JSON.stringify(errs));
await b.close();
