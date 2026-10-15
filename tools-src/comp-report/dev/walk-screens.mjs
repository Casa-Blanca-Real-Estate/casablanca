// DEV ONLY — the Dispatch 14 walk: all 11 handoff screens at 1440px, in one scenario, against the local
// dev server and the fakes (see the CR-6 handoff in docs/dispatch/14-comp-report-design-port.md).
// playwright-core isn't a dependency: run 'npm i --no-save playwright-core' first; it uses the preinstalled
// Chromium at /opt/pw-browsers (never 'playwright install').
//   node tools-src/comp-report/dev/walk-screens.mjs <base> <outDir> <buyer|seller> <coop|condo> [email]
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [base = 'http://localhost:5173', out = join(here, 'out'), side = 'buyer', type = 'coop', email = 'kimani@casa-blanca.com'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const seed = (stage) => execFileSync('node', [join(here, 'seed-report.mjs'), base, stage, side, type, email], { encoding: 'utf8' }).trim().split('\n').at(-1);
const tag = `${side}-${type}`;
const errors = [];
const log = [];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function context(signedIn = true) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  if (signedIn) await ctx.addInitScript((e) => sessionStorage.setItem('cr-dev-session', e), email);
  // Dev tools stay off: the walk is what an agent sees.
  await ctx.addInitScript(() => { try { localStorage.removeItem('cr-build-notes'); localStorage.removeItem('cr-view-as-new-agent'); } catch {} });
  return ctx;
}
async function page(ctx, name) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: pageerror ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 4/.test(m.text())) errors.push(`${name}: console ${m.text()}`); });
  return p;
}
async function shot(p, name) {
  await p.waitForTimeout(900);
  const file = join(out, `${name}-${tag}.png`);
  await p.screenshot({ path: file, fullPage: true });
  log.push(file);
}
const settle = async (p) => { await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(600); };
const url = (id, q) => `${base}/tools/comp-report/?report=${id}&${q}`;

// 01 Sign in
{
  const ctx = await context(false);
  const p = await page(ctx, '01');
  await p.goto(`${base}/tools/comp-report/`);
  await settle(p);
  await shot(p, '01-sign-in');
  await ctx.close();
}
const ctx = await context(true);
// 02 Reports, 03 New report: the home
{
  const p = await page(ctx, '02');
  seed('sent');
  await p.goto(`${base}/tools/comp-report/`);
  await settle(p);
  await shot(p, '02-reports');
  const start = p.getByRole('button', { name: /new (report|comp)/i }).or(p.getByRole('link', { name: /new (report|comp)/i })).first();
  if (await start.count()) {
    await start.click();
    await settle(p);
    await shot(p, '03-new-home');
  } else errors.push('03: no "New report" button');
  await p.close();
}
// 04 details, 05 add comps (with the form open)
{
  const id = seed('sort');
  const p = await page(ctx, '04');
  await p.goto(url(id, 'start=details'));
  await settle(p);
  await shot(p, '04-new-details');
  await p.goto(url(id, 'start=comps'));
  await settle(p);
  const type1 = p.getByRole('button', { name: /^type one in$/i }).first();
  if (await type1.count()) await type1.click();
  else errors.push('05: no "Type one in"');
  await shot(p, '05-new-comps-add-form');
  await p.close();
}
// 06 Sort (with Hubert), 06b empty, 07 Gate
{
  const id = seed('sorted');
  const p = await page(ctx, '06');
  await p.goto(url(id, 'step=sort'));
  await settle(p);
  await shot(p, '06-sort');
  const row = p.locator('[aria-expanded="false"]').first();
  if (await row.count()) { await row.click().catch(() => {}); await shot(p, '06c-sort-expanded'); }
  await p.goto(url(id, 'step=gate'));
  await settle(p);
  await shot(p, '07-gate');
  await p.close();
  const empty = seed('empty');
  const q = await page(ctx, '06b');
  await q.goto(url(empty, 'step=sort'));
  await settle(q);
  await shot(q, '06b-sort-empty');
  await q.close();
}
// 08 Findings
{
  const id = seed('findings');
  const p = await page(ctx, '08');
  await p.goto(url(id, 'step=findings'));
  await settle(p);
  await shot(p, '08-findings');
  await p.close();
}
// 09 Send (Full), 10 Designed
{
  const id = seed('send');
  const p = await page(ctx, '09');
  await p.goto(url(id, 'step=send'));
  await settle(p);
  await shot(p, '09-send-full');
  const designed = p.getByRole('tab', { name: /designed/i }).or(p.getByRole('radio', { name: /designed/i })).or(p.getByRole('button', { name: /^designed$/i })).first();
  if (await designed.count()) { await designed.click(); await settle(p); await shot(p, '10-send-designed'); }
  else errors.push('10: no Designed tab');
  await p.close();
}
// 11 Done
{
  const id = seed('sent');
  const p = await page(ctx, '11');
  await p.goto(url(id, 'step=done'));
  await settle(p);
  await shot(p, '11-done');
  await p.close();
}
await ctx.close();
await browser.close();
writeFileSync(join(out, `walk-${tag}.json`), JSON.stringify({ shots: log, errors }, null, 1));
console.log(JSON.stringify({ shots: log.length, errors }, null, 1));
