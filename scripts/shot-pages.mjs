// Screenshot the landing page and the live console for the landing page and README.
//   node scripts/shot-pages.mjs [baseUrl]      (needs `npm run dev`; set CHROME_PATH if Chrome is elsewhere)

import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:5173";
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../web/public/shots");
const CHECK = path.resolve(here, "../docs/media");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CHECK, { recursive: true });
const CHROME =
  process.env.CHROME_PATH ??
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => fs.existsSync(p));

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Console with a resolved case.
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/app?room=shot-${Date.now().toString(36)}`);
  await page.getByText("Demo scenarios").waitFor();
  // Force the deterministic planner so the shot never depends on API keys in the environment.
  await page.getByLabel("Brain").selectOption("planner");
  await page.getByRole("button", { name: /Manjunath/ }).first().click();
  await sleep(7000);
  await page.getByRole("button", { name: "+1 day", exact: true }).first().click();
  await sleep(6000);
  await page.screenshot({ path: `${OUT}/console.png` });
  await page.screenshot({ path: `${CHECK}/check-console.png`, fullPage: true });
  await page.close();
}

// Landing at desktop and phone width, full page, motion settled.
for (const [name, viewport] of [["landing-desktop", { width: 1440, height: 900 }], ["landing-mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${BASE}/`);
  await sleep(1200);
  await page.screenshot({ path: `${CHECK}/check-${name}.png`, fullPage: true });
  await page.close();
}

await browser.close();
console.log("screenshots written to", OUT, "and", CHECK);
