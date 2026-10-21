// DEV ONLY — the walk for the agent's lines on Send (2026-10-21): the lines first, drafted from the notes,
// tidied, Hubert's feedback and his edit to the email, with Undo; at 1440px and at phone width, against the
// local dev server and the fakes. Needs 'npm i --no-save playwright-core' (the preinstalled Chromium).
//   node tools-src/comp-report/dev/walk-lines.mjs <base> <outDir> [buyer|seller] [condo|coop]
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [base = 'http://localhost:5173', out = join(here, 'out'), side = 'buyer', type = 'condo'] = process.argv.slice(2);
const OWNER = 'kimani@casa-blanca.com';
mkdirSync(out, { recursive: true });
const id = execFileSync('node', [join(here, 'seed-report.mjs'), base, 'findings', side, type, OWNER], { encoding: 'utf8' }).trim().split('\n').at(-1);
const tag = `${side}-${type}`;
const errors = [];
const check = (ok, what) => { if (!ok) errors.push(`expected: ${what}`); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript((e) => sessionStorage.setItem('cr-dev-session', e), OWNER);
await ctx.addInitScript(() => { try { localStorage.removeItem('cr-build-notes'); } catch {} });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(`pageerror ${e}`));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|status of 4/.test(m.text())) errors.push(`console ${m.text()}`); });
const shot = async (name, full = false) => { await p.waitForTimeout(500); await p.screenshot({ path: join(out, `${name}-${tag}.png`), fullPage: full }); };
const field = (label) => p.getByLabel(label, { exact: true });

await p.goto(`${base}/tools/comp-report/?report=${id}&step=send`);
await p.waitForSelector('.se-lines');
await p.waitForTimeout(800);
await shot('01-your-lines-first');
await p.getByRole('button', { name: 'About your lines' }).hover();
check(await p.locator('.se-lines-title .nr-tip').isVisible(), 'the hint behind the ⓘ shows on hover');
await shot('01b-hint');
await p.mouse.move(0, 0);

await p.getByRole('button', { name: /Draft from notes/ }).click();
await p.waitForSelector('.se-lines-note');
check(await p.locator('.se-line-mark').count() > 0, 'a drafted line is marked');
check((await field('How I chose the comps').inputValue()).length > 0, 'how the comps were chosen, drafted');
check((await field('The next step').inputValue()) === '', 'the next step left to the agent');
await shot('02-drafted-from-notes');

await field('The next step').fill('i would open at $3.8M  and ask for a quick close');
await p.waitForTimeout(700);
await p.getByRole('button', { name: /Tidy the wording/ }).click();
await p.waitForFunction(() => document.querySelector('.se-lines-note')?.textContent?.startsWith('Tidied'));
check((await field('The next step').inputValue()) === 'I would open at $3.8M and ask for a quick close.', 'the next step tidied, its number kept');
await shot('03-tidied');
await p.locator('.se-lines-note .link', { hasText: 'Undo' }).click();
check((await field('The next step').inputValue()) === 'i would open at $3.8M  and ask for a quick close', 'Undo puts the agent’s words back');

await p.locator('.sh-pill', { hasText: 'Hubert' }).click();
await p.waitForSelector('.hb');
await p.locator('.hb-chip', { hasText: 'How do my lines read?' }).click();
await p.waitForFunction(() => /get_email returned/.test(document.querySelector('.hb-body')?.textContent ?? ''), null, { timeout: 15_000 });
check(await p.waitForFunction(() => /Checked the email/.test(document.querySelector('.hb-body')?.textContent ?? ''), null, { timeout: 5_000 }).then(() => true, () => false), 'Hubert says he read the email');
await shot('04-hubert-feedback');

await p.getByLabel('Ask Hubert').fill('Change the next step to I’d open at $3.8M and ask for a 30-day close.');
await p.waitForSelector('.hb-send:not([disabled])');
await p.locator('.hb-send').click();
await p.waitForSelector('.sh-toast', { timeout: 15_000 });
await p.waitForTimeout(400);
check((await field('The next step').inputValue()) === 'I’d open at $3.8M and ask for a 30-day close.', 'Hubert’s edit lands in the agent’s line');
check(/Hubert changed the email/.test(await p.locator('.sh-toast').innerText()), 'the toast says so, with Undo');
await shot('05-hubert-edited-the-email');
await p.locator('.sh-toast button', { hasText: 'Undo' }).click();
await p.waitForTimeout(300);
check((await field('The next step').inputValue()) === 'i would open at $3.8M  and ask for a quick close', 'Undo takes Hubert’s edit back');

await p.locator('.hb-close').click();
await p.setViewportSize({ width: 390, height: 844 });
await p.evaluate(() => document.querySelector('.se-lines')?.scrollIntoView());
await shot('06-phone');

await browser.close();
console.log(errors.length ? `PROBLEMS\n${errors.join('\n')}` : 'walk ok', `\n${out}`);
