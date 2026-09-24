// Studio smoke check — does every page still load?
//
// Loads the dashboard, every hand-written tool, the agent pages and the comp
// report in Chromium, and records per page: HTTP status, uncaught page errors,
// console errors, and failed requests. Given two base URLs it runs both and
// reports only what is new in the second — so pre-existing noise on
// production doesn't read as a regression on a deploy preview.
//
//   node .github/scripts/smoke.mjs <base>                 # one site
//   node .github/scripts/smoke.mjs <baseline> <candidate> # regressions only
//
// Needs Playwright on the machine, not in package.json (Netlify installs from
// it). Point PLAYWRIGHT_MODULE at it if it isn't resolvable from here, e.g.
//   PLAYWRIGHT_MODULE=$(npm root -g)/playwright/index.mjs
// Exits 1 if any page fails to load or the candidate has anything new.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const PAGES = [
  '/',
  '/tools/agent-cms/',
  '/tools/brand/',
  '/tools/business-card/',
  '/tools/carousel/cb_editorial.html',
  '/tools/closed-carousel/',
  '/tools/forsale-carousel/',
  '/tools/incontract-carousel/',
  '/tools/profile-pic/',
  '/tools/watermark-remover/',
  '/tools/watermarker/',
  '/agents/',
  '/agents/sam-valk/',
  '/tools/comp-report/',
];

const strip = (base, s) => String(s).split(base).join('');

async function run(base) {
  base = base.replace(/\/$/, '');
  const browser = await chromium.launch();
  const results = {};
  for (const path of PAGES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const r = { status: null, title: '', textLength: 0, pageErrors: [], consoleErrors: [], failedRequests: [] };
    page.on('pageerror', (e) => r.pageErrors.push(strip(base, e.message)));
    page.on('console', (m) => { if (m.type() === 'error') r.consoleErrors.push(strip(base, m.text())); });
    page.on('requestfailed', (q) => r.failedRequests.push(`${strip(base, q.url())} (${q.failure()?.errorText})`));
    page.on('response', (s) => { if (s.status() >= 400) r.failedRequests.push(`${strip(base, s.url())} (${s.status()})`); });
    try {
      // 'load', not 'networkidle': some tools poll, and never go idle.
      const resp = await page.goto(base + path, { waitUntil: 'load', timeout: 45000 });
      r.status = resp ? resp.status() : null;
      await page.waitForTimeout(3000); // late scripts: studio chrome, feedback, hydration
      r.title = await page.title();
      r.textLength = (await page.evaluate(() => document.body?.innerText || '')).trim().length;
    } catch (e) {
      r.pageErrors.push(`navigation: ${e.message.split('\n')[0]}`);
    }
    for (const k of ['pageErrors', 'consoleErrors', 'failedRequests']) r[k] = [...new Set(r[k])].sort();
    results[path] = r;
    await page.close();
  }
  await browser.close();
  return results;
}

const loaded = (r) => r.status === 200 && r.textLength > 0 && !r.pageErrors.some((e) => e.startsWith('navigation:'));

const [baseA, baseB] = process.argv.slice(2);
if (!baseA) { console.error('usage: smoke.mjs <base> [<candidate>]'); process.exit(2); }

const a = await run(baseA);
let failed = false;

if (!baseB) {
  for (const [path, r] of Object.entries(a)) {
    const ok = loaded(r);
    failed ||= !ok;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.status} ${path}  "${r.title}"`);
    for (const k of ['pageErrors', 'consoleErrors', 'failedRequests']) for (const x of r[k]) console.log(`       ${k}: ${x}`);
  }
} else {
  const b = await run(baseB);
  for (const path of PAGES) {
    const ra = a[path], rb = b[path];
    const news = [];
    if (!loaded(rb)) news.push(`does not load (status ${rb.status}, ${rb.textLength} chars)`);
    if (rb.title !== ra.title) news.push(`title changed: "${ra.title}" → "${rb.title}"`);
    for (const k of ['pageErrors', 'consoleErrors', 'failedRequests']) {
      for (const x of rb[k]) if (!ra[k].includes(x)) news.push(`new ${k}: ${x}`);
    }
    // A page that's new on the candidate (the comp report) has no baseline to diff.
    const isNew = ra.status === 404 && loaded(rb);
    const bad = news.length > 0 && !isNew;
    failed ||= bad;
    console.log(`${bad ? 'NEW ' : 'same'} ${rb.status} ${path}  "${rb.title}"${isNew ? '  (new page)' : ''}`);
    for (const n of news) console.log(`       ${n}`);
  }
}
process.exit(failed ? 1 : 0);
