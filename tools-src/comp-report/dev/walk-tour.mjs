// DEV ONLY — the walk for the pointing tour (QW-3, 2026-11-10): a new agent's first-visit offer and
// "Walk me through it", the card on the reports list and on each step of the New report window, then on
// Sort, the Gate, Findings, Send and Done of seeded reports (started from the guide's "Point me through it"),
// that a click on the target moves it on, that it hides under the guide and Review comps, and that Hubert's
// panel still opens beside it. Against the local dev server.
//   node tools-src/comp-report/dev/walk-tour.mjs <base> <outDir> [width]
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [base = 'http://localhost:5173', out = join(here, 'out'), width = '1440'] = process.argv.slice(2);
const AGENT = `tour-walk-${Date.now()}@casa-blanca.com`;
const OWNER = 'kimani@casa-blanca.com';
mkdirSync(out, { recursive: true });
const seed = (stage) => execFileSync('node', [join(here, 'seed-report.mjs'), base, stage, 'buyer', 'condo', OWNER], { encoding: 'utf8' }).trim().split('\n').pop();
const sortId = seed('sort');
const sentId = seed('sent');
const findingsId = seed('findings');
const sendId = seed('send');
const errors = [];
const expect = (ok, what) => { if (!ok) errors.push(`expected: ${what}`); };

const browser = await chromium.launch({ executablePath: chromePath() });
const w = Number(width);
const viewport = { width: w, height: w > 2000 ? 1300 : 900 };
const as = async (email) => {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((e) => sessionStorage.setItem('cr-dev-session', e), email);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror ${e}`));
  return page;
};
let p = await as(AGENT);
const shot = async (name) => { await p.waitForTimeout(600); await p.screenshot({ path: join(out, `${name}.png`) }); };
const title = async () => (await p.locator('.tr-title').count()) ? p.locator('.tr-title').innerText() : null;

// A new agent: the offer, then the tour on the reports list.
await p.goto(`${base}/tools/comp-report/`);
await p.waitForSelector('.gd-offer');
await shot('01-offer');
await p.getByRole('button', { name: 'Walk me through it' }).click();
await p.waitForSelector('.tr-card');
expect((await title()) === 'Start a report here', 'the first tip points at Start with Hubert');
await shot('02-reports-start');

// The guide covers it, and the tour waits.
await p.keyboard.press('?');
await p.waitForSelector('[data-testid=guide]');
expect(await p.locator('.tr-card').count() === 0, 'no card while the guide is open');
await p.keyboard.press('Escape');
await p.waitForSelector('.tr-card');

// + New comp: the window's three steps.
await p.getByRole('button', { name: '+ New comp' }).click();
await p.waitForSelector('.nr-modal');
await p.waitForSelector('.tr-card');
expect((await title()) === 'The home you’re pricing', 'step 1 points at the link field');
await shot('03-new-home-link');
await p.locator('.tr-card .btn.primary').click(); // Got it
await p.waitForTimeout(500);
expect((await title()) === 'Who it’s for', 'Got it moves to the next tip');
await shot('04-new-home-side');
await p.locator('.nr-x').first().click();
await p.waitForTimeout(400);

// The rest as an admin with seeded reports, started from the guide.
p = await as(OWNER);
await p.goto(`${base}/tools/comp-report/?report=${sortId}&step=sort`);
await p.waitForSelector('.so-row');
await p.getByRole('button', { name: /^Guide/ }).click();
await p.getByRole('button', { name: 'Point me through it' }).click();
await p.waitForSelector('.tr-card');
expect((await title()) === 'Open a comp', 'Sort points at a row');
await shot('05-sort-row');
await p.locator('.so-row').first().click(); // the click on the target moves it on
await p.waitForTimeout(600);
const afterRow = await title();
expect(afterRow === 'Or go one at a time' || afterRow === 'Findings opens when they’re done', `a click on the row moves on (got ${afterRow})`);
await shot('06-sort-next');
if (await p.locator('.sh-head .sh-review').count()) {
  await p.locator('.sh-head .sh-review').click();
  await p.waitForSelector('.rv-modal');
  await p.waitForTimeout(500);
  expect(await p.locator('.tr-card').count() === 0, 'no card while Review comps covers Sort');
  await p.keyboard.press('Escape');
}
// Hubert still opens with the tour on.
await p.locator('.sh-pill', { hasText: 'Hubert' }).first().click();
await p.waitForSelector('.hubert-drawer');
await shot('07-sort-with-hubert');

for (const [id, step, want, name] of [
  [findingsId, 'gate', 'Your number first', '08-gate'],
  [findingsId, 'findings', 'What your comps say', '09-findings'],
  [sendId, 'send', 'Write it for the client', '10-send'],
  [sentId, 'done', 'That’s the whole flow', '11-done'],
]) {
  await p.goto(`${base}/tools/comp-report/?report=${id}&step=${step}`);
  await p.waitForTimeout(1200);
  const got = await title();
  if (got !== want) errors.push(`note: ${step} showed ${got ?? 'no card'} (wanted ${want})`);
  await shot(name);
}
if (await p.locator('.tr-card .btn.primary').count()) {
  await p.locator('.tr-card .btn.primary').click();
  await p.waitForTimeout(400);
  expect(await p.locator('.tr-card').count() === 0, 'Finish ends the tour');
}

await browser.close();
console.log(errors.length ? errors.join('\n') : 'walk-tour: all good');
process.exitCode = errors.some((e) => !e.startsWith('note:')) ? 1 : 0;
