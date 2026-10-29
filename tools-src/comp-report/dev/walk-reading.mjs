// DEV ONLY — the reading notice (2026-10-22 demo): step 2 while the home's page is read, the toast on
// leaving it, step 3 and Sort while comps are read. Run the fake Firecrawl slow (delayMs ~70 s) so the
// reads are still going. 'npm i --no-save playwright-core' first.
//   node tools-src/comp-report/dev/walk-reading.mjs <base> <outDir>
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [base = 'http://localhost:5173', out = 'out'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const errors = [];
const browser = await chromium.launch({ executablePath: chromePath() });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => sessionStorage.setItem('cr-dev-session', 'kimani@casa-blanca.com'));
// A drawn "photo", served for StreetEasy's image host so the walk needs no network.
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9c3e6"/><stop offset="1" stop-color="#8f8a76"/></linearGradient></defs><rect width="1200" height="500" fill="url(#g)"/><rect x="140" y="160" width="330" height="260" fill="#f4f3f0" opacity=".85"/><rect x="560" y="110" width="460" height="310" fill="#f4f3f0" opacity=".6"/></svg>';
await ctx.route('https://photos.zillowstatic.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }));
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
await p.getByRole('button', { name: /about reading the home/i }).hover();
await shot('01b-step2-reading-hint');
await p.mouse.move(0, 0);
await p.waitForFunction(() => !document.querySelector('.hh-mid'), null, { timeout: 150000 }).catch(() => errors.push('2: the read never landed'));
await p.waitForTimeout(1500);
for (const s of await p.locator('details.nr-more').all()) await s.evaluate((d) => { d.open = true; });
await shot('01c-step2-after-the-read');
await p.locator('details.nr-more').first().scrollIntoViewIfNeeded();
await shot('01d-step2-home-and-building');
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
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
