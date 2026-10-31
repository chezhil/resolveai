import { chromium } from "playwright-core";
import fs from "node:fs";
const BASE = process.argv[2] ?? "http://localhost:5173";
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto(`${BASE}/`);
await p.waitForTimeout(1500);
const total = await p.evaluate(() => document.documentElement.scrollHeight);
console.log("scrollHeight", total);
const how = await p.evaluate(() => document.querySelector("#how")?.getBoundingClientRect().top + scrollY);
const bel = await p.evaluate(() => document.querySelector("#belief")?.getBoundingClientRect().top + scrollY);
console.log("how", how, "belief", bel);
const shots = [["how-mid", how + 900], ["belief-start", bel + 100], ["belief-mid", bel + 900], ["belief-end", bel + 1700]];
for (const [n, y] of shots) {
  await p.evaluate((y) => window.scrollTo(0, y), y);
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `docs/media/check-${n}.png` });
}
console.log("errors", JSON.stringify(errs));
await b.close();
