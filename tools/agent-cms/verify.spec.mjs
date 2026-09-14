// Verification harness for the agent CMS (Dispatch 03).
//
// NOT part of the deploy and NOT a dependency: nothing here is imported by the
// tool, and package.json is untouched (Netlify installs from it, so a dev
// dependency would ship to production). It drives the real page in a real
// browser against an in-memory stand-in for agent-store.mjs.
//
//   npx http-server -p 8099 -s .          # from the repo root
//   node tools/agent-cms/verify.spec.mjs  # needs a playwright on the machine
//
// Covers: the token gate, roster state and suspend, the page-shaped agent view,
// AI draft/edited provenance, publish warning on unreviewed drafts, the
// read-only preview link, blank-stats-stay-blank, the failed-save guard, both
// themes, narrow viewports — and that the dashboard still renders with the CMS
// added to its inventory.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8099/tools/agent-cms/';
const TOKEN = 'test-token';

let fails = 0, checks = 0;
const ok = (label, cond, extra) => {
  checks++;
  if (!cond) fails++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond || !extra ? '' : `\n        ${extra}`));
};

/* ── an in-memory stand-in for agent-store.mjs, same HTTP contract ── */
const db = new Map();
function summarise(r) {
  const d = r.draft || {}, l = r.live || {};
  return {
    slug: r.slug, status: r.status,
    name: d.identity?.name || l.identity?.name || r.slug,
    title: d.identity?.title || '', customDomain: d.delivery?.customDomain || '',
    studioUrl: d.delivery?.studioUrl || '', heroPhoto: d.assets?.heroPhoto || '',
    updatedAt: r.updatedAt, updatedBy: r.updatedBy || '', publishedAt: r.publishedAt || '',
    dirty: r.status !== 'draft' && JSON.stringify(r.draft) !== JSON.stringify(r.live || null),
  };
}
const aiCalls = [];
let saveShouldFail = false;

async function mock(route, req) {
  const url = new URL(req.url());
  const auth = req.headers()['authorization'] || '';
  const j = (body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, body: '' });

  if (url.pathname.endsWith('agent-copy')) {
    if (auth !== 'Bearer ' + TOKEN) return j({ error: 'unauthorized' }, 401);
    const b = req.postDataJSON();
    aiCalls.push(b);
    if (b.task === 'bio') {
      return j({ ok: true, model: 'claude-haiku-4-5-20251001',
        bio: 'Sam Valk works with buyers and sellers across Chelsea and the Upper West Side.',
        flags: ['No years of experience in the notes — left out.'] });
    }
    if (b.task === 'seo') {
      return j({ ok: true, model: 'm', title: 'Sam Valk — Casa Blanca', description: 'A description.', flags: [] });
    }
    if (b.task === 'specialties') return j({ ok: true, model: 'm', specialties: [], flags: [] });
    if (b.task === 'testimonial') return j({ ok: true, model: 'm', quote: 'Cleaned quote.', changed: true, flags: [] });
    return j({ error: 'Unknown task' }, 400);
  }

  const slug = url.searchParams.get('slug');
  const preview = url.searchParams.get('preview');

  if (req.method() === 'GET' && preview && slug) {
    const r = db.get(slug);
    if (!r || r.previewToken !== preview) return j({ error: 'Not found' }, 404);
    return j({ ok: true, preview: true, slug, status: r.status, draft: r.draft });
  }
  if (auth !== 'Bearer ' + TOKEN) return j({ error: 'unauthorized' }, 401);

  if (req.method() === 'GET') {
    if (slug) {
      const r = db.get(slug);
      return r ? j({ ok: true, record: r }) : j({ error: 'Not found' }, 404);
    }
    return j({ ok: true, buildHook: true, roster: [...db.values()].map(summarise).sort((a, b) => a.name.localeCompare(b.name)) });
  }

  if (req.method() === 'POST') {
    const b = req.postDataJSON();
    if (b.action === 'create') {
      if (db.has(b.slug)) return j({ error: 'That slug already exists' }, 409);
      const rec = { slug: b.slug, status: 'draft', draft: b.draft, live: null,
        previewToken: 'pv-' + b.slug, updatedAt: new Date().toISOString(), publishedAt: '' };
      db.set(b.slug, rec);
      return j({ ok: true, record: rec });
    }
    const rec = db.get(b.slug);
    if (!rec) return j({ error: 'Not found' }, 404);
    if (b.action === 'save') { if (saveShouldFail) return j({ error: 'Backend exploded' }, 500); rec.draft = b.draft; rec.updatedAt = new Date().toISOString(); return j({ ok: true, record: rec }); }
    if (b.action === 'publish') {
      if (b.draft) rec.draft = b.draft;
      rec.live = JSON.parse(JSON.stringify(rec.draft));
      rec.status = 'live'; rec.publishedAt = rec.updatedAt = new Date().toISOString();
      return j({ ok: true, record: rec, build: 'triggered' });
    }
    if (b.action === 'status') { rec.status = b.status; rec.updatedAt = new Date().toISOString(); return j({ ok: true, record: rec, build: 'triggered' }); }
    if (b.action === 'rotatePreview') { rec.previewToken = 'pv2-' + b.slug; return j({ ok: true, record: rec }); }
    if (b.action === 'revertDraft') { rec.draft = JSON.parse(JSON.stringify(rec.live)); return j({ ok: true, record: rec }); }
    return j({ error: 'Unknown action' }, 400);
  }
  return j({ error: 'Method not allowed' }, 405);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.route('**/.netlify/functions/agent-*', mock);

const T = (s) => page.locator(s);
const txt = () => page.locator('body').innerText();

/* ── 1. the token gate ── */
await page.goto(BASE);
await page.waitForSelector('#tokenModal.open');
ok('token gate blocks on load', await T('#tokenModal.open').isVisible());
ok('gate explains it is not the dashboard sign-in', (await txt()).includes('shared secret'));

await T('#tokenInput').fill('wrong');
await T('#tokenGo').click();
await page.waitForFunction(() => document.querySelector('#tokenErr').textContent.includes('rejected'), null, { timeout: 4000 });
ok('bad token is rejected and says so', (await T('#tokenErr').innerText()).includes('rejected'));
ok('bad token is not kept', await page.evaluate(() => sessionStorage.getItem('cb_cms_token')) === null
  || await page.evaluate(() => sessionStorage.getItem('cb_cms_token')) === '');

await T('#tokenInput').fill(TOKEN);
await T('#tokenGo').click();
await page.waitForFunction(() => !document.querySelector('#tokenModal').classList.contains('open'), null, { timeout: 8000 });
ok('good token unlocks', !(await T('#tokenModal').evaluate((n) => n.classList.contains('open'))));
ok('token is in sessionStorage not localStorage',
  (await page.evaluate(() => sessionStorage.getItem('cb_cms_token'))) === TOKEN &&
  (await page.evaluate(() => localStorage.getItem('cb_cms_token'))) === null);

// The only console error so far is the 401 from the deliberate wrong-token
// attempt above. Reset, so the final check covers the rest of the run.
errors.length = 0;

/* ── 2. empty roster ── */
ok('empty roster explains itself', (await txt()).includes('No agent sites yet'));

/* ── 3. create an agent ── */
await T('.ucard--brand').click();
await page.waitForSelector('#newModal.open');
await T('#newName').fill('Sam Valk');
ok('slug auto-derives from the name', await T('#newSlug').inputValue() === 'sam-valk');
await T('#newGo').click();
await page.waitForFunction(() => location.hash === '#/agent/sam-valk', null, { timeout: 5000 });
await page.waitForSelector('#sect-hero');
ok('lands in the agent view', (await page.evaluate(() => location.hash)) === '#/agent/sam-valk');

/* ── 4. sections are the page's sections, in page order ── */
const secs = await page.locator('.sect .sect-hd h3').allInnerTexts();
ok('page-shaped sections in page order',
  JSON.stringify(secs) === JSON.stringify(['Hero', 'About', 'The team', 'Past deals', 'Client stories',
    'Drop me a note', 'Buyer’s guide', 'Search listing', 'Delivery']),
  JSON.stringify(secs));
const eyebrows = await page.locator('.sect .eyebrow').allInnerTexts();
const eb = eyebrows.map((e) => e.toLowerCase());
ok('each section says which page it is on', eb[0].includes('sales') && eb[5].includes('every page'),
  JSON.stringify(eyebrows));

/* ── 5. hero band mirrors the page ── */
ok('hero band shows the name at display type', (await T('.hb-name').innerText()).trim() === 'SAM VALK'
  || (await T('.hb-name').innerText()).trim() === 'Sam Valk', await T('.hb-name').innerText());
await T('#f_identity_licenseNumber').fill('10401379863');
await page.waitForTimeout(150);
ok('licence number appears in the hero band live', (await T('.hb-lic').innerText()).includes('10401379863'));

/* ── 6. blank stat stays blank (never 0) ── */
const statVal = await page.evaluate(() => document.querySelector('#f_stats_closedDeals').value);
ok('stat starts blank, not 0', statVal === '');

/* ── 7. AI autofill: draft state, flags, never auto-publish ── */
await page.locator('#sect-about .btn--ai').first().click();
await page.waitForSelector('#aiModal.open');
ok('bio autofill asks for source material', await T('#aiInputWrap').isVisible());
await T('#aiNotes').fill('Sam covers Chelsea and the UWS.');
await T('#aiGo').click();
await page.waitForFunction(() => !document.querySelector('#aiModal').classList.contains('open'), null, { timeout: 6000 });
const bioVal = await page.evaluate(() => document.querySelector('#f_content_bio').value);
ok('bio is filled from the AI draft', bioVal.includes('Sam Valk works with buyers'), bioVal);
ok('AI draft is badged as unreviewed', (await page.locator('#sect-about .badge--ai').count()) === 1);
ok('what it left out is surfaced in the UI', (await T('#sect-about .flags').innerText()).includes('years of experience'));
ok('AI request went to agent-copy with the notes', aiCalls.length === 1 && aiCalls[0].task === 'bio');

/* editing an AI field flips it to edited */
await page.locator('#f_content_bio').fill(bioVal + ' Edited by hand.');
await page.waitForTimeout(150);
ok('editing an AI field flips the badge to edited',
  (await page.locator('#sect-about .badge--ai').count()) === 0 &&
  (await page.locator('#sect-about .badge--edited').count()) === 1);

/* ── 8. repeatable rows ── */
await page.locator('#sect-deals .btn', { hasText: 'Add deal' }).click();
await page.waitForSelector('#sect-deals .rrow');
await page.locator('#r_deals_0_address').fill('54 West 16th St');
await page.locator('#r_deals_0_unit').fill('4E');
await page.locator('#r_deals_0_price').fill('$1,280,000');
ok('deal rows add and fill', (await page.locator('#sect-deals .rrow').count()) === 1);

/* ── 9. save ── */
await page.locator('#saveBtn').click();
await page.waitForFunction(() => document.querySelector('#saveState').textContent.startsWith('Saved'), null, { timeout: 5000 });
ok('draft saves and says so', (await T('#saveState').innerText()).startsWith('Saved'));
ok('draft reached the store', db.get('sam-valk').draft.deals[0].address === '54 West 16th St');
ok('nothing is live yet', db.get('sam-valk').live === null && db.get('sam-valk').status === 'draft');

/* ── 10. publish warns about unreviewed AI drafts ── */
await page.locator('#sect-seo .btn--ai').first().click();
await page.waitForSelector('#aiModal.open');
await T('#aiGo').click();
await page.waitForFunction(() => !document.querySelector('#aiModal').classList.contains('open'), null, { timeout: 6000 });
await page.locator('.btn--go', { hasText: 'Publish' }).click();
await page.waitForSelector('#confirmModal.open');
const cf = await T('#confirmModal').innerText();
ok('publish warns about unreviewed AI drafts', cf.includes('unreviewed AI drafts') || cf.includes('not been reviewed'), cf);
ok('it names which fields', cf.includes('Search listing'), cf);
await T('#cfGo').click();
await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Published'), null, { timeout: 5000 });
ok('publish writes the live snapshot', db.get('sam-valk').status === 'live' && !!db.get('sam-valk').live);
ok('publish triggers a build', (await T('#toast').innerText()).includes('build is running'));

/* ── 11. preview ── */
await page.locator('.btn', { hasText: 'Preview' }).first().click();
await page.waitForSelector('#pvSurface:not([hidden])');
const pv = await T('#pvSurface').innerText();
const pvl = pv.toLowerCase();
ok('preview renders the page in page order',
  pvl.indexOf('sam valk') < pvl.indexOf('meet sam') && pvl.indexOf('meet sam') < pvl.indexOf('past deals'),
  pv.slice(0, 200));
ok('preview shows the deal', pv.includes('54 West 16th St, 4E') && pv.includes('$1,280,000'));
ok('preview is honest that this is not the final design',
  (await T('#pvBarNote').innerText()).includes('not built yet'));
ok('preview omits blank stats rather than showing 0', !pv.includes('Deals closed'));
ok('roster search is hidden in preview', await page.locator('.search').isHidden());

/* ── 12. shareable preview link needs no CMS token ── */
const link = '#/preview/sam-valk?t=pv-sam-valk';
const page2 = await browser.newPage();
const errors2 = [];
page2.on('pageerror', (e) => errors2.push(String(e)));
await page2.route('**/.netlify/functions/agent-*', mock);
await page2.goto(BASE + link);
await page2.waitForSelector('#pvSurface:not([hidden])', { timeout: 6000 });
ok('preview link works with no CMS token',
  (await page2.evaluate(() => sessionStorage.getItem('cb_cms_token'))) === null &&
  (await page2.locator('#pvSurface').innerText()).includes('SAM VALK'));
ok('read-only preview offers no way back into editing',
  (await page2.locator('#pvBarActs .btn').count()) === 0);
ok('a wrong preview token shows nothing', await (async () => {
  const p3 = await browser.newPage();
  await p3.route('**/.netlify/functions/agent-*', mock);
  await p3.goto(BASE + '#/preview/sam-valk?t=nope');
  await p3.waitForTimeout(900);
  const t = await p3.locator('body').innerText();
  const leaked = t.includes('SAM VALK');
  await p3.close();
  return !leaked;
})());
await page2.close();

/* ── 12b. an imported Google testimonial displays as one (Slice 5 lands the ingestion) ── */
await page.goto(BASE + '#/agent/sam-valk');
await page.evaluate((t) => sessionStorage.setItem('cb_cms_token', t), TOKEN);
await page.reload();
await page.waitForSelector('#sect-stories');
await page.locator('#sect-stories .btn', { hasText: 'Add testimonial' }).click();
await page.waitForSelector('#sect-stories .rrow');
await page.locator('#r_testimonials_0_quote').fill('Sam talked us out of two apartments first.');
await page.locator('#r_testimonials_0_author').fill('Adriana M.');
await page.locator('#r_testimonials_0_source').selectOption('google');
await page.waitForTimeout(150);
await page.locator('#saveBtn').click();
await page.waitForFunction(() => document.querySelector('#saveState').textContent.startsWith('Saved'), null, { timeout: 5000 });
await page.reload();
await page.waitForSelector('#sect-stories .rrow');
ok('imported source round-trips', db.get('sam-valk').draft.testimonials[0].source === 'google');
ok('editor badges a Google-sourced testimonial',
  (await page.locator('#sect-stories .rrow-hd').innerText()).toLowerCase().includes('google review'));
await page.locator('.btn', { hasText: 'Preview' }).first().click();
await page.waitForSelector('#pvSurface:not([hidden])');
ok('preview badges a Google-sourced testimonial',
  (await page.locator('#pvSurface').innerText()).toLowerCase().includes('google review'));

/* ── 13. roster shows state, and suspend takes the site down ── */
await page.goto(BASE + '#/');
await page.evaluate((t) => sessionStorage.setItem('cb_cms_token', t), TOKEN);
await page.reload();
await page.waitForSelector('.trow');
const rosterTxt = await T('.list').innerText();
ok('roster row carries status', rosterTxt.toLowerCase().includes('live'));
ok('roster row carries the slug', rosterTxt.includes('/sam-valk'));
ok('roster row carries last-edited', rosterTxt.includes('Edited'));
await page.locator('.trow .btn', { hasText: 'Suspend' }).click();
await page.waitForSelector('#confirmModal.open');
ok('suspend explains the published copy is kept', (await T('#confirmModal').innerText()).includes('restore it later'));
await T('#cfGo').click();
await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Suspended'), null, { timeout: 5000 });
ok('suspend flips status', db.get('sam-valk').status === 'suspended');
ok('suspend keeps the published copy', !!db.get('sam-valk').live);

/* ── 13b. a failed save must not lose the edits on navigation ── */
await page.goto(BASE + '#/agent/sam-valk');
await page.evaluate((t) => sessionStorage.setItem('cb_cms_token', t), TOKEN);
await page.reload();
await page.waitForSelector('#f_content_bio');
await page.locator('#f_content_bio').fill('Edits that must survive a failed save.');
await page.waitForTimeout(120);
saveShouldFail = true;
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('staying on this agent'), null, { timeout: 8000 });
ok('a failed save keeps you on the agent', (await page.evaluate(() => location.hash)) === '#/agent/sam-valk');
ok('a failed save keeps the edits in the form',
  (await page.evaluate(() => document.querySelector('#f_content_bio').value)) === 'Edits that must survive a failed save.');
saveShouldFail = false;
await page.locator('#saveBtn').click();
await page.waitForFunction(() => document.querySelector('#saveState').textContent.startsWith('Saved'), null, { timeout: 5000 });
ok('retrying the save then works', db.get('sam-valk').draft.content.bio === 'Edits that must survive a failed save.');
await page.goto(BASE + '#/');
await page.waitForSelector('.trow');
// The 500 above was the deliberately-failed save.
errors.length = 0;

/* ── 14. night theme ── */
await page.locator('#themeBtn').click();
ok('theme switch flips to night', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'night');
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
ok('night palette actually applies', bg === 'rgb(20, 18, 27)', bg);
await page.locator('#themeBtn').click();

/* ── 15. narrow viewport ── */
await page.setViewportSize({ width: 820, height: 900 });
await page.waitForTimeout(200);
const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('no horizontal overflow at 820px', overflowX <= 1, 'overflow=' + overflowX);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(200);
const ox2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('no horizontal overflow at 390px', ox2 <= 1, 'overflow=' + ox2);

/* ── 16. no JS errors anywhere in that run ── */
ok('no page errors', errors.length === 0 && errors2.length === 0, [...errors, ...errors2].join('\n'));


/* ═════════ the dashboard still works with the CMS in its inventory ═════════ */

errors.length = 0;
const BASE_DASH = 'http://127.0.0.1:8099/';
// signed out: the dashboard must be unchanged for agents
const p1 = await browser.newPage();
p1.on('pageerror', (e) => errors.push('signed-out: ' + e));
p1.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errors.push('signed-out console: ' + m.text()); });
await p1.goto(BASE_DASH);
await p1.waitForSelector('#toolList .trow');
ok('dashboard renders signed out', (await p1.locator('#toolList .trow').count()) > 0);
ok('Agent sites tab hidden signed out', await p1.locator('#webTab').isHidden());
const outTxt = (await p1.locator('body').innerText()).toLowerCase();
ok('CMS not offered to agents', !outTxt.includes('agent cms'));

// search across tabs must not surface a team tool when signed out
await p1.locator('#toolSearch').fill('agent');
await p1.waitForTimeout(250);
ok('search does not leak the team tool',
  !(await p1.locator('#toolList').innerText()).toLowerCase().includes('agent cms'));
await p1.close();

// signed in
const p2 = await browser.newPage();
p2.on('pageerror', (e) => errors.push('signed-in: ' + e));
p2.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errors.push('signed-in console: ' + m.text()); });
await p2.addInitScript(() => localStorage.setItem('cb_auth', 'derek@casa-blanca.com'));
await p2.goto(BASE_DASH + '#web');
await p2.waitForSelector('#toolList .trow');
ok('Agent sites tab visible signed in', await p2.locator('#webTab').isVisible());
const rows = await p2.locator('#toolList .rowtitle').allInnerTexts();
ok('CMS is first in the Agent sites tab',
  rows.length === 2 && rows[0].toLowerCase() === 'agent cms' && rows[1].toLowerCase() === 'agent sites',
  JSON.stringify(rows));
ok('CMS row links to the tool',
  (await p2.locator('#toolList .trow').first().getAttribute('href')) === 'tools/agent-cms/');
ok('CMS row draws its motif', (await p2.locator('#toolList .trow').first().locator('.frame').count()) === 2);
ok('tab note explains the token', (await p2.locator('#noteCell').innerText()).includes('CMS token'));

// every tab still renders with the new inventory entry
for (const t of ['home', 'instagram', 'print', 'photos']) {
  await p2.goto(BASE_DASH + '#' + t);
  await p2.waitForTimeout(200);
  ok('tab renders: ' + t, (await p2.locator('#toolList .trow').count()) > 0);
}
// search reaches it when signed in
await p2.goto(BASE_DASH + '#home');
await p2.locator('#toolSearch').fill('agent cms');
await p2.waitForTimeout(250);
ok('signed-in search finds the CMS',
  (await p2.locator('#toolList').innerText()).toLowerCase().includes('agent cms'));
await p2.close();


ok('no dashboard JS errors', errors.length === 0, errors.join('\n'));

await browser.close();
console.log(`\n${checks - fails}/${checks} passed` + (fails ? ` — ${fails} FAILING` : ' — all green'));
process.exit(fails ? 1 : 0);
