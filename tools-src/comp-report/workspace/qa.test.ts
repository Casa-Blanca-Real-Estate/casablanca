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
import {
  appraisalFindings, draftChecks, estimateSentences, ledgerFor, moneyTokens, pointValueFindings, qaRecord, qaStatus, rangeFigureFor, replaceSpans,
  roundingFindings, syncHeadline, withDisclaimer, withEstimateNotes, withHeadline, type Acknowledgment,
} from './qa.ts';
import { HEADLINE_PLACEHOLDER } from './frame.ts';

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

// ─── The fixes Send can make (Dispatch 14) ───────────────────────────────────
// The sample's range "with estimates" is $4,225,352–$4,915,912: $4.23M–$4.92M, $2,112–$2,457 a sq ft.
// The ledger without the agent's line ("I’d start at $4.15M", which reads as $4.2M at its precision).
const args = { output, result: 'with_estimates' as const, ledger: ledgerFor({ output, result: 'with_estimates', comps, intake: SAMPLE_INTAKE }) };

test('a range end written at another rounding is found, with the range’s own figure', () => {
  const found = roundingFindings('Recent sales put 17L’s value between $4.225M and $4.9M.', args);
  assert.deepEqual(found.map((f) => [f.text, f.expected, f.end]), [['$4.225M', '$4.23M', 'low'], ['$4.9M', '$4.92M', 'high']]);
  assert.equal(found[1]!.index, 'Recent sales put 17L’s value between $4.225M and '.length);
  assert.deepEqual(roundingFindings('Between $4.23M and $4.92M, or $4.9 million at the top.', args).map((f) => f.text), ['$4.9 million']);
  assert.deepEqual(roundingFindings('Between $4.23M and $4.92M.', args), [], 'the range’s own figures');
  assert.deepEqual(roundingFindings('PRICE PER SQ FT FOR 17L\n$2,400 - $4.8M\n$2,450 - $4.9M\n$2,457 - $4.92M\n\nAt most $4.9M.', args).map((f) => [f.text, f.index]),
    [['$4.9M', 'PRICE PER SQ FT FOR 17L\n$2,400 - $4.8M\n$2,450 - $4.9M\n$2,457 - $4.92M\n\nAt most '.length]], 'a price-table line is its step’s price');
  // $4.2M reads as 5 Franklin's $4,175,000 sale at its precision, so it may be that, and isn't flagged.
  assert.deepEqual(roundingFindings('Between $4.2M and $4.9M.', args).map((f) => f.text), ['$4.9M']);
  // Nor is a figure that reads as the agent's own number: here, $4.85M.
  const theirs = ledgerFor({ output, result: 'with_estimates', comps, intake: SAMPLE_INTAKE, agentFigures: [4_850_000] });
  assert.deepEqual(roundingFindings('Between $4.225M and $4.9M.', { ...args, ledger: theirs }).map((f) => f.text), ['$4.225M']);
  assert.deepEqual(roundingFindings('The comps say $4.9M.', { ...args, output: compute(engineInput({ asOf: '2026-09-29', intake: SAMPLE_INTAKE, comps: [] })) }), [], 'no range, nothing to round to');
});

test('a figure just off the range gets the range’s figure, written the same way; one far from it doesn’t', () => {
  assert.deepEqual(rangeFigureFor('$4.95M', args), { end: 'high', figure: '$4.92M', value: 4_915_912 });
  assert.equal(rangeFigureFor('$4,950,000', args)?.figure, '$4,915,912');
  assert.equal(rangeFigureFor('$4.19M', args)?.figure, '$4.23M');
  assert.equal(rangeFigureFor('$2,470', args)?.figure, '$2,457', 'a $/sq ft end, truncated as the email shows it');
  assert.equal(rangeFigureFor('$4.5M', args), null, 'inside the range, and the agent’s to answer for');
  assert.equal(rangeFigureFor('$6.8M', args), null);
  assert.equal(rangeFigureFor('7.5%', args), null);
});

test('money tokens carry their place, value and precision; a link’s digits aren’t figures', () => {
  assert.deepEqual(moneyTokens('From $4.2 million to $950K, see https://streeteasy.com/sale/$4500000.').map((t) => [t.text, t.index, t.value, t.step, t.scaled]),
    [['$4.2 million', 5, 4_200_000, 100_000, true], ['$950K', 21, 950_000, 1000, true]]);
});

test('spans are replaced back to front, so every place holds', () => {
  assert.equal(replaceSpans('between $4.2M and $4.9M', [{ index: 8, length: 5, with: '$4.23M' }, { index: 18, length: 5, with: '$4.92M' }]), 'between $4.23M and $4.92M');
  assert.equal(replaceSpans('abc', [{ index: 5, length: 1, with: 'x' }]), 'abc', 'a span off the end is skipped');
});

test('the disclaimer goes back in: an edited one is restored, a missing one goes at the end', () => {
  assert.equal(withDisclaimer(`Hi.\n\n${DISCLAIMER}`), `Hi.\n\n${DISCLAIMER}`);
  assert.equal(withDisclaimer('Hi.\n\nBest,\nKimani\n'), `Hi.\n\nBest,\nKimani\n\n${DISCLAIMER}`);
  const edited = `Hi.\n\n${DISCLAIMER.replace('informational purposes', 'your information')}\n\nP.S.`;
  assert.equal(withDisclaimer(edited), `Hi.\n\n${DISCLAIMER}\n\nP.S.`);
  assert.equal(withDisclaimer(''), DISCLAIMER);
});

test('the estimate note goes in after the headline’s paragraph, and then the check passes', () => {
  const sentences = estimateSentences(output, 'with_estimates');
  assert.deepEqual(sentences, ['The home’s interior size is our estimate.']);
  assert.deepEqual(estimateSentences(output, 'on_facts'), []);
  const body = `Hi Sam,\n\n${HEADLINE}\n\nThe sales we used.\n\n${DISCLAIMER}`;
  const fixed = withEstimateNotes(body, sentences, HEADLINE);
  assert.equal(fixed, `Hi Sam,\n\n${HEADLINE}\n\n${sentences[0]}\n\nThe sales we used.\n\n${DISCLAIMER}`);
  assert.equal(withEstimateNotes(fixed, sentences, HEADLINE), fixed, 'once');
  assert.equal(withEstimateNotes(`Hi.\n\n${DISCLAIMER}`, sentences), `Hi.\n\n${sentences[0]}\n\n${DISCLAIMER}`, 'no headline: before the disclaimer');
  assert.equal(draftChecks({ text: fixed, headline: HEADLINE, ledger, result: 'with_estimates', output, sample: false }).find((c) => c.id === 'estimates')?.state, 'pass');
});

test('the headline’s placeholder takes the headline; a changed headline changes in the body too', () => {
  assert.equal(withHeadline(`Hi.\n\n${HEADLINE_PLACEHOLDER}\n\nMore.`, 'Mine.'), 'Hi.\n\nMine.\n\nMore.');
  assert.equal(withHeadline(`Hi.\n\n${HEADLINE_PLACEHOLDER}`, '  '), `Hi.\n\n${HEADLINE_PLACEHOLDER}`);
  assert.equal(syncHeadline(`Hi.\n\n${HEADLINE_PLACEHOLDER}\n\nMore.`, undefined, 'Mine.'), 'Hi.\n\nMine.\n\nMore.');
  assert.equal(syncHeadline('Hi.\n\nMine.\n\nMore.', 'Mine.', 'Mine, better.'), 'Hi.\n\nMine, better.\n\nMore.');
  assert.equal(syncHeadline('Hi.\n\nMine.\n\nMore.', 'Mine.', ''), `Hi.\n\n${HEADLINE_PLACEHOLDER}\n\nMore.`, 'cleared: the placeholder again');
  assert.equal(syncHeadline('Hi.\n\nRewritten.', 'Mine.', 'Other.'), 'Hi.\n\nRewritten.', 'a body without it stays as it is');
});

test('fixing both of the handoff’s issues — the rounding and the missing size note — leaves a draft QA passes', () => {
  const headline = 'Recent sales put 17L’s value between $4.23M and $4.9M.';
  const body = `Hi Sam,\n\n${headline}\n\nI focused on the closest sales.\n\nFrankie\n\n${DISCLAIMER}`;
  const before = draftChecks({ text: body, headline, ledger, result: 'with_estimates', output, sample: false });
  assert.equal(qaStatus(before).ready, false);
  const r = roundingFindings(body, args);
  assert.deepEqual(r.map((f) => f.text), ['$4.9M']);
  const fixedHeadline = 'Recent sales put 17L’s value between $4.23M and $4.92M.';
  const fixed = withEstimateNotes(replaceSpans(body, r.map((f) => ({ index: f.index, length: f.text.length, with: f.expected }))), estimateSentences(output, 'with_estimates'), fixedHeadline);
  assert.ok(fixed.includes(fixedHeadline));
  assert.deepEqual(roundingFindings(fixed, args), []);
  assert.deepEqual(qaStatus(draftChecks({ text: fixed, headline: fixedHeadline, ledger, result: 'with_estimates', output, sample: false })), { ready: true, line: 'Ready to send' });
});
