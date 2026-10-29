// DEV ONLY — the walk for Your client (2026-10-29): a buyer's financing, pre-approval, pace and what's moving
// them, filled on Details and read back in Findings against the range and the ask; a seller's pace; a hard
// fair-housing term refused as it's typed; phone width. Against the local dev server and the fakes. Needs
// 'npm i --no-save playwright-core' (the preinstalled Chromium).
//   node tools-src/comp-report/dev/walk-your-client.mjs <base> <outDir> [condo|coop]
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
const seed = (stage, side) => execFileSync('node', [join(here, 'seed-report.mjs'), base, stage, side, type, OWNER], { encoding: 'utf8' }).trim().split('\n').at(-1);
const errors = [];
const check = (ok, what) => { if (!ok) errors.push(`expected: ${what}`); };

const browser = await chromium.launch({ executablePath: chromePath() });
async function page(width = 1440) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
  await ctx.addInitScript((e) => sessionStorage.setItem('cr-dev-session', e), OWNER);
  await ctx.addInitScript(() => { try { localStorage.removeItem('cr-build-notes'); localStorage.setItem('cr-view-as-new-agent', '0'); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`pageerror ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|status of 4/.test(m.text())) errors.push(`console ${m.text()}`); });
  return p;
}
const shot = async (p, name, opts = {}) => { await p.waitForTimeout(600); await (opts.el ?? p).screenshot({ path: join(out, `${name}-${type}.png`), ...(opts.el ? {} : { fullPage: Boolean(opts.full) }) }); };
const chip = (p, group, name) => p.getByRole('group', { name: group, exact: true }).getByRole('button', { name, exact: true });
const openFindings = async (p, id) => {
  await p.goto(`${base}/tools/comp-report/?report=${id}&step=findings`);
  await p.waitForSelector('.fi-acc');
  const head = p.locator('.fi-acc-head', { hasText: 'Your client' });
  await head.click();
  await p.waitForSelector('.cl-fields');
  return p.locator('.fi-acc-item', { has: head });
};

// ─── A buyer: filled on Details, read back in Findings ──────────────────────
{
  const id = seed('findings', 'buyer');
  const p = await page();
  await p.goto(`${base}/tools/comp-report/?report=${id}&step=findings`);
  await p.waitForSelector('.fi-acc');
  await p.getByRole('button', { name: 'Edit details' }).click();
  const more = p.locator('details.nr-client-more');
  await more.locator('summary').click();
  // The seeded buyer carries the buyer sample's terms (a mortgage, pre-approved for $4.3M): the agent changes the amount.
  await p.getByLabel('Pre-approved for', { exact: true }).fill('3,650,000');
  await chip(p, 'How soon', 'Can wait for the right one').click();
  await p.getByLabel('What’s moving them', { exact: true }).fill('Lease ends in March; wants a room to work from home');
  await more.scrollIntoViewIfNeeded();
  await shot(p, '01-details-your-client', { el: more });
  // A hard fair-housing term isn't saved, and says why.
  const moving = p.getByLabel('What’s moving them', { exact: true });
  await moving.fill('Wants a building with no children');
  check(await p.locator('.cl-warn').isVisible(), 'a hard fair-housing term is refused as it’s typed');
  await shot(p, '02-details-fair-housing', { el: more });
  await moving.fill('Lease ends in March; wants a room to work from home');
  await p.getByRole('button', { name: 'Save changes' }).click();
  await p.waitForTimeout(1200);
  const item = await openFindings(p, id);
  const text = await item.textContent();
  check(text.includes('Pre-approved $3.65M · Can wait'), 'the accordion’s sub-label');
  check(/Against the range/.test(text), 'the pre-approval against the range');
  check(text.includes('Can wait for the right one. Their lease ends in March') && text.includes('At that pace'), 'the pace, in their words, against how the comps sold');
  check(text.includes('Lease ends in March'), 'what’s moving them, as saved');
  await item.scrollIntoViewIfNeeded();
  await shot(p, '03-findings-your-client-buyer', { el: item });
  // Cash hides the pre-approval.
  await chip(p, 'Financing', 'All cash').click();
  check(!(await p.getByRole('group', { name: 'Pre-approved', exact: true }).count()), 'cash hides the pre-approval');
  await shot(p, '04-findings-cash-buyer', { el: item });
}

// ─── A seller: the pace against how long the sales took ─────────────────────
{
  const id = seed('findings', 'seller');
  const p = await page();
  const item = await openFindings(p, id);
  check(!(await p.getByRole('group', { name: 'Pre-approved', exact: true }).count()), 'a seller has no pre-approval');
  await chip(p, 'How soon', 'As soon as possible').click();
  await p.waitForTimeout(800);
  await shot(p, '05-findings-your-client-seller', { el: item });
}

// ─── Phone ──────────────────────────────────────────────────────────────────
{
  const id = seed('findings', 'buyer');
  const p = await page(390);
  const item = await openFindings(p, id);
  await p.waitForTimeout(800);
  await item.scrollIntoViewIfNeeded();
  await shot(p, '06-phone-findings', { el: item });
  check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll at 390px');
}

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`ok: screenshots in ${out}`);
