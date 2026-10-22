// DEV ONLY — the reading notice (2026-10-22 demo): step 2 while the home's page is read, the toast on
// leaving it, step 3 and Sort while comps are read. Run the fake Firecrawl slow (delayMs ~70 s) so the
// reads are still going. 'npm i --no-save playwright-core' first.
//   node tools-src/comp-report/dev/walk-reading.mjs <base> <outDir>
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [base = 'http://localhost:5173', out = 'out'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => sessionStorage.setItem('cr-dev-session', 'kimani@casa-blanca.com'));
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(`pageerror ${e}`));
const shot = async (name, full = false) => { await p.waitForTimeout(500); await p.screenshot({ path: join(out, `${name}.png`), fullPage: full }); };

await p.goto(`${base}/tools/comp-report/`);
await p.waitForLoadState('networkidle');
await p.getByRole('button', { name: /new (report|comp)/i }).first().click();
await p.getByLabel(/StreetEasy link, or its address/i).fill('https://streeteasy.com/building/301-east-79-street-new_york/12c');
await p.getByRole('button', { name: /^next/i }).click();
await p.waitForSelector('[data-testid="new-report-2"]');
await p.waitForTimeout(12000);
await shot('01-step2-reading-the-home');
await p.getByRole('button', { name: /^next/i }).click();
await p.waitForSelector('[data-testid="new-report-3"]');
await p.waitForTimeout(300);
await shot('02-left-step2-toast');
await p.getByLabel(/Paste StreetEasy links, or type an address/i).fill('https://streeteasy.com/building/200-chambers-street-new_york/10a https://streeteasy.com/building/5-franklin-place-new_york/14a');
await p.getByRole('button', { name: /^add$/i }).click();
await p.waitForTimeout(8000);
await shot('03-step3-reading-comps');
await p.getByRole('button', { name: /open workspace/i }).click();
await p.waitForTimeout(400);
await shot('04-left-step3-toast-and-sort');
await p.setViewportSize({ width: 390, height: 844 });
await shot('05-sort-phone');
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
