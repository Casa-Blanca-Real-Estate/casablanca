// The placeholder email and the appraisal-word check, on the sample report.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compute, parseExport } from '../engine/index.ts';
import { SAMPLE_EXPORT } from '../server/sample/barclay-17l-export.ts';
import { SAMPLE_INTAKE, SAMPLE_TIERS } from '../server/sample/barclay-17l.ts';
import { appraisalFindings, PLACEHOLDER_DISCLAIMER, placeholderEmail, SAMPLE_BANNER } from './email.ts';
import { engineInput, workspaceComps } from './engine-input.ts';
import { clientPrice, pct, psf, usd } from './format.ts';

const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
const comps = workspaceComps([{ importId: 'i', createdAt: '2026-09-29T00:00:00Z', parsed }], SAMPLE_TIERS.map((t, i) => ({
  reportCompId: `rc${i}`, propertyKey: t.propertyKey, evidenceClass: 'sold', tier: t.tier, anchor: Boolean(t.anchor), reviewedAt: null,
  reasons: [{ tier: t.tier, reason: t.reason, reasonType: t.reasonType, actor: 'agent', at: '2026-09-29T00:00:00Z', by: 'k', sample: true }],
  source: { kind: 'export' as const, importId: 'i' },
})));
const output = compute(engineInput({ asOf: '2026-09-29', intake: SAMPLE_INTAKE, comps }));

test('the sample draft is labelled a sample, quotes only engine figures, and discloses the estimates', () => {
  const { subject, body } = placeholderEmail({
    subjectLine: '100 Barclay Street #17L', audience: 'seller', output, result: 'with_estimates', comps, agentName: 'Kimani', sample: true,
  });
  assert.ok(subject.startsWith('[SAMPLE] '));
  assert.ok(body.startsWith(SAMPLE_BANNER));
  assert.ok(body.includes('Hi [client name],'), 'no client name: a placeholder to fill in');
  const r = output.results.with_estimates;
  assert.ok(body.includes(`${clientPrice(r.range!.low.value)} to ${clientPrice(r.range!.high.value)}`));
  assert.ok(body.includes('200 Chambers Street #10A: sold Aug 27, 2026 for $4,650,000 ($2,112 a square foot), −3.0% against its last asking price'));
  assert.ok(body.includes('On the market now (asking prices, not sales):'));
  assert.ok(body.includes('This range includes our own estimates, where the facts aren\'t known yet:\n- The home’s interior size is our estimate.'));
  assert.ok(body.includes(PLACEHOLDER_DISCLAIMER) && body.includes('Data provided by StreetEasy.'));
  assert.deepEqual(appraisalFindings(body), [], 'the template itself never says appraisal');
});

test('"on the facts" without a subject size says why there is no range', () => {
  const { body } = placeholderEmail({ subjectLine: '17L', audience: 'seller', output, result: 'on_facts', comps, agentName: '', clientName: ' Jordan ', sample: false });
  assert.ok(body.includes('Hi Jordan,'));
  assert.ok(body.includes("We don't have a range yet:"));
  assert.equal(body.includes(SAMPLE_BANNER), false);
});

test('the appraisal check finds the words in any case, and nothing else', () => {
  assert.deepEqual(appraisalFindings('Our Appraisal says; appraised  value is x; appraisals; appraise it; appraiser').map((f) => f.match), ['Appraisal', 'appraised  value', 'appraisals']);
});

test('formatting: $/sqft truncates, money is whole dollars, client prices are three figures', () => {
  assert.deepEqual([psf(2112.676), usd(4650000.4), pct(-3.02), pct(12.26), clientPrice(4225352), clientPrice(950000)], ['$2,112', '$4,650,000', '−3.0%', '+12.3%', '$4.23M', '$950K']);
});
