// DEV ONLY — the wiring pass's walk (2026-11-06): Start with Hubert from Reports' hero, with the words read
// first ("buyer, Jordan and Sam, condo, budget $4.5M"), landing on step 2 with Hubert beside it; then the
// list with its photos, ranges and the follow-up reminder. Against the local dev server and the fakes
// (fake-firecrawl serves the pages; StreetEasy's image host is answered here with a drawn photo, offline).
// playwright-core isn't a dependency: 'npm i --no-save playwright-core' first; it uses /opt/pw-browsers.
//   WALK_WIDTH=1440 node tools-src/comp-report/dev/walk-start-with-hubert.mjs <base> <outDir>
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = Number(process.env.WALK_WIDTH) || 1440;
const [base = 'http://localhost:5173', out = 'out'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const errors = [];
const log = [];
const WORDS = 'https://streeteasy.com/building/100-barclay-street-new_york/17l buyer, Jordan and Sam, condo, budget $4.5M';
const svg = (n) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9c3e6"/><stop offset="1" stop-color="#8f8a76"/></linearGradient></defs><rect width="800" height="400" fill="url(#g)"/><text x="40" y="370" font-family="sans-serif" font-size="28" fill="#0f0f0f">listing photo ${n}</text></svg>`;

const browser = await chromium.launch({ executablePath: chromePath() });
const ctx = await browser.newContext({ viewport: { width: W, height: W > 2000 ? 1300 : 900 } });
await ctx.addInitScript(() => sessionStorage.setItem('cr-dev-session', 'kimani@casa-blanca.com'));
await ctx.addInitScript(() => { try { localStorage.removeItem('cr-build-notes'); } catch {} });
let n = 0;
await ctx.route('https://photos.zillowstatic.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg(++n) }));
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(`pageerror ${e}`));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|status of 4/.test(m.text())) errors.push(`console ${m.text()}`); });
const settle = async () => { await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(700); };
const shot = async (name) => { const file = join(out, `${name}.png`); await p.screenshot({ path: file }); log.push(file); };

await p.goto(`${base}/tools/comp-report/`);
await settle();
await p.locator('#sh-start-text').fill(WORDS);
await shot('01-reports-start-typed');
await p.getByRole('button', { name: 'Start →' }).click();
await p.waitForURL(/start=details/, { timeout: 20000 });
await settle();
await shot('02-step-2-reading');
// The fake reads the page in a moment; the details and Hubert's second note follow it.
await p.waitForTimeout(6000);
await settle();
await shot('03-step-2-read');
const drawer = await p.locator('aside.hb').innerText().catch(() => '');
if (!/buyer report, for Jordan and Sam, a condo/.test(drawer)) errors.push(`Hubert's note: ${drawer.slice(0, 300)}`);
const client = await p.getByRole('dialog').innerText().catch(() => '');
writeFileSync(join(out, 'drawer.txt'), drawer);
writeFileSync(join(out, 'dialog.txt'), client);

// Back to Reports: the new row, with its photo from the read.
await p.goto(`${base}/tools/comp-report/`);
await settle();
await p.setViewportSize({ width: W, height: 1600 });
await p.waitForTimeout(400);
await shot('04-reports-list');

writeFileSync(join(out, 'walk.json'), JSON.stringify({ errors, log }, null, 2));
console.log(JSON.stringify({ errors, log }, null, 2));
await browser.close();
