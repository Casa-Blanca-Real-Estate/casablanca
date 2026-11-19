// DEV ONLY — the walk for Settings and Duplicate report (Kimani, 2026-11-06): the name menu with its gear,
// Settings (you, and the team's dev switches), a report row's Duplicate, its dialog with "Carry over the
// chat" off, and the copy opened. Against the local dev server. Needs 'npm i --no-save playwright-core'.
//   node tools-src/comp-report/dev/walk-settings-duplicate.mjs <base> <outDir> [width] [before]
// With "before", it only shoots the menu and a hovered row (for a before/after against main).
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [base = 'http://localhost:5173', out = join(here, 'out'), width = '1440', mode = 'after'] = process.argv.slice(2);
const OWNER = 'kimani@casa-blanca.com';
mkdirSync(out, { recursive: true });
execFileSync('node', [join(here, 'seed-report.mjs'), base, 'sort', 'seller', 'condo', OWNER], { encoding: 'utf8' });
const errors = [];

const browser = await chromium.launch({ executablePath: chromePath() });
const ctx = await browser.newContext({ viewport: { width: Number(width), height: Number(width) > 2000 ? 1300 : 900 } });
await ctx.addInitScript((e) => sessionStorage.setItem('cr-dev-session', e), OWNER);
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(`pageerror ${e}`));
const shot = async (name) => { await p.waitForTimeout(400); await p.screenshot({ path: join(out, `${mode}-${name}.png`) }); };

await p.goto(`${base}/tools/comp-report/`);
await p.waitForSelector('.sh-row');
await p.locator('.sh-acct').click();
await shot('01-name-menu');
await p.keyboard.press('Escape');
await p.locator('.sh-li').first().hover();
await shot('02-row-hover');

if (mode !== 'before') {
  await p.locator('.sh-acct').click();
  await p.getByRole('button', { name: 'Settings' }).click();
  await p.waitForSelector('[data-testid=settings]');
  await shot('03-settings');
  // The notebook switch writes its off key.
  await p.getByRole('switch', { name: /Dev notebook/ }).click();
  if ((await p.evaluate(() => localStorage.getItem('cb.devNotebook.off'))) !== '1') errors.push('expected: the notebook off key set');
  await p.getByRole('switch', { name: /Dev notebook/ }).click();
  await p.getByRole('button', { name: 'Done' }).click();

  const title = await p.locator('.sh-li .sh-addr').first().innerText();
  await p.locator('.sh-li').first().hover();
  await p.getByRole('button', { name: /^Duplicate / }).first().click();
  await p.waitForSelector('[data-testid=duplicate-report]');
  if (await p.getByRole('switch', { name: /Carry over the chat/ }).isChecked()) errors.push('expected: carry over the chat off by default');
  await shot('04-duplicate-dialog');
  await p.locator('[data-testid=duplicate-report] .btn.primary').click();
  await p.waitForURL(/report=/, { timeout: 15_000 });
  await p.waitForTimeout(2500);
  await shot('05-the-copy');
  await p.goto(`${base}/tools/comp-report/`);
  await p.waitForSelector('.sh-row');
  if (!(await p.locator('.sh-addr', { hasText: `${title.split('\n')[0]} (copy)` }).count())) errors.push('expected: the copy in the list');
  await shot('06-list-with-copy');
}

console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
