// DEV ONLY — the Dispatch 18 walk: Send and Done at 1440px against the local dev server and the fakes,
// and what each tab copies, rendered on a blank page with no app CSS (what a paste into Gmail starts from).
// playwright-core isn't a dependency: run 'npm i --no-save playwright-core' first; it uses the preinstalled
// Chromium at /opt/pw-browsers (never 'playwright install').
//   node tools-src/comp-report/dev/walk-send.mjs <base> <outDir> <buyer|seller> <coop|condo>
import { chromium } from 'playwright-core';
import { chromePath } from './chrome-path.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [base = 'http://localhost:5173', out = join(here, 'out'), side = 'seller', type = 'condo'] = process.argv.slice(2);
const OWNER = 'kimani@casa-blanca.com';
mkdirSync(out, { recursive: true });
const seed = (stage, email = OWNER) => execFileSync('node', [join(here, 'seed-report.mjs'), base, stage, side, type, email], { encoding: 'utf8' }).trim().split('\n').at(-1);
const tag = `${side}-${type}`;
const errors = [];
const log = [];

const browser = await chromium.launch({ executablePath: chromePath() });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
await ctx.addInitScript((e) => sessionStorage.setItem('cr-dev-session', e), OWNER);
await ctx.addInitScript(() => { try { localStorage.removeItem('cr-build-notes'); localStorage.setItem('cr-view-as-new-agent', '0'); } catch {} });

async function page(name) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: pageerror ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 4/.test(m.text())) errors.push(`${name}: console ${m.text()}`); });
  return p;
}
const settle = async (p) => { await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(700); };
async function shot(p, name, full = true) {
  await p.waitForTimeout(500);
  const file = join(out, `${name}-${tag}.png`);
  await p.screenshot({ path: file, fullPage: full });
  log.push(file);
}
const url = (id, q) => `${base}/tools/comp-report/?report=${id}&${q}`;
const tab = (p, label) => p.locator('.se-tabs button', { hasText: new RegExp(`^${label === 'Text' ? 'Then text them' : label === 'Designed' ? 'Designed email' : label}$`) });
/** Full and Short sit under "Plain-text fallback" (Dispatch 26). */
const openFallback = (p) => p.locator('.se-fallback').evaluate((d) => { d.open = true; });
const expect = (ok, what) => { if (!ok) errors.push(what); };

/** The clipboard's HTML, on a page of its own: no app CSS, the browser's defaults. */
async function pasted(p, name) {
  const html = await p.evaluate(async () => {
    const items = await navigator.clipboard.read();
    for (const it of items) if (it.types.includes('text/html')) return await (await it.getType('text/html')).text();
    return null;
  });
  expect(html, `${name}: no HTML on the clipboard`);
  if (!html) return;
  writeFileSync(join(out, `${name}-${tag}.html`), html);
  const blank = await ctx.newPage();
  await blank.setViewportSize({ width: 1000, height: 900 });
  await blank.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:24px">${html}</body>`);
  await blank.waitForTimeout(400);
  const italic = await blank.evaluate(() => [...document.querySelectorAll('body *')].some((el) => getComputedStyle(el).fontStyle === 'italic'));
  expect(!italic, `${name}: something renders italic`);
  const blue = await blank.evaluate(() => [...document.querySelectorAll('a')].filter((a) => getComputedStyle(a).color === 'rgb(0, 0, 238)').length);
  expect(blue === 0, `${name}: ${blue} links in the browser's default blue`);
  const file = join(out, `${name}-${tag}.png`);
  await blank.screenshot({ path: file, fullPage: true });
  log.push(file);
  await blank.close();
}

// The report, at Send, with a headline picked from the drafts.
const id = seed('send');
const p = await page('send');
await p.goto(url(id, 'step=send'));
await settle(p);
// Send opens the client step by itself the first time (Dispatch 26): close it to reach the email.
if (await p.locator('.cw-modal').count()) { await p.keyboard.press('Escape'); await settle(p); }
expect(await tab(p, 'Designed').getAttribute('aria-pressed') === 'true', 'Designed is not the default tab');
expect((await p.locator('.se-tabs button').allTextContents()).join(',') === 'Designed email,Then text them,Full,Short', 'tab order');
expect(!(await p.getByText('Hubert drafts the headline').count()), 'the line above Write it is still there');
await shot(p, '01-designed-default');

await openFallback(p);
await tab(p, 'Full').click();
await settle(p);
await p.locator('.se-drafts summary').click();
await p.locator('.se-drafts-menu button').first().click();
await settle(p);
await shot(p, '02-full-subject-first');

// The subject: edited, it makes no draft ("Template" stays, no "edited by you").
await p.locator('#se-subject').fill('Your comps for 17L');
await settle(p);
expect(!(await p.locator('.se-status', { hasText: 'edited by you' }).count()), 'editing the subject made a body draft');
await p.getByRole('button', { name: 'Copy subject' }).click();
const subj = await p.evaluate(() => navigator.clipboard.readText());
expect(subj === 'Your comps for 17L', `Copy subject copied “${subj}”`);

// Edit Full, then Short: both drafts stay.
const body = p.locator('#se-body');
await body.click();
await p.keyboard.press('Control+End');
await p.keyboard.type('\n\nA line I added to the full email.');
await settle(p);
await p.getByRole('button', { name: /^Copy the email$/ }).click();
await settle(p);
await pasted(p, '03-full-copied-as-pasted');
await shot(p, '04-after-copy-mark-as-sent-leads');
expect(await p.locator('.se-foot-note', { hasText: 'Copied. Sent it? Mark it as sent.' }).count() === 1, 'no “Copied. Sent it?” line');
expect(await p.locator('.se-foot .btn.primary.se-sent').count() === 1, 'Mark as sent is not primary after a copy');
const order = await p.locator('.se-foot-actions button').allTextContents();
expect(order[0]?.startsWith('Copy') && order[1] === 'Mark as sent', `footer order: ${order}`);

await openFallback(p);
await tab(p, 'Short').click();
await settle(p);
await body.click();
await p.keyboard.press('Control+End');
await p.keyboard.type('\n\nA line I added to the short one.');
await settle(p);
await p.getByRole('button', { name: /^Copy the email$/ }).click();
await settle(p);
await pasted(p, '05-short-copied-as-pasted');
await shot(p, '06-short');
await openFallback(p);
await tab(p, 'Full').click();
await settle(p);
expect((await body.inputValue()).includes('A line I added to the full email.'), 'the Full draft was lost after editing Short');

await tab(p, 'Text').click();
await settle(p);
expect(!(await p.locator('#se-subject').count()), 'the Text tab has a subject field');
await shot(p, '07-text-no-subject');

await tab(p, 'Designed').click();
await settle(p);
await p.getByRole('button', { name: 'Copy the designed email' }).click();
await settle(p);
await pasted(p, '08-designed-copied-as-pasted');
// Mark as sent: records the tab last copied (Designed), opens Done.
await openFallback(p);
await tab(p, 'Short').click();
await settle(p);
await p.getByRole('button', { name: 'Mark as sent' }).click();
await settle(p);
await shot(p, '09-done-after-mark-as-sent');
expect(await p.getByText(/Sent as the designed email/).count() > 0, 'Done does not say the designed email');
await p.close();

// Mark as sent with no copy at all (a hand copy).
{
  const id2 = seed('send');
  const q = await page('hand');
  await q.goto(url(id2, 'step=send'));
  await settle(q);
  if (await q.locator('.cw-modal').count()) { await q.keyboard.press('Escape'); await settle(q); }
  const mark = q.getByRole('button', { name: 'Mark as sent' });
  expect(await mark.isEnabled(), 'Mark as sent is disabled before a copy');
  await shot(q, '10-before-copy-mark-as-sent-enabled');
  await mark.click();
  await settle(q);
  expect(q.url().includes('step=done') || (await q.getByText(/Sent as/).count()) > 0, 'Mark as sent without a copy did not reach Done');
  await shot(q, '11-done-without-copy');
  await q.close();
}

// A report that isn't mine: the reason instead of the button.
{
  // The sample is admins' only (NB-24), so the admin's report is opened by a mentor, who reads every report (NB-23).
  const id3 = seed('send');
  const MENTOR = 'mentor.walk@casa-blanca.com';
  await fetch(`${base}/api/comp-report/allowlist`, { method: 'POST', headers: { authorization: `Bearer dev.${Buffer.from(OWNER).toString('base64url')}`, 'content-type': 'application/json' }, body: JSON.stringify({ email: MENTOR, role: 'mentor' }) });
  const mctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await mctx.addInitScript((e) => sessionStorage.setItem('cr-dev-session', e), MENTOR);
  const r = await mctx.newPage();
  r.on('pageerror', (e) => errors.push(`readonly: pageerror ${e}`));
  await r.goto(url(id3, 'step=send'));
  await settle(r);
  expect(!(await r.getByRole('button', { name: 'Mark as sent' }).count()), 'Mark as sent shows on a read-only report');
  expect(await r.getByText('This report is read-only, so it can’t be marked as sent.').count() === 1, 'no read-only reason');
  await shot(r, '12-read-only-reason');
  await mctx.close();
}

await ctx.close();
await browser.close();
writeFileSync(join(out, `walk-send-${tag}.json`), JSON.stringify({ shots: log, errors }, null, 1));
console.log(JSON.stringify({ shots: log.length, errors }, null, 1));
