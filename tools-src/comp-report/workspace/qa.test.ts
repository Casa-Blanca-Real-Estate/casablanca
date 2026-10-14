// QA on a draft (§9; Dispatch 13, item 5): every number checks against the
// ledger, point values warn, appraisal language and the fair-housing list's
// terms block, a word near one waits for an answer, and an answer is logged.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compute, parseExport } from '../engine/index.ts';
import { SAMPLE_EXPORT } from '../server/sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_TIERS } from '../server/sample/barclay-17l.ts';
import { DISCLAIMER } from './email.ts';
import { engineInput, workspaceComps } from './engine-input.ts';
import { fairHousingFindings } from './fair-housing.ts';
import { unmatchedNumbers } from './grounding.ts';
import { appraisalFindings, draftChecks, ledgerFor, pointValueFindings, qaRecord, qaStatus, type Acknowledgment } from './qa.ts';

const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
const comps = workspaceComps([{ importId: 'i', createdAt: '2026-09-29T00:00:00Z', parsed }], SAMPLE_TIERS.map((t, i) => ({
  reportCompId: `rc${i}`, propertyKey: t.propertyKey, evidenceClass: 'sold', tier: t.tier, anchor: Boolean(t.anchor), reviewedAt: null,
  reasons: [{ tier: t.tier, reason: t.reason, reasonType: t.reasonType, actor: 'agent', at: '2026-09-29T00:00:00Z', by: 'k', sample: true }],
  source: { kind: 'export' as const, importId: 'i' },
})));
const output = compute(engineInput({ asOf: '2026-09-29', intake: SAMPLE_INTAKE, comps }));
const ledger = ledgerFor({ output, result: 'with_estimates', comps, intake: SAMPLE_INTAKE, agentText: ['If you offer, I’d start at $4.15M.'] });
const unmatched = (text: string) => unmatchedNumbers(text, ledger).map((n) => n.text);
const chambers = comps.find((c) => c.record.identity.address.street === '200 Chambers Street')!;

test('a draft citing only facts, the comps’ own figures, the table and what the agent wrote passes', () => {
  assert.deepEqual(unmatched('The three closest sales put 17L at $2,112–$2,457 a sq ft — about $4.23M–$4.92M.'), []);
  assert.deepEqual(unmatched('200 Chambers #10A sold for $4,650,000 ($2,112 a sq ft), 3.0% below its last ask, after 24 days.'), []);
  assert.deepEqual(unmatched('The median sale closed 4.0% under its ask after 148 days.'), []);
  assert.deepEqual(unmatched('At $2,200 a foot, the home is about $4.4M.'), [], 'a step of the price table and its price');
  assert.deepEqual(unmatched('I’d start at $4.15M.'), [], 'the agent’s own figure, from their line');
  assert.deepEqual(unmatched('The home is 2,000 sq ft on the 17th floor.'), [], 'the home’s own facts');
});

test('an invented number is caught, at its own precision', () => {
  assert.deepEqual(unmatched('The comps say about $5.1M, or $2,113 a sq ft, or 7.5% below ask.'), ['$5.1M', '$2,113', '7.5%']);
  assert.deepEqual(unmatched('About $4.2 million.'), [], '“million” is a scale, and $4.2M rounds from the range’s low end');
  assert.deepEqual(unmatched('About $6.8 million.'), ['$6.8 million']);
  assert.deepEqual(unmatched('It took 400 days.'), ['400']);
});

test('dates match the dates the tool knows; “24/7” and a link aren’t dates or figures', () => {
  const date = chambers.record.facts.status_date!.value; // YYYY-MM-DD
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]!;
  assert.deepEqual(unmatched(`It closed on ${month} ${d}, ${y}.`), []);
  assert.deepEqual(unmatched(`It closed in ${month} ${y}, on ${m}/${d}.`), []);
  assert.deepEqual(unmatched('It closed on February 30, 2019.'), ['February 30, 2019']);
  assert.deepEqual(unmatched('A 24/7 doorman. https://streeteasy.com/sale/1234567'), []);
});

test('how a comp differs from the home, as the engine measured it, checks', () => {
  const out = output.comps.find((c) => c.id === chambers.id)!;
  const floors = out.per_result.with_estimates.comparisons.find((k) => k.name === 'Floor' && k.units !== null);
  assert.ok(floors, 'the sample compares floors');
  assert.deepEqual(unmatched(`${Math.abs(floors.units!)} floors ${floors.units! > 0 ? 'lower' : 'higher'} than the home.`), []);
});

test('a point value warns; a range, a list price and an offer don’t (§9.2)', () => {
  assert.deepEqual(pointValueFindings('I think it’s worth $4.5M.').map((f) => f.text), ['worth $4.5M']);
  assert.deepEqual(pointValueFindings('The market value is about $4.5M, and it’s a $4.5M apartment.').map((f) => f.text), ['market value is about $4.5M', 'it’s a $4.5M apartment']);
  assert.deepEqual(pointValueFindings('It’s worth $4.2M–$4.9M. Worth noting: list it at $4.5M, or offer $4.3M.'), []);
});

test('appraisal language blocks, outside the approved disclaimer', () => {
  assert.deepEqual(appraisalFindings(`${DISCLAIMER} Our appraisal is attached; the appraiser agreed.`).map((f) => f.match), ['appraisal']);
});

test('a fair-housing term is a hard stop; a word near one waits for an answer; the property’s own words don’t count', () => {
  const hits = (t: string) => fairHousingFindings(t).map((f) => `${f.level}:${f.term.toLowerCase()}`);
  assert.deepEqual(hits('Perfect for young professionals, in a great school district.'), ['hard:perfect for young professionals', 'hard:school district']);
  assert.deepEqual(hits('No kids, adults only.'), ['hard:no kids', 'hard:adults only']);
  assert.deepEqual(hits('No Section 8.'), ['hard:no section 8']);
  assert.deepEqual(hits('Great for a family, near the church.'), ['near:family', 'near:church']);
  assert.deepEqual(hits('A family room, an exclusive listing, and a single-family feel.'), []);
  assert.deepEqual(hits('Comparable sales are available, and the board is able to approve.'), []);
});

const at = '2026-10-14T12:00:00Z';
const email = (body: string) => `100 Barclay Street #17L: what the comps say\nHi Sam,\n\n${body}\n\nFrankie\n\n${DISCLAIMER}`;
const HEADLINE = 'The three closest sales put 17L at $2,112–$2,457 a sq ft — about $4.23M–$4.92M.';
const check = (body: string, acks: Acknowledgment[] = []) => draftChecks({ text: email(body), headline: HEADLINE, ledger, result: 'with_estimates', output, sample: false, acks });

test('the status line: a hard fail can’t be answered away; a near term and a stray number can', () => {
  const estimates = 'The home’s interior size is our estimate.';
  const clean = check(`${HEADLINE} ${estimates}`);
  assert.deepEqual(qaStatus(clean), { ready: true, line: 'Ready to send' });

  const near = check(`${HEADLINE} ${estimates} Great for a family, at about $5.1M.`);
  assert.deepEqual(qaStatus(near), { ready: false, line: '2 things to fix' });
  const answered = check(`${HEADLINE} ${estimates} Great for a family, at about $5.1M.`, [
    { key: 'fair_housing_near:family', how: 'acknowledged', text: 'family', at },
    { key: 'number:$5.1M', how: 'attributed', text: '$5.1M', at },
  ]);
  assert.deepEqual(qaStatus(answered), { ready: true, line: 'Ready, with a note' });
  const record = qaRecord(answered);
  assert.equal(record.ready, true);
  assert.deepEqual(record.checks.find((c) => c.id === 'numbers')?.items?.[0]?.ack, { key: 'number:$5.1M', how: 'attributed', text: '$5.1M', at }, 'the answer is in the log');

  const hard = check(`${HEADLINE} ${estimates} Adults only.`, [{ key: 'fair_housing:adults only', how: 'acknowledged', text: 'adults only', at }]);
  assert.equal(hard.find((c) => c.id === 'fair_housing')?.state, 'fail');
  assert.equal(qaStatus(hard).ready, false, 'an acknowledgment doesn’t clear a hard stop');
});
