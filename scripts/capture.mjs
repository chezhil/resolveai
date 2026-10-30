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
  await page.goto(`${BASE}/?room=${room}-${Date.now().toString(36)}`);
  await page.getByText("Demo scenarios").waitFor();
  return page;
}
const scenario = (page, title) => page.getByRole("button", { name: new RegExp(title) }).first().click();
const clock = (page, label) => page.getByRole("button", { name: label, exact: true }).first().click();
const shot = (page, name, opts = {}) => page.screenshot({ path: `${OUT}${name}.png`, ...opts });

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
  await page.getByRole("button", { name: "Approve as Ops lead" }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Approve as Ops lead" }).click();
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
  await page.getByRole("button", { name: "Evals & shadow" }).click();
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
  await page.getByRole("button", { name: "Audit log" }).click();
  await page.getByRole("button", { name: "Tamper: rewrite chain" }).click();
  await page.getByText(/contradicted/).waitFor();
  await sleep(400);
  await shot(page, "06-audit-tamper");
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
