// Overflow and error gate for the console pages at desktop, tablet and phone widths.
import { chromium } from "playwright-core";
const BASE = process.argv[2] ?? "http://localhost:5173";
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
let bad = 0;
const errs = [];
for (const w of [1440, 1024, 768, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  p.on("pageerror", (e) => errs.push(`${w}: ${e.message}`));
  for (const path of ["/app", "/app/merchant", "/app/approvals", "/app/cases", "/app/analytics", "/app/evals", "/app/audit", "/app/impact", "/app/plugins"]) {
    await p.goto(`${BASE}${path}?room=v-${w}`);
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, dashes: (document.body.innerText.match(/[\u2014\u2013]/g) || []).length }));
    const ok = r.sw <= r.iw;
    if (!ok) bad++;
    console.log(w, path.padEnd(16), ok ? "OK  " : "FAIL", `scrollWidth ${r.sw}/${r.iw}`, r.dashes ? `dashes:${r.dashes}` : "");
  }
  await p.close();
}
console.log("errors:", JSON.stringify(errs));
await b.close();
process.exit(bad || errs.length ? 1 : 0);
