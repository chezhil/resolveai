// Capture README screenshots and the demo GIF from a running console (npm run dev).
// Uses a locally installed Chrome; set CHROME_PATH to override.
//   node scripts/capture.mjs [baseUrl]

import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import gifenc from "gifenc";
import fs from "node:fs";

const { GIFEncoder, quantize, applyPalette } = gifenc;
const BASE = process.argv[2] ?? "http://localhost:5173";
const OUT = new URL("../docs/media/", import.meta.url).pathname;
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(room, viewport = { width: 1480, height: 940 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const id = `${room}-${Date.now().toString(36)}`;
  await page.goto(`${BASE}/app?room=${id}`);
  await page.getByText("Demo scenarios").waitFor();
  // Pin the deterministic planner so shots never depend on API keys in the environment.
  await page.getByLabel("Brain").selectOption("planner", { timeout: 3000 }).catch(() => {}); // hidden at phone width; no keys means planner anyway
  page.roomId = id;
  return page;
}
const go = async (page, path) => {
  await page.goto(`${BASE}/app${path}?room=${page.roomId}`);
  await sleep(900);
};
const scenario = (page, title) => page.getByRole("button", { name: new RegExp(title) }).first().click();
const clock = (page, label) => page.getByRole("button", { name: label, exact: true }).first().click();
const shot = async (page, name, opts = {}) => {
  // The console header is sticky; in a full-page shot it would repeat mid-page.
  if (opts.fullPage) await page.addStyleTag({ content: "header{position:static !important}" });
  return page.screenshot({ path: `${OUT}${name}.png`, ...opts });
};

// 1. Workflow A, with a GIF of the whole loop.
{
  const page = await open("cap-a", { width: 1280, height: 800 });
  const frames = [];
  const grab = async () => frames.push(PNG.sync.read(await page.screenshot()));
  await scenario(page, "Manjunath");
  for (let i = 0; i < 22; i++) {
    await grab();
    await sleep(380);
  }
  await shot(page, "01-console-failed-payment");
  await clock(page, "+1 day");
  for (let i = 0; i < 10; i++) {
    await grab();
    await sleep(400);
  }
  await shot(page, "02-verified-and-closed");
  await page.evaluate(() => window.scrollTo(0, 0));

  const scale = 0.7;
  const w = Math.round(frames[0].width * scale);
  const h = Math.round(frames[0].height * scale);
  const gif = GIFEncoder();
  for (const [i, f] of frames.entries()) {
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = Math.min(f.width - 1, Math.floor(x / scale));
        const sy = Math.min(f.height - 1, Math.floor(y / scale));
        const si = (sy * f.width + sx) * 4;
        rgba.set(f.data.subarray(si, si + 4), (y * w + x) * 4);
      }
    }
    const palette = quantize(rgba, 128);
    gif.writeFrame(applyPalette(rgba, palette), w, h, { palette, delay: i === frames.length - 1 ? 2500 : 380 });
  }
  gif.finish();
  fs.writeFileSync(`${OUT}demo.gif`, gif.bytes());
  await page.close();
}

// 2. Workflow B: L2 approval card.
{
  const page = await open("cap-b");
  await scenario(page, "Priya");
  await page.getByRole("button", { name: /Approve as/ }).first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: /Approve as/ }).first().click();
  await sleep(600);
  await shot(page, "03-l2-approval");
  await page.close();
}

// 3. Guardrail D: social engineering blocked and escalated.
{
  const page = await open("cap-d");
  await scenario(page, "Change my payout");
  await page.getByText("Case file for human").waitFor({ timeout: 20000 });
  await sleep(600);
  await shot(page, "04-guardrail-escalation");
  await page.close();
}

// 4. Evals.
{
  const page = await open("cap-e");
  await go(page, "/evals");
  await page.getByRole("button", { name: "Run with offline planner" }).click();
  await page.getByText("golden cases passed").waitFor({ timeout: 60000 });
  await sleep(500);
  await shot(page, "05-evals", { fullPage: true });
  await page.close();
}

// 5. Audit log tamper detection.
{
  const page = await open("cap-f");
  await scenario(page, "Arjun");
  await page.getByText("Verified & closed").first().waitFor({ timeout: 20000 });
  await go(page, "/audit");
  await page.getByRole("button", { name: "Tamper: rewrite chain" }).click();
  await page.getByText(/contradicted/).waitFor();
  await sleep(400);
  await shot(page, "06-audit-tamper");
  await page.close();
}

// 5b. Analytics and proof, filled by running every demo scenario.
{
  const page = await open("cap-g", { width: 1480, height: 940 });
  await go(page, "/analytics");
  await page.getByRole("button", { name: "Run all demo scenarios" }).click();
  await sleep(12000);
  await shot(page, "08-analytics", { fullPage: true });
  await page.close();
}

// 6. Phone width.
{
  const page = await open("cap-m", { width: 390, height: 844 });
  await scenario(page, "Manjunath");
  await sleep(8000);
  await page.evaluate(() => window.scrollTo(0, 600));
  await shot(page, "07-mobile");
  await page.close();
}

await browser.close();
for (const f of fs.readdirSync(OUT)) console.log(`${f}  ${(fs.statSync(OUT + f).size / 1024).toFixed(0)} KB`);
