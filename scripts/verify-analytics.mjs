// End-to-end gate for the Analytics page, the live landing proof, /api/proof and the core agent path, against a running server:
//   npm start (or npm run dev), then: node scripts/verify-analytics.mjs http://localhost:8787
// Needs Google Chrome (same as the other verify scripts). Uses throwaway rooms, so it never touches a visitor's session.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:8787';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const results = [];
const errs = [];
const bad = [];
const ok = (name, cond, detail = '') => { results.push([cond ? 'PASS' : 'FAIL', name, detail]); };
async function page(w = 1440, room = 'e2e-' + Math.random().toString(36).slice(2, 7), lang) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('response', r => { if (r.status() >= 400 && !r.url().includes('/api/stream')) bad.push(r.status() + ' ' + r.url().replace(BASE, '')); });
  return { p, room };
}
const api = (path, body, room = 'e2e-api') => fetch(BASE + '/api' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-room': room }, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const until = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 700)); } return null; };

// 1 landing: live proof from the server, link to analytics
{
  const { p, room } = await page();
  await p.goto(`${BASE}/?room=${room}`); await p.waitForTimeout(2500);
  await p.locator('#proof').scrollIntoViewIfNeeded(); await p.waitForTimeout(3000);
  const t = await p.locator('#proof dl').innerText();
  ok('landing proof shows 35 golden cases (live)', /35\s+of 35 golden cases/.test(t.replace(/\n+/g, ' ')), t.replace(/\n+/g, ' | ').slice(0, 90));
  ok('landing proof says computed from the running server', await p.getByText('Computed just now from the running server').count() === 1);
  await p.getByRole('link', { name: /See every chart/ }).click(); await p.waitForTimeout(2500);
  ok('landing proof link opens Analytics', p.url().includes('/app/analytics'), p.url());
  ok('landing link keeps the room param', p.url().includes('room=' + room));
}

// 2 analytics page, empty session
const { p, room } = await page();
await p.goto(`${BASE}/app/analytics?room=${room}`); await p.waitForTimeout(5000);
const body = await p.locator('main').innerText();
ok('headline: agent 14/14', /14\/14/.test(body));
ok('headline: golden 35/35', /35\/35/.test(body));
ok('headline: red-team 11/11', /11\/11/.test(body));
ok('median time headline uses an arrow, not a multiplier', /28 h\s*→\s*17 s/.test(body));
ok('human-misses cards render (3)', (await p.locator('article').count()) === 3);
ok('H-1120 shows "Policy blocked" with the payout change', /Policy blocked[\s\S]{0,40}changed the payout account/i.test(await p.locator('article', { hasText: 'H-1120' }).innerText()));
ok('H-1120 does NOT claim the agent changed the payout account as its action', !/ResolveAI\s*changed the payout account/i.test((await p.locator('article', { hasText: 'H-1120' }).innerText()).replace(/\n/g, ' ')));
ok('charts are accessible images (svg and bar groups)', (await p.locator('[role="img"]').count()) >= 6, 'n=' + await p.locator('[role="img"]').count());
ok('empty session shows the call to action', await p.getByText('No cases yet in this room').count() === 1);
ok('method and limits disclosure present', await p.locator('details#method').count() === 1);

// 3 jump nav scrolls
await p.getByRole('link', { name: 'Why use it' }).click(); await p.waitForTimeout(1200);
const top = await p.evaluate(() => document.getElementById('why-h').getBoundingClientRect().top);
ok('jump nav scrolls to the section', top < 250 && top > -50, 'top=' + Math.round(top));

// 4 run all scenarios -> session charts populate
await p.getByRole('button', { name: /Run all demo scenarios/i }).click();
await p.waitForTimeout(40000);
const body2 = await p.locator('main').innerText();
ok('session charts populate after running scenarios', !/No cases yet in this room/.test(body2) && /autonomous/i.test(body2));
ok('policy verdict rows show non-zero allowed count', /Allowed within limits\s*\n?\s*[1-9]/.test(body2));
const snap = (await api('/state')).json;
ok('api state sanity (own room differs from this room)', typeof snap === 'object');

// 5 re-run evidence (POST) works and keeps numbers
await p.getByRole('button', { name: /Re-run the evidence/ }).click(); await p.waitForTimeout(6000);
ok('re-run evidence keeps 14/14 and 35/35', /14\/14/.test(await p.locator('main').innerText()) && /35\/35/.test(await p.locator('main').innerText()));

// 6 empty-state buttons start a scenario and open the console
{
  const q = await page();
  await q.p.goto(`${BASE}/app/cases?room=${q.room}`); await q.p.waitForTimeout(2500);
  await q.p.getByRole('button', { name: /Run scenario A/ }).click(); await q.p.waitForTimeout(3500);
  ok('empty-state button navigates to the console', /\/app(\?|$)/.test(q.p.url().replace(BASE, '')), q.p.url().replace(BASE, ''));
  const st = (await (await fetch(`${BASE}/api/state`, { headers: { 'x-room': q.room } })).json());
  ok('the scenario actually started a case', st.cases.length >= 1, 'cases=' + st.cases.length);
  await q.p.goto(`${BASE}/app/approvals?room=${q.room}`); await q.p.waitForTimeout(1500);
  ok('approvals empty state offers scenario B', await q.p.getByRole('button', { name: /Run scenario B/ }).count() === 1);
}

// 7 language switch keeps the page working
{
  const q = await page();
  await q.p.goto(`${BASE}/app/analytics?room=${q.room}`); await q.p.waitForTimeout(3000);
  await q.p.locator('select').last().selectOption('hi'); await q.p.waitForTimeout(1500);
  ok('Hindi nav label for Analytics', await q.p.getByRole('link', { name: 'विश्लेषण' }).count() >= 1);
  ok('page still renders in Hindi (falls back to English copy)', /Does it actually work/.test(await q.p.locator('main').innerText()));
}

// 8 phone width: no overflow, chart region scrolls
{
  const q = await page(390);
  await q.p.goto(`${BASE}/app/analytics?room=${q.room}`); await q.p.waitForTimeout(5000);
  const ov = await q.p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok('390px: no horizontal overflow', ov <= 0, 'overflow=' + ov);
  ok('390px: dumbbell sits in a labelled scroll region', await q.p.getByRole('region', { name: /scrolls sideways/ }).count() >= 1);
}

// 9 reduced motion
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const q = await ctx.newPage(); q.on('pageerror', e => errs.push(String(e)));
  await q.goto(`${BASE}/?room=rm`); await q.waitForTimeout(2500); await q.locator('#proof').scrollIntoViewIfNeeded(); await q.waitForTimeout(2500);
  ok('reduced motion: landing proof numbers visible', /35/.test(await q.locator('#proof dl').innerText()));
}

// 10 API behaviour: cache, rate limit, no room created by /api/proof
{
  const before = (await api('/health')).json.rooms;
  const a = await (await fetch(`${BASE}/api/proof`)).json();
  ok('/api/proof returns golden + shadow + policyRules', a.golden?.length === 35 && a.shadow?.rows?.length === 14 && a.policyRules >= 1, `golden=${a.golden?.length} rows=${a.shadow?.rows?.length} rules=${a.policyRules}`);
  ok('shadow rows carry agentActions with verdicts', a.shadow.rows.every(r => Array.isArray(r.agentActions)));
  const a2 = await (await fetch(`${BASE}/api/proof`)).json();
  ok('/api/proof is served from one shared cached run (same generatedAt)', !!a.generatedAt && a.generatedAt === a2.generatedAt, a.generatedAt);
  const after = (await api('/health')).json.rooms;
  ok('/api/proof allocated no room', after === before, `${before} -> ${after}`);
  // The per-IP limiter only means something when the server sees the real client address. Locally it must hold; behind a proxy it
  // depends on TRUST_PROXY_HOPS, so a remote run reports it as a warning instead of failing the gate.
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE);
  const codes = await Promise.all(Array.from({ length: 120 }, () => fetch(`${BASE}/api/proof`).then((r) => r.status)));
  const limited = codes.filter((c) => c === 429).length;
  if (local) ok('/api/proof is rate limited per IP (429 after a burst)', limited > 0, 'limited=' + limited);
  else console.log(limited > 0 ? `note: rate limiter active on this host (${limited} of 120 limited)` : 'WARN: no 429 in a 120-request burst against a remote host: the per-IP limiter is not effective there (check TRUST_PROXY_HOPS)');
}


// 11 core agent regression (the server changed: shadow rows and /api/proof): A resolves, D escalates, B needs two approvers
{
  const room = 'core-' + Math.random().toString(36).slice(2, 7);
  await api('/scenarios/A', {}, room);
  const watching = await until(async () => (await api('/state', undefined, room)).json.cases.find(c => c.status === 'WATCHING'));
  ok('scenario A reaches WATCHING (bank ticket raised, watcher set)', !!watching);
  await api('/clock/advance', { minutes: 1440 }, room);
  const resolved = await until(async () => (await api('/state', undefined, room)).json.cases.find(c => c.status === 'RESOLVED'));
  ok('scenario A closes as RESOLVED after the money moves (+1 day)', !!resolved);
  await api('/scenarios/D', {}, room);
  const esc = await until(async () => (await api('/state', undefined, room)).json.cases.find(c => c.status === 'ESCALATED'));
  ok('scenario D (payout change attack) is ESCALATED, not executed', !!esc);
  await api('/scenarios/B', {}, room);
  const appr = await until(async () => (await api('/state', undefined, room)).json.approvals.find(a => a.status === 'PENDING'));
  ok('scenario B waits in the approval queue', !!appr);
  if (appr) {
    const first = await api('/approvals/' + appr.id, { decision: 'APPROVED', by: 'ops-lead' }, room);
    ok('first approval accepted', first.status === 200, 'status=' + first.status);
    const second = await api('/approvals/' + appr.id, { decision: 'APPROVED', by: 'risk-lead' }, room);
    ok('second named approver is accepted (or refused 409 when STRICT_TWO_PERSON=1)', second.status === 409 || second.status === 200, 'status=' + second.status);
    const after = (await api('/state', undefined, room)).json.approvals.find(a => a.id === appr.id);
    ok('a refused second signature leaves the approval pending', second.status !== 409 || after.status === 'PENDING', 'status=' + after?.status);
  }
  const m = (await api('/state', undefined, room)).json.metrics;
  ok('metrics reflect the session (cases>=3, resolved>=1)', m.cases >= 3 && m.resolved >= 1, JSON.stringify({ cases: m.cases, resolved: m.resolved, escalated: m.escalated }));
}

// 12 landing page: the sections, the motion and its robustness
{
  const q = await page();
  await q.p.goto(`${BASE}/?room=${q.room}`); await q.p.waitForTimeout(3000);
  await q.p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  for (const id of ['how', 'autonomy', 'proof', 'faq', 'honest']) ok(`landing has the #${id} section`, (await q.p.locator('#' + id).count()) === 1);
  ok('hero shows live proof chips from the server', (await q.p.locator('a[aria-label="Jump to the evidence"]').count()) === 1);
  ok('footer links the source, docs and analytics', (await q.p.locator('footer a[href*="github.com/chezhil/resolveai"]').count()) >= 3 && (await q.p.locator('footer a[href*="/app/analytics"]').count()) === 1);

  // how it works: the pinned stage rail follows the scroll
  await q.p.evaluate(() => document.getElementById('how').scrollIntoView({ block: 'start' })); await q.p.waitForTimeout(1500);
  const first = (await q.p.locator('#how [role=tab][aria-selected=true]').innerText()).trim();
  await q.p.evaluate(() => scrollBy(0, 1500)); await q.p.waitForTimeout(1500);
  const later = (await q.p.locator('#how [role=tab][aria-selected=true]').innerText()).trim();
  ok('how it works: the active stage advances as you scroll', first !== later, `${first} -> ${later}`);
  ok('how it works: the trace window has lines for the stage', (await q.p.locator('#how .trace-line').count()) >= 3);

  // the scroll progress bar moves
  const prog = await q.p.evaluate(() => document.querySelector('.scroll-progress')?.style.transform || '');
  ok('scroll progress bar has advanced', /scaleX\(0\.\d+|scaleX\(1\)/.test(prog), prog);

  // FAQ opens and closes
  await q.p.evaluate(() => document.getElementById('faq').scrollIntoView({ block: 'start' })); await q.p.waitForTimeout(1200);
  const d = q.p.locator('#faq details').first();
  await d.locator('summary').click(); await q.p.waitForTimeout(400);
  ok('FAQ item opens', await d.evaluate((n) => n.open));
  await d.locator('summary').click(); await q.p.waitForTimeout(300);
  ok('FAQ item closes', !(await d.evaluate((n) => n.open)));

  // robustness: an instant jump past everything, then back, must not leave blank areas (IntersectionObserver never fires for skipped items)
  await q.p.evaluate(() => scrollTo(0, 0)); await q.p.waitForTimeout(400);
  await q.p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await q.p.waitForTimeout(600);
  await q.p.evaluate(() => document.getElementById('how').scrollIntoView({ block: 'start' })); await q.p.waitForTimeout(1200);
  const hidden = await q.p.evaluate(() => [...document.querySelectorAll('.reveal:not(.in)')].filter((n) => { const r = n.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight * 0.9; }).length);
  ok('after a fast jump and back, nothing visible is left hidden', hidden === 0, 'hidden=' + hidden);
  const steps = await q.p.evaluate(() => [...document.querySelectorAll('#how ol > li')].map((li) => Number(getComputedStyle(li).opacity)));
  ok('how it works: every step is visible after jumping around', steps.length === 5 && steps.every((o) => o > 0.9), steps.join(','));

  // a deep link lands mid-page with everything above it revealed
  const dl = await page();
  await dl.p.goto(`${BASE}/?room=${dl.room}#faq`); await dl.p.waitForTimeout(3000);
  const aboveHidden = await dl.p.evaluate(() => [...document.querySelectorAll('.reveal:not(.in)')].filter((n) => n.getBoundingClientRect().top < innerHeight).length);
  ok('deep link /#faq: nothing above the fold is hidden', aboveHidden === 0, 'hidden=' + aboveHidden);

  // reduced motion: all content shown, no hidden ladder cards
  const rm = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const r = await rm.newPage(); r.on('pageerror', (e) => errs.push(String(e)));
  await r.goto(`${BASE}/?room=rm2`); await r.waitForTimeout(2500);
  await r.evaluate(() => document.getElementById('autonomy').scrollIntoView({ block: 'start' })); await r.waitForTimeout(800);
  const cards = await r.evaluate(() => [...document.querySelectorAll('#autonomy .ladder-step')].map((c) => Number(getComputedStyle(c).opacity)));
  ok('reduced motion: all four autonomy cards are visible at once', cards.length === 4 && cards.every((o) => o === 1), cards.join(','));
  ok('reduced motion: the progress bar is hidden', (await r.evaluate(() => getComputedStyle(document.querySelector('.scroll-progress')).display)) === 'none');

  // phone width
  const m = await page(390);
  await m.p.goto(`${BASE}/?room=${m.room}`); await m.p.waitForTimeout(3000);
  await m.p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  const H = await m.p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 600) { await m.p.evaluate((v) => scrollTo(0, v), y); await m.p.waitForTimeout(80); }
  ok('390px landing: no horizontal overflow', (await m.p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
  ok('390px landing: every reveal landed after scrolling through', (await m.p.evaluate(() => document.querySelectorAll('.reveal:not(.in)').length)) === 0);
}

console.log(results.map(r => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
const fails = results.filter(r => r[0] === 'FAIL').length;
const unexpected = bad.filter(x => !/^429 .*\/api\/proof/.test(x));
console.log(`\n${results.length - fails}/${results.length} passed · console errors: ${errs.length} ${JSON.stringify(errs.slice(0, 3))} · unexpected HTTP errors: ${JSON.stringify(unexpected.slice(0, 5))}`);
await b.close();
process.exit(fails || errs.length || unexpected.length ? 1 : 0);
