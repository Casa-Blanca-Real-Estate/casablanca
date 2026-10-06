// The client email in Frankie's order, around the agent's headline, and the
// checks before it goes out: the headline is required (D-21), "appraisal" is
// the one hard block (D-2) except in the approved disclaimer (D-13), and the
// estimates are disclosed when the email uses them (§9.5).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compute, parseExport } from '../engine/index.ts';
import { SAMPLE_EXPORT } from '../server/sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_TIERS } from '../server/sample/barclay-17l.ts';
import {
  appraisalFindings, buildEmail, DISCLAIMER, emailChecks, HEADLINE_PLACEHOLDER, headlineDrafts, htmlFromText, qaStatus, SAMPLE_BANNER,
  type EmailInput,
} from './email.ts';
import { engineInput, workspaceComps } from './engine-input.ts';
import { againstAsk, clientPrice, pct, psf, usd } from './format.ts';
import { numbersNotInFacts } from './grounding.ts';
import { fact } from './reading.ts';

const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
const comps = workspaceComps([{ importId: 'i', createdAt: '2026-09-29T00:00:00Z', parsed }], SAMPLE_TIERS.map((t, i) => ({
  reportCompId: `rc${i}`, propertyKey: t.propertyKey, evidenceClass: 'sold', tier: t.tier, anchor: Boolean(t.anchor), reviewedAt: null,
  reasons: [{ tier: t.tier, reason: t.reason, reasonType: t.reasonType, actor: 'agent', at: '2026-09-29T00:00:00Z', by: 'k', sample: true }],
  source: { kind: 'export' as const, importId: 'i' },
})));
const output = compute(engineInput({ asOf: '2026-09-29', intake: SAMPLE_INTAKE, comps }));
const HEADLINE = 'The three closest sales put 17L at $2,112–$2,457 a sq ft — about $4.23M–$4.92M.';
const base: EmailInput = {
  homeLine: '100 Barclay Street #17L', audience: 'buyer', output, result: 'with_estimates', comps, agentName: 'Frankie',
  clientName: 'Leeann', headline: HEADLINE, chosen: 'I focused on high floors in full-service buildings.',
  consider: 'The Greenwich Club trades higher.', nextStep: 'If you offer, I’d start at $4.2M.', length: 'full', sample: false,
};

test('the email goes in Frankie’s order: greeting, headline, how they were chosen, the comps by status with notes, things to consider, the next step, sign-off, disclaimer', () => {
  const { subject, text, html } = buildEmail(base);
  assert.equal(subject, '100 Barclay Street #17L: what the comps say');
  const at = (s: string) => {
    const i = text.indexOf(s);
    assert.ok(i >= 0, `missing: ${s}`);
    return i;
  };
  const order = [
    'Hi Leeann,', HEADLINE, 'The home’s interior size is our estimate.', 'I focused on high floors', 'SOLD\n', 'IN CONTRACT\n', 'ACTIVE\n',
    'THINGS TO CONSIDER\n', 'The Greenwich Club', 'PRICE PER SQ FT FOR 100 BARCLAY STREET #17L\n', '$2,112 - $4.23M\n', 'If you offer', 'Frankie', DISCLAIMER,
  ].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'in order');
  assert.ok(text.includes('- 200 Chambers Street #10A — sold for $4,650,000 ($2,112 a sq ft), 3.0% below its last ask · 24 days on the market — https://streeteasy.com/building/200-chambers-street-new_york/10a'));
  assert.ok(text.includes('  Full-service Tribeca condo, high floor, water views, close in size — the closest match.'), 'the agent’s note under its comp');
  assert.ok(html.includes('<a href="https://streeteasy.com/building/200-chambers-street-new_york/10a">200 Chambers Street #10A</a>'), 'comps paste as links');
  assert.equal(text.includes('79 Laight'), false, 'an excluded comp isn’t listed');
  assert.deepEqual(appraisalFindings(text), [], 'the approved disclaimer isn’t a finding');
});

test('empty sections are left out; short and text lengths keep only what they need', () => {
  const bare = buildEmail({ ...base, chosen: undefined, consider: undefined, nextStep: undefined }).text;
  assert.equal(bare.includes('THINGS TO CONSIDER'), false);
  const short = buildEmail({ ...base, length: 'short' }).text;
  assert.ok(short.includes('SOLD') && !short.includes('ACTIVE') && !short.includes('I focused') && !short.includes('the closest match'));
  assert.equal(short.includes('PRICE PER SQ FT'), false, 'the price table is the full email’s');
  const sms = buildEmail({ ...base, length: 'text' }).text;
  assert.ok(sms.startsWith('Hi Leeann,') && sms.includes(HEADLINE) && sms.includes('If you offer') && sms.includes(DISCLAIMER));
  assert.equal(sms.includes('SOLD'), false);
});

test('no headline: a placeholder, and the email can’t be copied until there is one (D-21)', () => {
  const { subject, text } = buildEmail({ ...base, headline: undefined });
  assert.ok(text.includes(HEADLINE_PLACEHOLDER));
  const checks = emailChecks({ text: `${subject}\n${text}`, headline: undefined, result: 'with_estimates', output, sample: false });
  assert.deepEqual(qaStatus(checks), { ready: false, line: '1 thing to fix' });
  const ok = emailChecks({ text: `${subject}\n${buildEmail(base).text}`, headline: HEADLINE, result: 'with_estimates', output, sample: false });
  assert.deepEqual(qaStatus(ok), { ready: true, line: 'Ready to send' });
});

test('QA: appraisal language blocks, a removed disclaimer blocks, undisclosed estimates block, sample data warns', () => {
  const text = buildEmail(base).text;
  const q = (t: string, sample = false) => emailChecks({ text: t, headline: HEADLINE, result: 'with_estimates', output, sample });
  const fails = (t: string) => q(t).filter((c) => c.state === 'fail').map((c) => c.id);
  assert.deepEqual(fails(`${text}\nOur appraisal is attached.`), ['appraisal']);
  assert.deepEqual(fails(text.replace(DISCLAIMER, '')), ['disclaimer']);
  assert.deepEqual(fails(text.replace('The home’s interior size is our estimate.', '')), ['estimates']);
  assert.deepEqual(qaStatus(q(text, true)), { ready: true, line: 'Ready, with a note' });
  const sampleDraft = buildEmail({ ...base, sample: true });
  assert.ok(sampleDraft.subject.startsWith('[SAMPLE] ') && sampleDraft.text.startsWith(SAMPLE_BANNER));
});

test('the appraisal check finds the words in any case, and nothing else', () => {
  assert.deepEqual(appraisalFindings('Our Appraisal says; appraised  value is x; appraisals; appraise it; appraiser').map((f) => f.match), ['Appraisal', 'appraised  value', 'appraisals']);
});

test('headline drafts cite only the headline facts and their names, never the agent’s number (§8.4)', () => {
  const withCall = compute(engineInput({ asOf: '2026-09-29', intake: SAMPLE_INTAKE, comps, prices: [{ id: 'call_low', kind: 'call', label: 'Your number, low', price: 3_400_000 }, { id: 'call_high', kind: 'call', label: 'Your number, high', price: 4_200_000 }] }));
  const h = withCall.headline_facts.with_estimates;
  const drafts = headlineDrafts(h);
  assert.equal(drafts[0], HEADLINE, 'the first is the neutral reading');
  assert.ok(drafts.some((d) => d.includes('three most similar homes')));
  assert.ok(drafts.some((d) => d.includes(`closing a median ${againstAsk(fact(h, 'sold.median_sale_to_ask')!.value, 'their')}.`)));
  assert.ok(drafts.some((d) => d.startsWith('The closest comp, 200 Chambers Street #10A, sold at $2,112 a sq ft')), 'the anchor, by its name');
  for (const d of drafts) assert.deepEqual(numbersNotInFacts(d, h), [], `every number traces to a fact: ${d}`);
  assert.equal(drafts.some((d) => d.includes('$3.4M') || d.includes('$4.2M')), false, 'the agent’s number is in none');
  const noRange = withCall.headline_facts.on_facts; // the size is the agent's estimate: no range on the facts
  assert.deepEqual(headlineDrafts(noRange), ['The three closest sales have a median of $2,269 a sq ft.'], 'without a range, what the sales say per foot');
  assert.deepEqual(numbersNotInFacts(headlineDrafts(noRange)[0]!, noRange), []);
});

test('a headline number that matches no headline fact warns, and doesn’t block', () => {
  const text = buildEmail(base).text;
  const q = (headline: string) => emailChecks({ text, headline, result: 'with_estimates', output, sample: false });
  assert.equal(q(HEADLINE).find((c) => c.id === 'grounding')?.state, 'pass');
  const stray = q('The sales put 17L at about $5.1M.');
  assert.deepEqual(stray.find((c) => c.id === 'grounding'), { id: 'grounding', state: 'warn', message: 'Check $5.1M in the headline: it doesn’t match the numbers.' });
  assert.deepEqual(qaStatus(stray), { ready: true, line: 'Ready, with a note' });
});

test('didn’t sell is its own group, from the engine’s numbers (§6.3)', () => {
  const didntSell = workspaceComps([], [{
    reportCompId: 'rc-ds', propertyKey: 'pk1|ny|new york|100 barclay st|16L', evidenceClass: 'off_market', tier: 'primary', anchor: false, reviewedAt: null,
    reasons: [{ tier: 'primary', reason: 'Same line, a floor down: asked $5.1M and never sold', reasonType: 'property', actor: 'agent', at: '2026-09-29T00:00:00Z', by: 'k', sample: false }],
    source: { kind: 'manual', asOf: '2026-09-29', fields: { address: '100 Barclay Street, New York, NY', unit: '#16L', status: 'off_market', price: '5100000', date: '2026-07-01', area_sqft: '2000', floor: '16' } },
  }]);
  const all = [...comps, ...didntSell];
  const out = compute(engineInput({ asOf: '2026-09-29', intake: SAMPLE_INTAKE, comps: all }));
  const { text } = buildEmail({ ...base, output: out, comps: all });
  assert.ok(text.includes('DIDN’T SELL\n- 100 Barclay Street #16L — on the market for $5,100,000 ($2,550 a sq ft), and never sold'), 'its last ask, as a ceiling');
  assert.ok(text.indexOf('DIDN’T SELL') > text.indexOf('ACTIVE') && text.indexOf('DIDN’T SELL') < text.indexOf('THINGS TO CONSIDER'));
});

test('an edited draft copies as HTML with its StreetEasy links made links', () => {
  assert.equal(htmlFromText('Hi <Leeann>,\n\nSee https://streeteasy.com/building/x/1 please'),
    '<p>Hi &lt;Leeann&gt;,</p>\n<p>See <a href="https://streeteasy.com/building/x/1">https://streeteasy.com/building/x/1</a> please</p>');
});

test('formatting: $/sqft truncates, money is whole dollars, client prices are three figures', () => {
  assert.deepEqual([psf(2112.676), usd(4650000.4), pct(-3.02), pct(12.26), clientPrice(4225352), clientPrice(950000)], ['$2,112', '$4,650,000', '−3.0%', '+12.3%', '$4.23M', '$950K']);
});
