// DEV ONLY — the walk for the sample that resets (Dispatch 23 items 1–2): start the sample from the new
// report's first step, ruin it (sort it, fill Findings), then Reset the sample: a fresh, unsorted copy
// opens, Hubert starts afresh, and the old one is under Archived. Sort and Findings again on the fresh one.
// Against the local dev server, as an admin. Playwright from the environment (require('playwright')).
//   node tools-src/comp-report/dev/walk-sample-reset.mjs <base> <outDir> [condo|coop]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const [base = 'http://localhost:5173', out = join(here, 'out'), type = 'condo'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const errors = [];
const check = (ok, what) => { if (!ok) errors.push(`expected: ${what}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => sessionStorage.setItem('cr-dev-session', 'kimani@casa-blanca.com'));
await ctx.addInitScript(() => { try { localStorage.removeItem('cr-build-notes'); localStorage.setItem('cr-view-as-new-agent', '0'); } catch {} });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(`pageerror ${e}`));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|status of 4/.test(m.text())) errors.push(`console ${m.text()}`); });
p.on('dialog', (d) => void d.accept());
const settle = async () => { await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(600); };
const shot = async (name, full = false) => { await settle(); await p.screenshot({ path: join(out, `${name}-${type}.png`), fullPage: full }); await p.mouse.move(0, 0); };
const idNow = () => new URL(p.url()).searchParams.get('report');
const fill = async (which) => { await p.locator('.sh-dev-fill').getByRole('button', { name: which, exact: true }).click(); await settle(); };
const tiered = () => p.locator('.so-seg button[aria-pressed="true"]').count();

// 1. The new report's first step: start from the sample, condo or co-op.
await p.goto(`${base}/tools/comp-report/`);
await settle();
await p.getByRole('button', { name: /new (report|comp)/i }).first().click();
await settle();
await shot('01-new-report-sample-links');
await p.getByRole('button', { name: type === 'coop' ? 'Co-op' : 'Condo', exact: true }).last().click();
await p.waitForURL(/report=/);
await settle();
await shot('02-step2-from-the-sample');
const first = idNow();

// 2. Straight to Sort: unsorted, with Reset the sample beside Fill with sample.
await p.goto(`${base}/tools/comp-report/?report=${first}&step=sort`);
await p.waitForSelector('.so-group');
await settle();
check(await p.getByRole('button', { name: 'Reset the sample' }).isVisible(), 'Reset the sample shows on a sample report');
check((await tiered()) === 0, 'a new sample starts unsorted');

// 3. Ruin it: sort it and fill Findings.
await fill('Sort');
check((await tiered()) > 0, 'the sample sort tiers the comps');
await shot('03-sort-after-testing');
await fill('Findings');
await p.goto(`${base}/tools/comp-report/?report=${first}&step=findings`);
await settle();
await shot('04-findings-after-testing', true);

// 4. Reset: a fresh copy opens on Sort, unsorted; the old one is archived.
await p.getByRole('button', { name: 'Reset the sample' }).click();
await p.waitForFunction((old) => new URL(location.href).searchParams.get('report') !== old, first);
await p.waitForSelector('.so-group');
await settle();
const fresh = idNow();
check(fresh && fresh !== first, 'a new report opens');
check((await tiered()) === 0, 'the fresh sample is unsorted');
await shot('05-after-reset-sort');

// 5. Walk the fresh one through Sort and Findings.
await fill('Sort');
await fill('Findings');
await p.goto(`${base}/tools/comp-report/?report=${fresh}&step=findings`);
await settle();
await shot('06-fresh-findings', true);
if (type === 'coop') check(!/\/\s?sq\s?ft|per sq/i.test(await p.locator('.sh-screen').innerText()), 'no $/sq ft on a co-op');

// 6. The list: the fresh one, and the old one under Archived.
await p.goto(`${base}/tools/comp-report/`);
await settle();
const archived = p.getByRole('button', { name: /archived/i }).first();
if (await archived.count()) await archived.click();
await shot('07-list-old-one-archived', true);

// 7. Reset again from the fresh one: it is resettable too.
await p.goto(`${base}/tools/comp-report/?report=${fresh}&step=sort`);
await p.waitForSelector('.so-group');
await settle();
await p.getByRole('button', { name: 'Reset the sample' }).click();
await p.waitForFunction((old) => new URL(location.href).searchParams.get('report') !== old, fresh);
check(idNow() !== fresh, 'the fresh sample resets too');

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`ok ${type}`);
