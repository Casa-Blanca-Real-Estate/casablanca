// DEV ONLY — the walk for Hubert filling in the home and starring comps (2026-10-29): on Sort the agent
// tells him to star a comp, take one out and put it back (each on the trail with Undo); then, beside the
// New report window, dictates the home's details, sees them land, and undoes one. Laptop and tablet only
// (Kimani, 2026-10-29: no phone layouts). Against the local dev server and the fakes.
// Needs 'npm i --no-save playwright-core' (the preinstalled Chromium).
//   node tools-src/comp-report/dev/walk-home-facts.mjs <base> <outDir> [condo|coop]
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
const id = execFileSync('node', [join(here, 'seed-report.mjs'), base, 'sort', 'buyer', type, OWNER], { encoding: 'utf8' }).trim().split('\n').at(-1);
const errors = [];
const check = (ok, what) => { if (!ok) errors.push(`expected: ${what}`); };

const browser = await chromium.launch({ executablePath: chromePath() });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript((e) => sessionStorage.setItem('cr-dev-session', e), OWNER);
await ctx.addInitScript(() => { try { localStorage.removeItem('cr-build-notes'); localStorage.setItem('cr-view-as-new-agent', '0'); } catch {} });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(`pageerror ${e}`));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|status of 4/.test(m.text())) errors.push(`console ${m.text()}`); });
const shot = async (name) => { await p.waitForTimeout(500); await p.screenshot({ path: join(out, `${name}-${type}.png`) }); };
const ask = async (text) => {
  const replies = p.locator('.hb-msg.assistant', { hasText: 'fake Messages API' });
  const before = await replies.count();
  await p.getByLabel('Ask Hubert').fill(text);
  await p.locator('.hb .hb-send').click();
  await p.waitForFunction((n) => [...document.querySelectorAll('.hb-msg.assistant')].filter((m) => m.textContent.includes('fake Messages API')).length > n, before);
  await p.waitForTimeout(1200);
};
const lastReply = async () => (await p.locator('.hb-msg.assistant').last().textContent()) ?? '';

await p.goto(`${base}/tools/comp-report/?report=${id}&step=sort`);
await p.waitForSelector('.so-group');
await p.waitForTimeout(800);
if (!(await p.locator('.hb').count())) await p.locator('.sh-pill[aria-pressed]').first().click();
await p.waitForSelector('.hb .hb-input');

// The ★, on a comp the agent names.
const row = p.locator('.so-row-wrap').nth(2);
const address = (await row.locator('.so-addr').textContent()).trim();
await ask(`star ${address}`);
check(/Done: Star/.test(await lastReply()), `the star on ${address}: ${await lastReply()}`);
check(await p.locator('.hb-trail-item').last().getByRole('button', { name: 'Undo' }).isVisible(), 'Undo on the star');
await shot('01-star');

// Taken out, then put back: each its own entry, with Undo.
await ask(`take ${address} out`);
check(/Taken out/.test(await lastReply()), `taken out: ${await lastReply()}`);
await shot('02-taken-out');
await ask(`put ${address} back`);
check(/In the report/.test(await lastReply()), `put back: ${await lastReply()}`);
check(await p.locator('.hb-trail-item').last().getByRole('button', { name: 'Undo' }).isVisible(), 'Undo on putting it back');
await shot('03-put-back');

// Beside the New report window: the agent dictates the home's details, and they land in the fields.
await p.goto(`${base}/tools/comp-report/?report=${id}&start=details`);
await p.waitForSelector('.nr-modal');
if (!(await p.locator('.hb').count())) await p.locator('.sh-hubert-tab').click();
await p.waitForSelector('.hb .hb-input');
const size = p.getByLabel('Interior size in square feet');
const sizeWas = await size.inputValue();
await ask('the home: about 1,240 square feet, 3 beds, 2 baths, doorman and gym');
check(/Done: Interior size/.test(await lastReply()), `the details: ${await lastReply()}`);
check((await size.inputValue()).replace(/\D/g, '') === '1240', `the size field reads 1,240 (it reads ${await size.inputValue()})`);
check((await p.getByLabel('Beds').inputValue()) === '3', 'three beds');
await shot('04-home-dictated');

// Undo on the size puts back what was there.
await p.locator('.hb-trail-item', { hasText: 'Interior size' }).last().getByRole('button', { name: 'Undo' }).click();
await p.waitForTimeout(800);
check((await size.inputValue()) === sizeWas, `the size back to ${sizeWas} (it reads ${await size.inputValue()})`);
await shot('05-size-undone');

// Tablet: the same window, Hubert beside it.
await p.setViewportSize({ width: 1024, height: 768 });
await shot('06-tablet-new-report');

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`walk ok: ${out}`);
