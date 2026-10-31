import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(process.argv[2] ?? "http://localhost:5173/");
await p.waitForTimeout(1500);
for (const id of ["problem", "playground", "defense", "console", "proof", "languages", "plugins", "honest"]) {
  await p.evaluate((id) => { const e = document.getElementById(id); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 70); }, id);
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `docs/media/check-sec-${id}.png` });
}
await b.close();
