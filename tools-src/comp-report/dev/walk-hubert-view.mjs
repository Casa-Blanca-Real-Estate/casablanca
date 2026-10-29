// DEV ONLY — the walk for what Hubert sees (2026-10-29): the agent opens a comp on Sort and asks about
// "this one" (get_view names it), dictates a note (the trail shows it with Undo), and undoes it; then Hubert
// beside the New report window. Against the
// local dev server and the fakes. Needs 'npm i --no-save playwright-core' (the preinstalled Chromium).
//   node tools-src/comp-report/dev/walk-hubert-view.mjs <base> <outDir> [condo|coop]
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

await p.goto(`${base}/tools/comp-report/?report=${id}&step=sort`);
await p.waitForSelector('.so-group');
await p.waitForTimeout(800);
if (!(await p.locator('.hb').count())) await p.locator('.sh-pill[aria-pressed]').first().click();
await p.waitForSelector('.hb .hb-input');

// A comp that isn't the ★ one, opened: that's "this one".
const row = p.locator('.so-row-wrap').filter({ has: p.locator('.so-addr[aria-expanded="false"]') }).nth(1);
const address = (await row.locator('.so-addr').textContent()).trim();
await row.locator('.so-addr').click();
await ask('What about this one?');
check((await p.locator('.hb-msg.assistant').last().textContent()).includes(address), `Hubert names ${address}`);
await shot('01-this-one');

await ask(`note on ${address}: Same line, two floors down. Dictated.`);
const undo = p.locator('.hb-trail-item').last().getByRole('button', { name: 'Undo' });
check(await undo.isVisible(), 'Undo on the note change');
await shot('02-trail-undo');

await undo.click();
await p.waitForSelector('.hb-trail-undone');
await p.waitForTimeout(800);
check(!(await row.textContent()).includes('Dictated'), 'the note is back as it was');
await shot('03-undone');

// Beside the New report window (rough until the design pass): Hubert above its backdrop, the window moved left.
await p.goto(`${base}/tools/comp-report/?report=${id}&start=details`);
await p.waitForSelector('.nr-modal');
if (!(await p.locator('.hb').count())) await p.locator('.sh-hubert-tab').click();
await p.waitForSelector('.hb .hb-input');
check(await p.locator('.hb-chip', { hasText: 'StreetEasy export' }).isVisible(), 'his New report questions');
await ask('What makes a good comp?');
await shot('04-new-report');

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`walk ok: ${out}`);
