// DEV ONLY — the walk for the per-comp review on Sort (Dispatch 25): a full agent sees Hubert's take first,
// copies it, tiers and asks again; a practice agent (an admin viewing as a new agent) writes first, gets
// feedback, then shows his take; the sample's stored reviews and the weak flag on Sort; phone width. Against
// the local dev server and the fakes. Needs 'npm i --no-save playwright-core' (the preinstalled Chromium).
//   node tools-src/comp-report/dev/walk-review.mjs <base> <outDir> [condo|coop]
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [base = 'http://localhost:5173', out = join(here, 'out'), type = 'condo'] = process.argv.slice(2);
const OWNER = 'kimani@casa-blanca.com';
mkdirSync(out, { recursive: true });
const seed = (stage) => execFileSync('node', [join(here, 'seed-report.mjs'), base, stage, 'buyer', type, OWNER], { encoding: 'utf8' }).trim().split('\n').at(-1);
const errors = [];
const check = (ok, what) => { if (!ok) errors.push(`expected: ${what}`); };

const browser = await chromium.launch({ executablePath: chromePath() });

async function page(practice, width = 1440) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
  await ctx.addInitScript((e) => sessionStorage.setItem('cr-dev-session', e), OWNER);
  await ctx.addInitScript((p) => { try { localStorage.removeItem('cr-build-notes'); localStorage.setItem('cr-view-as-new-agent', p ? '1' : '0'); } catch {} }, practice);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`pageerror ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|status of 4/.test(m.text())) errors.push(`console ${m.text()}`); });
  return p;
}
const shot = async (p, name, full = false) => { await p.waitForTimeout(500); await p.screenshot({ path: join(out, `${name}-${type}.png`), fullPage: full }); };
const open = async (p, id) => {
  await p.goto(`${base}/tools/comp-report/?report=${id}&step=sort`);
  await p.waitForSelector('.so-group');
  await p.waitForTimeout(800);
};
const seg = (p, name) => p.locator('.rv-seg').getByRole('button', { name, exact: true });
const tierOnSort = (p, address) => p.locator('.so-row-wrap', { hasText: address }).locator('.so-seg button[aria-pressed="true"]').first().getAttribute('aria-label');

// ─── A full agent: Hubert's take first ──────────────────────────────────────
{
  const id = seed('sort');
  const p = await page(false);
  await open(p, id);
  const cta = p.locator('.sh-review').first();
  check(await cta.isVisible(), 'Review comps leads Sort');
  await shot(p, '01-sort-review-comps-cta');
  await cta.click();
  await p.waitForSelector('.rv-round.take');
  check(/1 \/ \d+/.test(await p.locator('.rv-count').textContent()), 'the count: 1 / N');
  check(!(await p.locator('.rv-round.take').textContent()).includes('9,876,543'), 'an invented figure never shows');
  const address = await p.locator('.rv-addr').textContent();
  await shot(p, '02-full-take-first');
  await p.getByRole('button', { name: 'Copy to note' }).click();
  check((await p.getByLabel('Why it’s a comp', { exact: true }).inputValue()).length > 0, 'his take copied into the note');
  if (!(await p.locator('.rv-tags').count())) await p.locator('.rv-tagtoggle').click();
  await p.locator('.rv-tags .chip', { hasText: 'Similar size' }).first().click();
  await p.getByLabel('Tell Hubert what he’s missing').fill('It was gut renovated last year; the building has a gym.');
  await p.getByRole('button', { name: 'Ask again' }).click();
  await p.waitForFunction(() => document.querySelector('.rv-earlier summary')?.textContent?.includes('1'));
  await p.locator('.rv-hubert').scrollIntoViewIfNeeded();
  await shot(p, '03-full-asked-again');
  await seg(p, '1st tier').click();
  await p.waitForFunction(() => document.querySelector('.rv-seg button.primary')?.getAttribute('aria-pressed') === 'true');
  await shot(p, '04-full-tiered');
  await p.getByRole('button', { name: /^Next →$/ }).click();
  await p.waitForSelector('.rv-round.take');
  check(/2 \/ \d+/.test(await p.locator('.rv-count').textContent()), 'Next goes to 2 / N');
  await p.keyboard.press('Escape');
  await p.waitForSelector('.rv-scrim', { state: 'detached' });
  check(await tierOnSort(p, address.trim()) === '1st tier', 'the tier set in the step is the comp’s tier on Sort');
  await shot(p, '05-full-back-on-sort');
}

// ─── A practice agent: write, feedback, then his take ───────────────────────
{
  const id = seed('sort');
  const p = await page(true);
  await open(p, id);
  await p.locator('.sh-review').first().click();
  await p.waitForSelector('.rv-step, .rv-work');
  check(await p.locator('.rv-round.take').count() === 0, 'no take before the agent writes');
  check(await p.getByRole('button', { name: 'Hubert’s take' }).isDisabled(), 'his take locked before feedback');
  check(await seg(p, '1st tier').isDisabled(), 'the tier waits for the note and tags');
  await shot(p, '06-practice-write-first');
  await p.getByLabel('Why it’s a comp', { exact: true }).fill('Same area and close in size; full-service building like the home.');
  if (!(await p.locator('.rv-tags').count())) await p.locator('.rv-tagtoggle').click();
  await p.locator('.rv-tags .chip', { hasText: 'Similar size' }).first().click();
  await p.getByRole('button', { name: 'Get feedback' }).click();
  await p.waitForSelector('.rv-round.feedback');
  await shot(p, '07-practice-feedback');
  await p.getByRole('button', { name: 'Hubert’s take' }).click();
  await p.waitForSelector('.rv-round.take');
  await p.locator('.rv-round.take').scrollIntoViewIfNeeded();
  await shot(p, '08-practice-take-beside');
  await seg(p, '2nd tier').click();
  await p.waitForFunction(() => document.querySelector('.rv-seg button.secondary')?.getAttribute('aria-pressed') === 'true');
  await shot(p, '09-practice-tiered');
}

// ─── The sample: Hubert's view already there, and the weak flag ─────────────
{
  const id = seed('sorted');
  const p = await page(false);
  await open(p, id);
  check(await p.locator('.so-weak').count() > 0, 'a weak flag on Sort');
  await shot(p, '10-sample-sort-weak-flags');
  const laight = p.locator('.so-row-wrap', { hasText: '79 Laight' });
  await laight.locator('.so-addr').click();
  await laight.getByRole('button', { name: 'Review with Hubert' }).click();
  await p.waitForSelector('.rv-weak');
  check((await p.locator('.rv-addr').textContent()).includes('79 Laight'), 'Review opens the flow at that comp');
  check(await p.locator('.rv-sample').count() > 0, 'the sample’s rounds are labelled');
  await shot(p, '11-sample-weak-comp');
}

// ─── Phone width ────────────────────────────────────────────────────────────
{
  const id = seed('sorted');
  const p = await page(true, 390);
  await open(p, id);
  // The ★ comp's card starts open.
  await p.getByRole('button', { name: 'Review with Hubert' }).first().dispatchEvent('click');
  await p.waitForSelector('.rv-work');
  await shot(p, '12-phone');
  await p.locator('.rv-hubert').scrollIntoViewIfNeeded();
  await shot(p, '13-phone-hubert');
}

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`walked: ${out}`);
