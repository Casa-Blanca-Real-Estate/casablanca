// DEV ONLY — the walk for the client step on Send and the Designed email (Dispatch 26): a full agent gets
// Hubert's draft of each comp's paragraph and redrafts it; a practice agent (an admin viewing as a new agent)
// writes first, gets feedback, then sees his version; the sample's paragraphs; the Designed email as pasted,
// with its photos copied; phone width. Against the local dev server and the fakes, with CR_DEV_PHOTO_FILE set.
// Needs 'npm i --no-save playwright-core' (the preinstalled Chromium) and psql.
//   node tools-src/comp-report/dev/walk-client.mjs <base> <outDir> <condo|coop> <local database URL>
// The sample's comps have no photos until the deployed site reads their pages, so the walk gives each comp a
// made-up photo URL on StreetEasy's image host in the local database, and the browser is served a local file
// for it. The email's copy goes through the dev server's own photo copy (CR_DEV_PHOTO_FILE).
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [base = 'http://localhost:5173', out = join(here, 'out'), type = 'condo', dbUrl] = process.argv.slice(2);
if (!dbUrl) throw new Error('Pass the local database URL (the one the dev server uses).');
const photoFile = process.env.CR_DEV_PHOTO_FILE;
if (!photoFile) throw new Error('Set CR_DEV_PHOTO_FILE, as for the dev server.');
const OWNER = 'kimani@casa-blanca.com';
mkdirSync(out, { recursive: true });
const seed = (stage) => execFileSync('node', [join(here, 'seed-report.mjs'), base, stage, 'buyer', type, OWNER], { encoding: 'utf8' }).trim().split('\n').at(-1);
const sql = (text) => execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-qc', text], { encoding: 'utf8' });
/** Each comp a photo; and, unless the sample's are wanted, no paragraphs yet. */
function prepare(id, keepLines = false) {
  sql(`begin; set local session_replication_role = replica;
    update comp_report.property_observations o
       set raw = coalesce(o.raw, '{}'::jsonb) || jsonb_build_object('heroImageUrl', 'https://photos.zillowstatic.com/fp/walk-' || rc.id || '-se_large_800_400.jpg')
      from comp_report.report_comps rc where rc.observation_id = o.id and rc.report_id = '${id}';
    ${keepLines ? '' : `update comp_report.report_comps set client_line = null where report_id = '${id}';`}
    commit;`);
}
const errors = [];
const check = (ok, what) => { if (!ok) errors.push(`expected: ${what}`); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const jpeg = readFileSync(photoFile);

async function page(practice, width = 1440) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript((e) => sessionStorage.setItem('cr-dev-session', e), OWNER);
  await ctx.addInitScript((p) => { try { localStorage.removeItem('cr-build-notes'); localStorage.setItem('cr-view-as-new-agent', p ? '1' : '0'); } catch {} }, practice);
  await ctx.route('https://photos.zillowstatic.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/jpeg', body: jpeg }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`pageerror ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|status of 4/.test(m.text())) errors.push(`console ${m.text()}`); });
  return p;
}
const shot = async (p, name, full = false) => { await p.waitForTimeout(500); await p.screenshot({ path: join(out, `${name}-${type}.png`), fullPage: full }); };
const open = async (p, id) => {
  await p.goto(`${base}/tools/comp-report/?report=${id}&step=send`);
  await p.waitForSelector('.se-send');
  await p.waitForTimeout(800);
};
const flow = (p) => p.locator('.cw-modal');
const next = (p) => flow(p).getByRole('button', { name: /^(Next →|See the email)$/ });

/** The Designed email as the copy puts it on the clipboard, on a page of its own, photos and all. */
async function pasted(p, name) {
  await p.locator('.se-foot-actions .btn', { hasText: /^Copy/ }).first().click();
  await p.waitForTimeout(1500);
  const html = await p.evaluate(async () => {
    const items = await navigator.clipboard.read();
    for (const it of items) if (it.types.includes('text/html')) return await (await it.getType('text/html')).text();
    return null;
  });
  check(html, `${name}: HTML on the clipboard`);
  if (!html) return;
  writeFileSync(join(out, `${name}-${type}.html`), html);
  check(/\/api\/comp-report\/email-photo\?k=[A-Za-z0-9_-]{43}/.test(html), `${name}: the photos are Casa's copies`);
  check(!html.includes('zillowstatic'), `${name}: no StreetEasy image link in the email`);
  check(!/Price at|per sq ft steps/i.test(html), `${name}: no price table`);
  const blank = await p.context().newPage();
  await blank.setViewportSize({ width: 760, height: 900 });
  await blank.goto(`${base}/tools/comp-report/`); // the same origin, so the copied photos load
  await blank.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:24px">${html}</body>`);
  await blank.waitForTimeout(800);
  const broken = await blank.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).length);
  check(broken === 0, `${name}: ${broken} photos didn’t load`);
  await blank.screenshot({ path: join(out, `${name}-${type}.png`), fullPage: true });
  await blank.close();
}

// ─── A full agent: the overview, then Hubert's draft of each comp ───────────
{
  const id = seed('send');
  prepare(id);
  const p = await page(false);
  await open(p, id);
  await p.waitForSelector('.cw-modal');
  check((await flow(p).locator('.rv-count').textContent()) === 'Overview', 'the flow opens on its own, at the overview');
  await shot(p, '01-full-overview');
  await flow(p).locator('#cw-headline').fill('The closest sales in Tribeca show where 17L sits today.');
  await flow(p).getByRole('button', { name: 'Get Hubert’s feedback' }).click();
  await flow(p).locator('.rv-round.feedback').waitFor();
  await flow(p).locator('.rv-round.feedback').scrollIntoViewIfNeeded();
  await shot(p, '02-full-overview-feedback');
  await next(p).click();
  await flow(p).locator('.rv-round.take').waitFor();
  check(/Comp 1 of \d+/.test(await flow(p).locator('.rv-count').textContent()), 'Comp 1 of N');
  const para = await flow(p).getByLabel('For the client').inputValue();
  check(para.length > 0 && !para.includes('9,876,543'), 'his draft fills the paragraph, the invented figure dropped');
  check((await flow(p).locator('.cw-email').textContent()).includes(para.slice(0, 30)), 'the box shows the paragraph live');
  await shot(p, '03-full-draft');
  await flow(p).getByLabel('Tell Hubert what to change').fill('Mention it faces the park.');
  await flow(p).getByRole('button', { name: 'Redraft' }).click();
  await p.waitForFunction(() => document.querySelector('.cw-modal .rv-round.take .rv-round-text')?.textContent?.includes('As you asked'));
  await shot(p, '04-full-redrafted');
  await flow(p).getByLabel('For the client').fill(`${await flow(p).getByLabel('For the client').inputValue()} I’d weigh it most.`);
  check((await flow(p).locator('.cw-who').textContent()).includes('edited by you'), 'an edited draft says so');
  await next(p).click();
  await flow(p).locator('.rv-round.take').waitFor();
  await p.keyboard.press('Escape');
  await p.waitForSelector('.cw-modal', { state: 'detached' });
  check(await p.locator('.se-tabs button[aria-pressed="true"]').first().textContent() === 'Designed email', 'Designed leads');
  await shot(p, '05-full-send', true);
  await pasted(p, '06-full-designed-pasted');
}

// ─── A practice agent: write first, feedback, then his version ──────────────
{
  const id = seed('send');
  prepare(id);
  const p = await page(true);
  await open(p, id);
  await p.waitForSelector('.cw-modal');
  check(await flow(p).getByRole('button', { name: /Draft from notes/ }).isDisabled(), 'Draft from notes waits for feedback');
  await shot(p, '07-practice-overview');
  await next(p).click();
  await flow(p).locator('.cw-para').waitFor();
  check(await flow(p).locator('.rv-round.take').count() === 0, 'no draft before the agent writes');
  check(await flow(p).getByRole('button', { name: 'Hubert’s version' }).isDisabled(), 'his version locked before feedback');
  await shot(p, '08-practice-write-first');
  await flow(p).getByLabel('For the client').fill('This one is in a safe neighborhood and close in size, so it says a lot about the price.');
  await flow(p).getByRole('button', { name: 'Get feedback' }).click();
  await flow(p).locator('.rv-round.feedback').waitFor();
  check((await flow(p).locator('.rv-round.feedback').textContent()).includes('Fair housing'), 'the fair-housing list on the agent’s words');
  await shot(p, '09-practice-feedback');
  await flow(p).getByRole('button', { name: 'Hubert’s version' }).click();
  await flow(p).locator('.rv-round.take').waitFor();
  await flow(p).locator('.rv-round.take').scrollIntoViewIfNeeded();
  await shot(p, '10-practice-his-version');
}

// ─── The sample: an overview and a paragraph for every comp ─────────────────
{
  const id = seed('send');
  prepare(id, true);
  const p = await page(false);
  await open(p, id);
  await p.waitForSelector('.cw-modal');
  await flow(p).locator('#cw-headline').fill('The closest sales in Tribeca show where 17L sits today.');
  await next(p).click();
  await flow(p).locator('.cw-para').waitFor();
  check((await flow(p).getByLabel('For the client').inputValue()).length > 0, 'the sample’s paragraph is there');
  check(await flow(p).locator('.rv-round.take').count() === 0, 'no draft asked for over the sample’s own');
  await shot(p, '11-sample-comp-step');
  await p.keyboard.press('Escape');
  await p.waitForSelector('.cw-modal', { state: 'detached' });
  check((await p.locator('.se-lines-head .btn, .se-lines-head button').first().textContent()).includes('Edit them'), 'the card: every comp written');
  await shot(p, '12-sample-send');
  await pasted(p, '13-sample-designed-pasted');
}

// ─── Phone width ────────────────────────────────────────────────────────────
{
  const id = seed('send');
  prepare(id, true);
  const p = await page(false, 390);
  await open(p, id);
  await p.waitForSelector('.cw-modal');
  await shot(p, '14-phone-overview');
  await next(p).click();
  await flow(p).locator('.cw-para').waitFor();
  await shot(p, '15-phone-comp');
  await flow(p).locator('.cw-para').scrollIntoViewIfNeeded();
  await shot(p, '16-phone-paragraph');
  // The studio's top bar overflows at phone width on every step (not this dispatch's): it's left out.
  const wide = async () => p.evaluate(() => [...document.querySelectorAll('body *')]
    .filter((e) => !e.closest('.sh-bar, .sh-account, .se-stage') && e.getBoundingClientRect().right > innerWidth + 1)
    .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`).slice(0, 5).join(', '));
  check(await wide() === '', `nothing in the flow runs off the side at phone width (${await wide()})`);
  await p.keyboard.press('Escape');
  await p.waitForSelector('.cw-modal', { state: 'detached' });
  check(await wide() === '', `nothing on Send runs off the side at phone width (${await wide()})`);
  await shot(p, '17-phone-send');
}

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`walked: ${out}`);
