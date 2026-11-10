// DEV ONLY — the walk for the guide (Kimani, 2026-11-10): an agent's first visit with its offer, the steps,
// the glossary and a search, presenter mode's badge and click ring on the list and on Sort, a ?guide= link,
// and Hubert's panel still opening beside it. Against the local dev server. Needs 'npm i --no-save playwright-core'.
//   node tools-src/comp-report/dev/walk-guide.mjs <base> <outDir> [width]
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [base = 'http://localhost:5173', out = join(here, 'out'), width = '1440'] = process.argv.slice(2);
// A new agent sees the first-visit offer; the rest walks as an admin, who can seed a sample report.
const AGENT = `guide-walk-${Date.now()}@casa-blanca.com`;
const OWNER = 'kimani@casa-blanca.com';
mkdirSync(out, { recursive: true });
const seeded = execFileSync('node', [join(here, 'seed-report.mjs'), base, 'sort', 'seller', 'condo', OWNER], { encoding: 'utf8' });
const reportId = seeded.trim().split('\n').pop();
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
const shot = async (name) => { await p.waitForTimeout(450); await p.screenshot({ path: join(out, `${name}.png`) }); };

await p.goto(`${base}/tools/comp-report/`);
await p.waitForSelector('.gd-offer');
await shot('01-reports-first-visit-offer');
await p.locator('.gd-offer .btn.primary').click();
await p.waitForSelector('[data-testid=guide]');
await p.keyboard.press('Escape');
expect(!(await p.locator('.gd-offer').count()), 'the offer is gone once taken');
await p.reload();
await p.waitForSelector('.gd-pill');
expect(!(await p.locator('.gd-offer').count()), 'the offer stays gone after a reload');

p = await as(OWNER);
await p.goto(`${base}/tools/comp-report/`);
await p.waitForSelector('.sh-row');
expect(!(await p.locator('.gd-offer').count()), 'no offer for an admin');
await p.locator('.gd-pill').click();
await p.waitForSelector('[data-testid=guide]');
expect(new URL(p.url()).searchParams.get('guide') === '1', '?guide=1 in the address');
await shot('02-guide-step-1');
await p.keyboard.press('ArrowRight');
await p.keyboard.press('ArrowRight');
await p.keyboard.press('ArrowRight');
await p.keyboard.press('ArrowRight');
expect((await p.locator('.gd-step-title').innerText()) === 'Sort the comps', 'step 5 after four → presses');
await shot('03-guide-step-5-sort');
await p.keyboard.press('7');
await shot('04-guide-step-7-findings');
await p.locator('.gd-word', { hasText: 'On the facts' }).click();
expect((await p.locator('.gd-search').inputValue()) === 'On the facts', 'a word on a step opens the glossary on it');
await p.locator('.gd-search').fill('');
await shot('05-glossary');
await p.locator('.gd-search').fill('co-op');
await shot('06-glossary-search-co-op');
await p.keyboard.press('Escape');
expect(!(await p.locator('[data-testid=guide]').count()), 'Esc closes the guide');
expect(!new URL(p.url()).searchParams.has('guide'), 'closing clears ?guide');

// Presenter mode, from the guide's switch.
await p.locator('.gd-pill').click();
await p.getByRole('switch', { name: 'Presenter mode' }).click();
await shot('07-guide-presenter-on');
await p.keyboard.press('Escape');
await p.mouse.move(w / 2, 300);
await shot('08-reports-presenter-badge');

// A report, on Sort: the badge follows, a click shows its ring, and Hubert still opens.
await p.goto(`${base}/tools/comp-report/?report=${reportId}`);
await p.waitForSelector('.gd-badge-t');
await p.waitForTimeout(1500);
expect((await p.locator('.gd-badge-t').innerText()) === 'Sort the comps', 'the badge on Sort says step 5');
const hub = p.locator('.sh-pill.sh-hub');
const box = await hub.boundingBox();
if (box) {
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.up();
  await p.waitForTimeout(120);
  await p.screenshot({ path: join(out, '09-sort-presenter-click-ring-hubert.png') });
}
await p.waitForTimeout(800);
expect(await p.locator('.sh-pill.sh-hub[aria-pressed=true]').count() > 0 || await p.locator('.sh-drawer, [data-testid=hubert]').count() > 0, 'Hubert opens with presenter mode on');
await shot('10-sort-presenter-hubert-open');

// A link straight to the glossary, with presenter mode off again.
await p.locator('.gd-badge-off').click();
expect(!(await p.locator('.gd-badge').count()), 'the badge’s ✕ turns presenter mode off');
await p.goto(`${base}/tools/comp-report/?report=${reportId}&guide=glossary`);
await p.waitForSelector('.gd-glossary');
await shot('11-link-to-glossary-over-sort');

console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
