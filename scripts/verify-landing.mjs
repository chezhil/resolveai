// Visual and structural gate for the landing page: screenshots, horizontal overflow at four widths,
// reveals landed, fonts loaded, no em or en dashes in visible text, console errors.
//   node scripts/verify-landing.mjs [baseUrl]
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5173";
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const errs = [];
let bad = 0;

for (const w of [1440, 1024, 768, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
  p.on("pageerror", (e) => errs.push(`${w}: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && errs.push(`${w}: ${m.text()}`));
  await p.goto(`${BASE}/`);
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `docs/media/check-v-${w}-hero.png` });
  // fire reveals
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 500) {
    await p.evaluate((y) => window.scrollTo(0, y), y);
    await p.waitForTimeout(120);
  }
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: innerWidth,
    reveals: document.querySelectorAll(".reveal").length,
    revealed: document.querySelectorAll(".reveal.in").length,
    fonts: ["700 20px 'Bricolage Grotesque Variable'", "400 14px 'Schibsted Grotesk'", "400 12px 'JetBrains Mono'"].map((f) => document.fonts.check(f)),
    dashes: (document.body.innerText.match(/[\u2014\u2013]/g) || []).length,
  }));
  const ok = r.sw <= r.iw && r.reveals === r.revealed && r.fonts.every(Boolean) && r.dashes === 0;
  if (!ok) bad++;
  console.log(w, ok ? "OK " : "FAIL", JSON.stringify(r));
  if (w === 1440 || w === 390) await p.screenshot({ path: `docs/media/check-v-${w}-full.png`, fullPage: true });
  await p.close();
}
console.log("console errors:", JSON.stringify(errs));
await b.close();
process.exit(bad || errs.length ? 1 : 0);
