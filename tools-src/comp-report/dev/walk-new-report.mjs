// DEV ONLY — the Dispatch 20 walk at 1440px: a new report from a StreetEasy link (condo) or a co-op's, the
// three modal steps, Escape over a half-typed comp, and an expanded Sort card with a photo, the tag groups and
// "from the data" chips — as a full agent and as a practice one. Against the local dev server and the fakes
// (fake-firecrawl serves the pages; StreetEasy's image host is answered here with a drawn photo, offline).
// playwright-core isn't a dependency: 'npm i --no-save playwright-core' first; it uses /opt/pw-browsers.
//   node tools-src/comp-report/dev/walk-new-report.mjs <base> <outDir> <condo|coop>
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [base = 'http://localhost:5173', out = 'out', type = 'condo'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const errors = [];
const log = [];
const HOME = type === 'condo'
  ? 'https://streeteasy.com/building/100-barclay-street-new_york/17l?utm_source=share&utm_medium=copy'
  : 'https://www.streeteasy.com/building/301-east-79-street-new_york/12c?featured=1';
const COMPS = [
  'https://streeteasy.com/building/200-chambers-street-new_york/10a',
  'https://streeteasy.com/building/5-franklin-place-new_york/14a',
  'https://streeteasy.com/building/301-east-79-street-new_york/12c',
];

// A drawn "photo", served for StreetEasy's image host so the walk needs no network.
const svg = (n) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9c3e6"/><stop offset="1" stop-color="#8f8a76"/></linearGradient></defs><rect width="800" height="400" fill="url(#g)"/><rect x="90" y="120" width="230" height="200" fill="#f4f3f0" opacity=".85"/><rect x="380" y="80" width="300" height="240" fill="#f4f3f0" opacity=".6"/><text x="40" y="370" font-family="sans-serif" font-size="28" fill="#0f0f0f">listing photo ${n}</text></svg>`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function context(asNewAgent) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => sessionStorage.setItem('cr-dev-session', 'kimani@casa-blanca.com'));
  await ctx.addInitScript((asNew) => { try { localStorage.removeItem('cr-build-notes'); localStorage.setItem('cr-view-as-new-agent', asNew ? '1' : '0'); } catch {} }, asNewAgent);
  let n = 0;
  await ctx.route('https://photos.zillowstatic.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg(++n) }));
  return ctx;
}
async function page(ctx, name) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: pageerror ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|status of 4/.test(m.text())) errors.push(`${name}: console ${m.text()}`); });
  return p;
}
async function shot(p, name, full = true) {
  await p.waitForTimeout(700);
  const file = join(out, `${name}-${type}.png`);
  await p.screenshot({ path: file, fullPage: full });
  log.push(file);
  await p.mouse.move(0, 0); // a hovered ⓘ's tip closes before the next click
}
const tall = async (p, h = 2000) => { await p.setViewportSize({ width: 1440, height: h }); await p.waitForTimeout(300); };
const settle = async (p) => { await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(500); };
const check = (ok, what) => { if (!ok) errors.push(what); };

async function newReport(ctx, shots) {
const p = await page(ctx, 'new');
await p.goto(`${base}/tools/comp-report/`);
await settle(p);
await p.getByRole('button', { name: /new (report|comp)/i }).first().click();
await settle(p);

// 1 of 3: paste the link (it shows as the clean link), the type, the client's target.
const line = p.getByLabel(/StreetEasy link, or its address/i);
await line.focus();
await p.evaluate((text) => {
  const el = document.activeElement;
  const dt = new DataTransfer();
  dt.setData('text', text);
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, HOME);
await p.waitForTimeout(300);
const shown = await line.inputValue();
check(!shown.includes('?') && !shown.includes('www.'), `1: the pasted link wasn't cleaned: ${shown}`);
if (type === 'condo') await p.getByRole('button', { name: /^condo$/i }).first().click();
await p.getByLabel(/client’s budget/i).fill('3.9M');
await p.getByLabel(/^client$/i).or(p.locator('.nr-client')).first().fill('Jordan and Sam');
await tall(p, 1100);
await p.getByRole('button', { name: /about the budget/i }).hover();
if (shots) await shot(p, '01-step1-link-cleaned-and-target', false);
await p.mouse.move(0, 0);

// 2 of 3: the details fill from the read.
await p.getByRole('button', { name: /^next/i }).click();
await p.waitForSelector('[data-testid="new-report-2"]');
await p.waitForFunction(() => !/Reading the home’s StreetEasy page/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => errors.push('2: the read never landed'));
await settle(p);
await tall(p, 2200);
const cond = p.getByRole('button', { name: /about unit condition/i });
if (await cond.count()) await cond.hover(); else errors.push('2: no condition ⓘ');
if (shots) await shot(p, '02-step2-details-from-the-read');
await p.mouse.move(0, 0);
check((await p.getByLabel('Neighborhood').inputValue()) !== '', '2: the neighborhood didn’t fill');

// 3 of 3: paste the comps; type one in and press Escape.
await p.getByRole('button', { name: /^next/i }).click();
await p.waitForSelector('[data-testid="new-report-3"]');
const bar = p.getByLabel(/Paste StreetEasy links, or type an address/i);
await bar.fill(COMPS.join(' '));
await p.getByRole('button', { name: /^add$/i }).click();
await p.waitForFunction(() => !/reading/i.test(document.querySelector('.nr-confirm-count')?.textContent ?? 'x'), null, { timeout: 40000 }).catch(() => errors.push('3: reads never finished'));
await settle(p);
// Confirm every comp read from its page.
for (let i = 0; i < 6; i++) {
  const b = p.getByRole('button', { name: /^confirm/i }).first();
  if (!(await b.count())) break;
  await b.click().catch(() => {});
  await settle(p);
}
await p.getByRole('button', { name: /^type one in$/i }).first().click();
await p.getByPlaceholder(/66 Leonard/).fill('66 Leonard Street #12A');
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
check(await p.getByText(/partway through a comp/i).count() > 0, '3: Escape didn’t ask before dropping the comp');
check(await p.locator('[data-testid="new-report-3"]').count() > 0, '3: Escape closed the modal over a half-typed comp');
await tall(p, 2000);
if (shots) await shot(p, '03-step3-escape-asks');
await p.mouse.move(0, 0);
await p.getByRole('button', { name: /keep editing/i }).click();
await p.getByRole('button', { name: /^cancel$/i }).first().click().catch(() => {});
await p.getByRole('button', { name: /open workspace/i }).click();
await settle(p);
const reportUrl = p.url();
await p.close();
return reportUrl;
}
const ctx = await context(false);

// Sort: the card with a photo, the tag groups and the chips — full agent (pre-filled), then practice (chips).
async function card(asNew, suffix) {
  const c = asNew ? await context(true) : ctx;
  // Each level starts its own report from the link, so the data settles the tags its way.
  const reportUrl = await newReport(c, !asNew);
  const q = await page(c, `sort-${suffix}`);
  await q.goto(reportUrl.replace(/([?&])start=[^&]*/, '$1').replace(/step=[^&]*/, 'step=sort'));
  await settle(q);
  // Confirm what each page gave: the data settles a comp's tags once it's confirmed.
  for (let i = 0; i < 6; i++) {
    const b = q.getByRole('button', { name: /^confirm$/i }).first();
    if (!(await b.count())) break;
    await b.click().catch(() => {});
    await settle(q);
  }
  await q.waitForTimeout(2500); // the tags the data settles, and the geocodes
  const row = q.locator('button.so-addr', { hasText: /200 Chambers/i }).first();
  if (await row.count()) await row.click(); else errors.push(`${suffix}: no 200 Chambers row`);
  await settle(q);
  const img = q.locator('.so-photo img').first();
  if (await img.count()) check((await img.getAttribute('referrerpolicy')) === 'no-referrer', `${suffix}: the photo has no referrerpolicy`);
  else errors.push(`${suffix}: no photo on the card`);
  const more = q.locator('.so-more summary').first();
  if (await more.count()) await more.click();
  await q.waitForTimeout(1200);
  await tall(q, 2600);
  await shot(q, `04-sort-card-${suffix}`, false);
  if (asNew) check(await q.locator('.chip.data').count() > 0, `${suffix}: no "from the data" chip`);
  // Edit: the tag groups, and a tag of one's own.
  const edit = q.getByRole('button', { name: /^✎ edit$|edit$/i }).first();
  if (await edit.count()) {
    await edit.click();
    await q.getByLabel('A tag of your own').fill('Park-facing, quiet (rear)');
    await q.keyboard.press('Enter');
    await q.getByLabel('A tag of your own').fill('Perfect for couples');
    await q.keyboard.press('Enter');
    await q.waitForTimeout(300);
    check(await q.getByText(/reads as a preference/).count() > 0, `${suffix}: a fair-housing term wasn’t refused`);
    await shot(q, `05-sort-card-edit-${suffix}`, false);
    await q.getByRole('button', { name: /^cancel$/i }).last().click().catch(() => {});
  } else errors.push(`${suffix}: no Edit`);
  await q.close();
  if (asNew) await c.close();
}
await card(false, 'full-agent');
await card(true, 'practice-agent');

// A typed-in home: the size is a plain field.
{
  const q = await page(ctx, 'typed');
  await q.goto(`${base}/tools/comp-report/`);
  await settle(q);
  await q.getByRole('button', { name: /new (report|comp)/i }).first().click();
  await q.getByLabel(/StreetEasy link, or its address/i).fill('25 North Moore Street #9C');
  if (type === 'condo') await q.getByRole('button', { name: /^condo$/i }).first().click();
  await q.getByRole('button', { name: /^next/i }).click();
  await q.waitForSelector('[data-testid="new-report-2"]');
  await settle(q);
  check(await q.getByLabel('Interior size in square feet').count() > 0, 'typed: the size isn’t a plain field');
  check(await q.getByText('Not listed').count() === 0, 'typed: "Not listed" with no read');
  await tall(q, 2000);
  await shot(q, '06-typed-home-size-field');
  await q.close();
}

await browser.close();
writeFileSync(join(out, `walk-${type}.json`), JSON.stringify({ shots: log, errors }, null, 2));
console.log(JSON.stringify({ shots: log.length, errors }, null, 2));
