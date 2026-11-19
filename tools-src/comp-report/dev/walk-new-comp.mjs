// DEV ONLY — the New comp window's walk (design pass, new-comp.md, 2026-11-11): + NEW COMP morphs into the
// field and START, a StreetEasy link read into the window on its own page with Hubert on the left, the seven
// steps (Basics → General → Own or shared → Home amenities → Building amenities → Client info → Add comps),
// then a typed address, and Edit details from the workspace's ✎. Against the local dev server and the fakes
// (fake-firecrawl serves the pages; StreetEasy's image host is answered here with a drawn photo, offline).
// playwright-core isn't a dependency: 'npm i --no-save playwright-core' first; it uses /opt/pw-browsers.
//   WALK_WIDTH=1440 node tools-src/comp-report/dev/walk-new-comp.mjs <base> <outDir>
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = Number(process.env.WALK_WIDTH) || 1440;
const H = W > 2000 ? 1300 : 900;
const [base = 'http://localhost:5173', out = 'out'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const errors = [];
const log = [];
const LINK = 'https://streeteasy.com/building/100-barclay-street-new_york/17l';
const svg = (n) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9c3e6"/><stop offset="1" stop-color="#8f8a76"/></linearGradient></defs><rect width="800" height="400" fill="url(#g)"/><text x="40" y="370" font-family="sans-serif" font-size="28" fill="#0f0f0f">listing photo ${n}</text></svg>`;

const browser = await chromium.launch({ executablePath: chromePath() });
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
await ctx.addInitScript(() => sessionStorage.setItem('cr-dev-session', 'kimani@casa-blanca.com'));
await ctx.addInitScript(() => { try { localStorage.removeItem('cr-build-notes'); localStorage.removeItem('cr-nc-hubert-w'); } catch {} });
let n = 0;
await ctx.route('https://photos.zillowstatic.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg(++n) }));
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(`pageerror ${e}`));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|status of 4/.test(m.text())) errors.push(`console ${m.text()}`); });
const settle = async (ms = 700) => { await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(ms); };
const shot = async (name) => { const file = join(out, `${name}.png`); await p.screenshot({ path: file }); log.push(file); };
const check = (ok, what) => { if (!ok) errors.push(what); };
const next = () => p.locator('.nc-foot .nc-bp').click();

// Reports: + NEW COMP, then the field and START.
await p.goto(`${base}/tools/comp-report/`);
await settle();
check(!(await p.locator('.sh-start').count()), 'the hero’s Start with Hubert field is gone');
await shot('01-reports');
await p.getByRole('button', { name: '+ New comp' }).first().click();
await p.waitForTimeout(600);
await p.locator('#sh-nc-line').fill(LINK);
await shot('02-new-comp-field');
await p.locator('#sh-nc-line').press('Enter');
await p.waitForURL(/start=basics/, { timeout: 20000 });
await p.waitForTimeout(900);
await shot('03-basics-reading');
check(await p.locator('.nc-hub').count() === 1, 'Hubert’s panel is open on the left');
check(!(await p.locator('.sh-page').count()), 'no workspace behind the window');
// CR-17: while the page is read, Next waits but the rail opens every step; the listing's fields stay locked, notes open.
if (await p.locator('.nc-pct').count()) {
  await p.locator('.nc-rail button', { hasText: 'General' }).click();
  await p.waitForTimeout(400);
  await shot('03b-general-while-reading');
  check(await p.locator('.nc-notes textarea').isEnabled(), 'the notes are open while the page is read');
  await p.locator('.nc-rail button', { hasText: 'Basics' }).click();
  await p.waitForTimeout(300);
}
await p.waitForFunction(() => !document.querySelector('.nc-pct'), null, { timeout: 30000 }).catch(() => errors.push('the read never landed'));
await settle();
await p.getByRole('button', { name: 'Jordan', exact: false }).count();
await p.locator('.nc-basics input').first().fill('Jordan and Sam');
await p.locator('.nc-basics input').nth(1).fill('4M');
await shot('04-basics-read');
// The ⓘ's tip draws above everything, never cut off by the window (Kimani 2026-11-11).
await p.getByRole('button', { name: 'About the budget' }).hover();
await p.waitForTimeout(200);
const tipBox = await p.locator('.nr-tip.floating:not([hidden])').boundingBox();
const winBox = await p.locator('.nc-window').boundingBox();
check(Boolean(tipBox && winBox && tipBox.y + tipBox.height <= (p.viewportSize()?.height ?? 0)), 'the budget’s tip is on screen whole');
await shot('04b-budget-tip');
await p.mouse.move(5, 5);
await next(); await settle(500);
await shot('05-general');
const color = await p.locator('.nc-general .nr-num input').nth(1).evaluate((el) => getComputedStyle(el).color);
check(color === 'rgb(15, 15, 15)', `typed numbers are ink (${color})`);
const hood = p.getByRole('combobox', { name: 'Neighborhood' });
await hood.fill('');
await hood.pressSequentially('park', { delay: 30 });
await p.waitForTimeout(200);
await shot('05b-neighborhood-search');
check((await p.getByRole('option').count()) > 0, 'the neighborhood shows StreetEasy’s names to pick from');
await hood.press('ArrowDown');
await hood.press('Enter');
check(/park/i.test(await hood.inputValue()), `a picked neighborhood fills the field (${await hood.inputValue()})`);
await next(); await settle(500);
await p.getByRole('group', { name: 'The building’s' }).first().getByRole('button', { name: 'On the floor' }).click();
await p.locator('.nc-notes textarea').fill('Laundry room is down the hall from 17L.');
await shot('06-own-or-shared');
await next(); await settle(500);
await p.getByRole('group', { name: 'Condition' }).getByRole('button', { name: 'Renovated' }).click();
await shot('07-home-amenities');
await next(); await settle(500);
const services = await p.getByRole('group', { name: 'Services and facilities' }).innerText();
check(!/Laundry in building/.test(services), 'the building’s laundry isn’t repeated under services');
await shot('08-building-amenities');
await next(); await settle(500);
await p.getByRole('group', { name: 'Pre-approved' }).getByRole('button', { name: 'Yes' }).click();
await p.waitForTimeout(300);
await shot('09-client-info');
await next(); await settle(500);
await shot('10-add-comps');
// Hubert closed: the tab on the left edge, the window centred again.
await p.locator('.nc-hub .hb-close').click();
await p.waitForTimeout(500);
await shot('11-add-comps-hubert-closed');
await p.locator('.nc-htab').click();
await p.waitForTimeout(400);
await p.getByRole('button', { name: 'OPEN WORKSPACE →' }).click();
await p.waitForURL(/step=sort/, { timeout: 20000 });
await settle();
await shot('12-workspace-sort');

// Edit details from the ✎: the window, headed EDIT TARGET PROPERTY, with every step of the home.
await p.getByRole('button', { name: 'Edit details' }).click();
await settle();
check(/EDIT TARGET PROPERTY/.test(await p.locator('.nc-label').innerText()), 'Edit details heads EDIT TARGET PROPERTY');
await p.locator('.nc-rail button').nth(2).click();
await settle(500);
const bl = await p.getByRole('group', { name: 'The building’s' }).first().locator('.nc-chip.on').innerText().catch(() => '');
check(bl === 'On the floor', `the building’s laundry kept: ${bl}`);
await shot('13-edit-details');
await p.getByRole('button', { name: 'Cancel' }).first().click();
await settle();

// A typed address: every field empty, + Add its StreetEasy link.
await p.goto(`${base}/tools/comp-report/`);
await settle();
await p.getByRole('button', { name: '+ New comp' }).first().click();
await p.locator('#sh-nc-line').fill('245 East 19th Street #4B');
await p.getByRole('button', { name: 'Start →' }).click();
await p.waitForURL(/start=basics/, { timeout: 20000 });
await settle();
await shot('14-typed-basics');

writeFileSync(join(out, 'walk.json'), JSON.stringify({ errors, log }, null, 2));
console.log(JSON.stringify({ errors, log: log.length }, null, 2));
await browser.close();
