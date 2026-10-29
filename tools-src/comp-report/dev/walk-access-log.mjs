// DEV ONLY — the walk for the sign-in and activity logs (Dispatch 22b): an agent works a sample
// report (screens, a tier, a call), a mentor reads it, a stranger is refused; then the admin's
// Access panel shows the levels, the sign-ins, that report's timeline and the audit.
// Against the local dev server. Playwright from the environment (require('playwright')).
//   node tools-src/comp-report/dev/walk-access-log.mjs <base> <outDir>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const [base = 'http://localhost:5173', out = join(here, 'out')] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const errors = [];
const browser = await chromium.launch();

async function as(email, viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((e) => sessionStorage.setItem('cr-dev-session', e), email);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${email} pageerror ${e}`));
  p.on('dialog', (d) => void d.accept());
  const settle = async () => { await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(600); };
  return { ctx, p, settle };
}

// 1. The admin makes a sample report (the sample is for admins), walks Sort and Findings.
const admin = await as('kimani@casa-blanca.com');
await admin.p.goto(`${base}/tools/comp-report/`);
await admin.settle();
// Noble is a mentor here, as in production.
await admin.p.getByText('Access · admins only').click();
await admin.p.getByLabel('Email address').fill('noble@casa-blanca.com');
await admin.p.getByLabel('Role').selectOption('mentor');
await admin.p.getByRole('button', { name: 'Grant access' }).click();
await admin.settle();
await admin.p.getByRole('button', { name: /new (report|comp)/i }).first().click();
await admin.settle();
await admin.p.getByRole('button', { name: 'Condo', exact: true }).last().click();
await admin.p.waitForURL(/report=/);
await admin.settle();
const report = new URL(admin.p.url()).searchParams.get('report');
await admin.p.goto(`${base}/tools/comp-report/?report=${report}&step=sort`);
await admin.p.waitForSelector('.so-group');
await admin.settle();
for (const which of ['Sort', 'Findings']) {
  await admin.p.locator('.sh-dev-fill').getByRole('button', { name: which, exact: true }).click();
  await admin.settle();
}
await admin.p.goto(`${base}/tools/comp-report/?report=${report}&step=findings`);
await admin.settle();

// 2. A mentor reads everyone's reports and opens that one. An agent signs in. A stranger is refused.
const mentor = await as('noble@casa-blanca.com');
await mentor.p.goto(`${base}/tools/comp-report/?report=${report}&step=sort`);
await mentor.settle();
const agent = await as('ben@casa-blanca.com');
await agent.p.goto(`${base}/tools/comp-report/`);
await agent.settle();
await agent.p.screenshot({ path: join(out, '05-agent-reports-no-access-panel.png'), fullPage: true });
const stranger = await as('someone@gmail.com');
await stranger.p.goto(`${base}/tools/comp-report/`);
await stranger.settle();

// 3. The admin's Access panel.
await admin.p.goto(`${base}/tools/comp-report/`);
await admin.settle();
await admin.p.getByText('Access · admins only').click();
await admin.settle();
await admin.p.locator('.sh-log').filter({ hasText: 'One report’s timeline' }).locator('select').selectOption(report);
await admin.settle();
const panel = admin.p.locator('details.sh-access').filter({ hasText: 'Access · admins only' });
await panel.screenshot({ path: join(out, '01-access-panel.png') });
for (const [n, title] of [['02', 'Levels'], ['03', 'Sign-ins'], ['04', 'One report’s timeline'], ['06', 'Everyone’s reports and levels']]) {
  await admin.p.locator('.sh-log').filter({ has: admin.p.locator('.sh-log-title', { hasText: new RegExp(`^${title}$`) }) }).screenshot({ path: join(out, `${n}-${title.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '')}.png`) });
}
// 4. Set the agent to practice, and back.
await admin.p.locator('.sh-access-entry').filter({ hasText: 'ben@casa-blanca.com' }).getByRole('button', { name: 'Set to practice' }).click();
await admin.settle();
await admin.p.locator('.sh-log').filter({ has: admin.p.locator('.sh-log-title', { hasText: /^Levels$/ }) }).screenshot({ path: join(out, '07-levels-after-practice.png') });

// 5. On a phone.
const phone = await as('kimani@casa-blanca.com', { width: 390, height: 844 });
await phone.p.goto(`${base}/tools/comp-report/`);
await phone.settle();
await phone.p.getByText('Access · admins only').click();
await phone.settle();
await phone.p.locator('.sh-log').filter({ hasText: 'Sign-ins' }).screenshot({ path: join(out, '08-phone-sign-ins.png') });
// The panel's own lines wrap at phone width (the top bar and the reports table overflow there
// already, a separate fix).
const wide = await phone.p.locator('.sh-log-lines').first().evaluate((el) => el.scrollWidth > el.clientWidth + 1);
if (wide) errors.push('the sign-in lines scroll sideways on a phone');

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('ok', report);
