// From the walkthrough's stored state to the engine, with Hannah's export and
// the sample: the numbers the reveal shows, and what never reaches them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compute, parseExport } from '../engine/index.ts';
import { SAMPLE_EXPORT } from '../server/sample/barclay-17l-export.ts';
import { SAMPLE_CALL, SAMPLE_DEAL_TERMS, SAMPLE_INTAKE, SAMPLE_TARGET, SAMPLE_TIERS } from '../server/sample/barclay-17l.ts';
import { dealTermsInput, engineInput, namedPrices, removedExportComps, subjectFacts, workspaceComps, type ParsedImport } from './engine-input.ts';
import type { CompJudgment } from './state.ts';

const AS_OF = '2026-09-29';
const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
const imports: ParsedImport[] = [{ importId: 'imp-1', createdAt: '2026-09-29T10:00:00.000Z', parsed }];

function sampleJudgments(): CompJudgment[] {
  return SAMPLE_TIERS.map((t, i) => ({
    reportCompId: `rc-${i}`,
    propertyKey: t.propertyKey,
    evidenceClass: parsed.comps.find((c) => c.identity.key === t.propertyKey)!.status.evidence_class!,
    tier: t.tier,
    anchor: Boolean(t.anchor),
    reviewedAt: '2026-09-29T10:00:00.000Z',
    reasons: [{ tier: t.tier, reason: t.reason, reasonType: t.reasonType, actor: 'agent', at: '2026-09-29T10:00:00.000Z', by: 'kimani@casa-blanca.com', sample: true }],
    source: { kind: 'export' as const, importId: 'imp-1' },
  }));
}

test('the sample report: "with estimates" has a range; "on the facts" says the size is only an estimate', () => {
  const comps = workspaceComps(imports, sampleJudgments());
  const out = compute(engineInput({ asOf: AS_OF, intake: SAMPLE_INTAKE, dealTerms: SAMPLE_DEAL_TERMS, comps }));
  const facts = out.results.on_facts;
  const est = out.results.with_estimates;
  assert.equal(facts.base, null);
  assert.ok(out.gaps.some((g) => g.code === 'subject_area_estimate_only'));
  assert.ok(est.base && est.range, 'with estimates has a base and a range');
  assert.ok(est.range!.low.value < est.range!.high.value);
  // Primary sold: 200 Chambers, 5 Franklin, 66 Leonard. Evidence status never mixes.
  assert.equal(est.evidence.sold.counts.included, 3);
  assert.equal(est.evidence.sold.counts.primary, 3);
  assert.equal(est.evidence.in_contract.counts.primary, 2);
  assert.equal(Math.trunc(est.evidence.sold.price_per_sqft!.median.value), 2269);
  // The anchor made it through, on the one comp the sample anchors.
  assert.deepEqual(out.comps.filter((c) => c.anchor).map((c) => c.id), ['pk1|ny|new york|200 chambers st|10A']);
  assert.equal(out.deal_terms?.template, 'seller_pricing');
});

test('an unsorted comp counts toward nothing, and says so', () => {
  const comps = workspaceComps(imports, []);
  const input = engineInput({ asOf: AS_OF, intake: SAMPLE_INTAKE, comps });
  assert.ok(input.comps.every((c) => c.tier === 'excluded' && c.tier_reason === 'Not sorted yet'));
  const out = compute(input);
  assert.equal(out.results.with_estimates.base, null);
  assert.ok(out.gaps.some((g) => g.code === 'no_primary_sold_comps'));
});

test('the call and the target are evaluated against the results, never inputs to them', () => {
  const comps = workspaceComps(imports, sampleJudgments());
  const call = { ...SAMPLE_CALL, at: '2026-09-29T11:00:00.000Z' };
  const prices = namedPrices(call, SAMPLE_TARGET);
  assert.deepEqual(prices.map((p) => [p.id, p.kind, p.price]), [['call_low', 'call', 3400000], ['call_high', 'call', 4200000], ['target', 'target', 4250000]]);
  const without = compute(engineInput({ asOf: AS_OF, intake: SAMPLE_INTAKE, comps }));
  const withPrices = compute(engineInput({ asOf: AS_OF, intake: SAMPLE_INTAKE, comps, prices }));
  assert.deepEqual(withPrices.results, without.results);
  assert.equal(withPrices.prices.length, 3);
  assert.deepEqual(namedPrices({ skipped: true, at: 'x' }, null), []);
});

test('the intake becomes the subject’s facts, attributed to the agent; an estimate is a guesstimate', () => {
  const facts = subjectFacts(SAMPLE_INTAKE, AS_OF);
  assert.deepEqual(facts.area_sqft, { value: 2000, source: 'agent', as_of: '2026-09-23', confidence: 'guesstimate', note: 'sample value (walkthrough)' });
  assert.equal(facts.floor!.confidence, 'exact');
  assert.deepEqual([facts.outdoor_private!.value, facts.outdoor_kinds!.value], [false, []]);
  assert.equal(facts.laundry!.value, 'installed');
  // A value the engine would refuse is left out rather than passed on.
  const odd = subjectFacts({ areaSqft: { value: 0, asOf: AS_OF }, beds: { value: 2.5, asOf: AS_OF }, baths: { value: 2.5, asOf: AS_OF } }, AS_OF);
  assert.equal(odd.area_sqft, undefined);
  assert.equal(odd.beds, undefined);
  assert.equal(odd.baths!.value, 2.5);
  const terrace = subjectFacts({ outdoorKind: { value: 'terrace', asOf: AS_OF }, outdoorSqft: { value: 400, asOf: AS_OF, estimate: true } }, AS_OF);
  assert.deepEqual([terrace.outdoor_private!.value, terrace.outdoor_kinds!.value, terrace.outdoor_area_sqft!.confidence], [true, ['terrace'], 'guesstimate']);
});

test('deal terms: the two templates D-10 recommends; financing only when it’s complete', () => {
  const e = <T>(value: T) => ({ value, asOf: AS_OF });
  assert.deepEqual(dealTermsInput({ template: 'buyer_traditional', price: e(3500000), depositPercent: e(10), downPaymentPercent: e(20), ratePercent: e(6.25), termYears: e(30), targetClosing: e('2026-12-15') }), {
    template: 'buyer_traditional', price: 3500000, deposit: { percent: 10 },
    financing: { down_payment: { percent: 20 }, annual_rate_percent: 6.25, term_years: 30 }, target_closing: '2026-12-15',
  });
  assert.deepEqual(dealTermsInput({ template: 'buyer_traditional', price: e(3500000), ratePercent: e(6.25) }), { template: 'buyer_traditional', price: 3500000 });
  assert.deepEqual(dealTermsInput(SAMPLE_DEAL_TERMS), {
    template: 'seller_pricing', seller_target: 4250000, timing: 'List in October', flexibility: 'Some room on price for a quick, clean close',
  });
  assert.equal(dealTermsInput(null), undefined);
});

test('a newer import of the same property replaces its record; comps with no address can’t be sorted', () => {
  const newer: ParsedImport = { importId: 'imp-2', createdAt: '2026-09-30T10:00:00.000Z', parsed: { ...parsed, as_of: '2026-09-30', comps: parsed.comps.slice(0, 2) } };
  const comps = workspaceComps([...imports, newer], []);
  assert.equal(comps.length, 11);
  assert.equal(comps[0]!.importId, 'imp-2');
  const keyless = { ...parsed.comps[0]!, identity: { ...parsed.comps[0]!.identity, key: null } };
  const withKeyless = workspaceComps([{ importId: 'imp-3', createdAt: '2026-10-01T00:00:00.000Z', parsed: { ...parsed, comps: [keyless] } }], []);
  assert.match(withKeyless[0]!.unsortable!, /No address/);
});

test('the Co-op/Condo toggle reaches the engine: like for like, and a co-op with no size computes without per-SF', () => {
  const comps = workspaceComps(imports, sampleJudgments());
  const { areaSqft: _size, ...noSize } = SAMPLE_INTAKE;
  // The sample building is a condo: in a co-op report its comps count in nothing, and say why.
  const input = engineInput({ asOf: AS_OF, intake: noSize, comps, propertyType: 'coop' });
  assert.equal(input.property_type, 'coop');
  assert.equal(input.subject.facts.property_type?.value, 'coop');
  const mixed = compute(input);
  assert.equal(mixed.results.with_estimates.base, null);
  assert.ok(mixed.warnings.some((w) => w.code === 'property_type_mismatch'));
  // The same comps as co-ops, without sizes (most co-op listings have none): a result, on adjusted prices, no $/sq ft.
  const coops = comps.map((c) => {
    const { area_sqft: _a, ...facts } = c.record.facts;
    return { ...c, record: { ...c.record, facts: { ...facts, property_type: { ...c.record.facts.property_type!, value: 'coop' as const } } } };
  });
  const out = compute(engineInput({ asOf: AS_OF, intake: noSize, comps: coops, propertyType: 'coop' }));
  const est = out.results.with_estimates;
  assert.ok(est.base && est.range, 'a co-op with no size still has a base and a range');
  assert.equal(est.bridge.family, 'adjusted_price');
  assert.ok(out.comps.every((c) => c.per_result.with_estimates.price_per_sqft === null || c.per_result.with_estimates.price_per_sqft === undefined));
  // Condo stays the default when a report doesn't say.
  assert.equal(engineInput({ asOf: AS_OF, intake: SAMPLE_INTAKE, comps }).property_type, 'condo');
});

test('removed comps count in nothing; an export’s removed rows are what Hubert may point back to', () => {
  const judgments = sampleJudgments();
  const removed = { ...judgments[0]!, removedAt: '2026-10-15T10:00:00.000Z', anchor: false };
  const comps = workspaceComps(imports, [removed, ...judgments.slice(1)]);
  assert.ok(!comps.some((c) => c.id === removed.propertyKey), 'a removed comp leaves the list');
  assert.equal(comps.length, parsed.comps.length - 1, 'and its export row doesn’t come back unsorted');
  const back = removedExportComps(imports, [removed, ...judgments.slice(1)]);
  assert.deepEqual(back.map((b) => b.judgment.propertyKey), [removed.propertyKey]);
  assert.equal(back[0]!.record.identity.key, removed.propertyKey);
  // A typed-in comp taken out isn't suggested back: only an export's rows are data Hubert can name.
  const typed = { ...removed, source: { kind: 'manual' as const, fields: { address: '1 Main Street, New York, NY', status: 'sold' }, asOf: AS_OF } };
  assert.deepEqual(removedExportComps(imports, [typed]), []);
});
