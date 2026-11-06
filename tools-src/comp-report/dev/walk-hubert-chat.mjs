// DEV ONLY — the walk for Hubert's chat (Kimani's 2026-11-06 walkthrough): his greeting back, the step
// he calls out, a search with listing cards, the thinking state, and Stop taking a message back. Against
// the local dev server and the fakes (fake-anthropic, fake-firecrawl). Needs 'npm i --no-save playwright-core'.
//   node tools-src/comp-report/dev/walk-hubert-chat.mjs <base> <outDir> [width]
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [base = 'http://localhost:5173', out = join(here, 'out'), width = '1440'] = process.argv.slice(2);
const OWNER = 'kimani@casa-blanca.com';
mkdirSync(out, { recursive: true });
const id = execFileSync('node', [join(here, 'seed-report.mjs'), base, 'sort', 'seller', 'condo', OWNER], { encoding: 'utf8' }).trim().split('\n').at(-1);
const errors = [];

const browser = await chromium.launch({ executablePath: chromePath() });
const ctx = await browser.newContext({ viewport: { width: Number(width), height: Number(width) > 2000 ? 1300 : 900 } });
await ctx.addInitScript((e) => sessionStorage.setItem('cr-dev-session', e), OWNER);
await ctx.addInitScript(() => { try { localStorage.removeItem('cr-build-notes'); localStorage.setItem('cr-view-as-new-agent', '0'); } catch {} });
// StreetEasy's photo host isn't reachable here: any photo it asks for is a local one.
const photo = process.env.CR_DEV_PHOTO_FILE;
if (photo && existsSync(photo)) await ctx.route(/photos\.zillowstatic\.com/, (r) => r.fulfill({ body: readFileSync(photo), contentType: 'image/jpeg' }));
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(`pageerror ${e}`));
const shot = async (name) => { await p.waitForTimeout(400); await p.screenshot({ path: join(out, `${name}.png`) }); };
const replies = () => p.locator('.hb-msg.assistant', { hasText: 'fake Messages API' }).count();
const ask = async (text, { wait = true } = {}) => {
  const before = await replies();
  await p.getByLabel('Ask Hubert').fill(text);
  await p.locator('.hb .hb-send').click();
  if (!wait) return;
  await p.waitForFunction((n) => [...document.querySelectorAll('.hb-msg.assistant')].filter((m) => m.textContent.includes('fake Messages API')).length > n, before, { timeout: 30_000 });
  await p.waitForTimeout(1500);
};

await p.goto(`${base}/tools/comp-report/?report=${id}&step=sort`);
await p.waitForSelector('.so-group');
await p.waitForTimeout(800);
if (!(await p.locator('.hb').count())) await p.locator('.sh-pill[aria-pressed]').first().click();
await p.waitForSelector('.hb .hb-input');
await shot('01-sort-step');

await ask('sup!');
await shot('02-greeting');

// Thinking: caught while the reply is on its way.
await ask('search 60 Collister Street sales', { wait: false });
await p.waitForSelector('.hb-thinking, .hb-progress', { timeout: 10_000 }).catch(() => undefined);
await shot('03-thinking');
await p.waitForFunction(() => [...document.querySelectorAll('.hb-msg.assistant')].some((m) => m.textContent.includes('From the web')), null, { timeout: 30_000 });
await p.waitForTimeout(4000);
await shot('04-search-cards');

// Stop: a message sent by mistake comes back to the box.
const stop = p.locator('.hb .hb-stop');
await p.getByLabel('Ask Hubert').fill('slow what is the engine and how does');
await p.locator('.hb .hb-send').click();
if (await stop.count()) {
  await stop.waitFor({ timeout: 10_000 });
  await shot('05-stop-offered');
  await stop.click();
  await p.waitForTimeout(1500);
  await shot('06-stopped');
  if ((await p.getByLabel('Ask Hubert').inputValue()) !== 'slow what is the engine and how does') errors.push('expected: the stopped message back in the box');
  // Fixed and sent again: it goes through (no "already answering"), and the stopped one is gone from the chat.
  await ask('what is the engine?');
  if (await p.locator('.hb-msg.user', { hasText: 'slow what is the engine' }).count()) errors.push('expected: the stopped message gone from the chat');
  await shot('07-sent-again');
}

console.log(JSON.stringify({ report: id, errors }, null, 2));
await browser.close();
