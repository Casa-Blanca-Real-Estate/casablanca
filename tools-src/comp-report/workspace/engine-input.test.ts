// From the walkthrough's stored state to the engine, with Hannah's export and
// the sample: the numbers the reveal shows, and what never reaches them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compute, parseExport } from '../engine/index.ts';
import { SAMPLE_EXPORT } from '../server/sample/barclay-17l-export.ts';
import { SAMPLE_CALL, SAMPLE_DEAL_TERMS, SAMPLE_INTAKE, SAMPLE_TARGET, SAMPLE_TIERS } from '../server/sample/barclay-17l.ts';
import { dealTermsInput, engineInput, namedPrices, removedComps, removedExportComps, subjectFacts, withOverrides, workspaceComps, type ParsedImport } from './engine-input.ts';
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
  // A co-op's monthly charge (Details' "Maintenance") is its maintenance, which the engine's carry reads.
  const charges = { ...noSize, commonCharges: { value: 5200, asOf: AS_OF } };
  assert.equal(subjectFacts(charges, AS_OF, 'coop').maintenance_monthly?.value, 5200);
  assert.equal(subjectFacts(charges, AS_OF, 'coop').common_charges_monthly, undefined);
  assert.equal(subjectFacts(charges, AS_OF, 'condo').common_charges_monthly?.value, 5200);
  assert.ok(!compute(engineInput({ asOf: AS_OF, intake: charges, comps: coops, propertyType: 'coop' })).gaps.some((g) => g.code === 'subject_carry_missing'));
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

// ─── The agent's corrections to a source's facts (Dispatch 15, NW-044) ───────

const CHAMBERS = 'pk1|ny|new york|200 chambers st|10A';
const ACTIVE_108 = 'pk1|ny|new york|108 leonard st|7G';
const by = 'kimani@casa-blanca.com';
const at = '2026-10-16T12:00:00.000Z';

test('a correction counts as the agent’s fact, marked changed; StreetEasy’s value stays on the original', () => {
  const judgments = sampleJudgments();
  const j = judgments.find((x) => x.propertyKey === CHAMBERS)!;
  const exportRecord = parsed.comps.find((r) => r.identity.key === CHAMBERS)!;
  const was = { price: exportRecord.facts.sale_price!.value, size: exportRecord.facts.area_sqft?.value, floor: exportRecord.facts.floor?.value };
  j.factOverrides = { price: { value: 4_100_000, by, at }, size: { value: 2_000, by, at }, floor: { value: 1, by, at }, date: { value: '2026-07-01', by, at } };
  const comps = workspaceComps(imports, judgments);
  const c = comps.find((x) => x.id === CHAMBERS)!;
  assert.deepEqual(
    [c.record.facts.sale_price, c.record.facts.area_sqft?.value, c.record.facts.floor?.value, c.record.facts.status_date?.value],
    [{ value: 4_100_000, source: 'agent', as_of: '2026-10-16', confidence: 'exact', note: 'changed by the agent' }, 2_000, 1, '2026-07-01'],
  );
  assert.equal(c.record.flags.approx_area, false);
  assert.equal(c.original?.facts.sale_price?.value, was.price, 'StreetEasy’s value is kept beside it');
  // The parsed export is shared and cached: it's never written to.
  assert.deepEqual([exportRecord.facts.sale_price!.value, exportRecord.facts.area_sqft?.value, exportRecord.facts.floor?.value], [was.price, was.size, was.floor]);
  // The checks re-run on the new value: a first floor against a 17th-floor home.
  const out = compute(engineInput({ asOf: AS_OF, intake: SAMPLE_INTAKE, comps }));
  const checks = out.comps.find((x) => x.id === CHAMBERS)!.checks;
  assert.equal(checks.find((k) => k.code === 'first_floor')?.status, 'flagged');
  // And it counts as a fact: "on the facts" uses it like any exact value.
  assert.equal(engineInput({ asOf: AS_OF, intake: SAMPLE_INTAKE, comps }).comps.find((x) => x.id === CHAMBERS)!.record.facts.sale_price?.confidence, 'exact');
});

test('a price correction is the sale price for a sold comp and the ask otherwise; cleared, StreetEasy’s comes back', () => {
  const judgments = sampleJudgments();
  const j = judgments.find((x) => x.propertyKey === ACTIVE_108)!;
  j.factOverrides = { price: { value: 3_333_000, by, at } };
  const c = workspaceComps(imports, judgments).find((x) => x.id === ACTIVE_108)!;
  assert.equal(c.record.facts.list_price?.value, 3_333_000);
  assert.equal(c.record.facts.sale_price, undefined);
  j.factOverrides = {};
  const back = workspaceComps(imports, judgments).find((x) => x.id === ACTIVE_108)!;
  assert.equal(back.original ?? null, null);
  assert.equal(back.record, parsed.comps.find((r) => r.identity.key === ACTIVE_108), 'no correction: the record as parsed');
});

test('a stored correction the engine wouldn’t take, or a key off the list, is ignored, and nothing reaches Object.prototype', () => {
  const record = parsed.comps.find((r) => r.identity.key === CHAMBERS)!;
  const odd = JSON.parse('{"__proto__": {"value": 1, "by": "x", "at": "y"}, "constructor": {"value": 2}, "prototype": {"value": 3}, "price": {"value": "4100000", "by": "x", "at": "y"}, "floor": {"value": 2.5}}');
  assert.equal(withOverrides(record, odd), null);
  assert.equal(Object.keys(Object.prototype).length, 0);
  assert.equal(({} as Record<string, unknown>).value, undefined);
});

test('the Removed fold reads every removed comp, oldest removal first, with its corrections', () => {
  const judgments = sampleJudgments();
  const a = { ...judgments[1]!, removedAt: '2026-10-15T11:00:00.000Z' };
  const b = { ...judgments[2]!, removedAt: '2026-10-15T10:00:00.000Z', factOverrides: { floor: { value: 3, by, at } } };
  const typed = {
    ...judgments[3]!, propertyKey: 'pk1|ny|new york|1 main st|2', removedAt: '2026-10-15T12:00:00.000Z',
    source: { kind: 'manual' as const, fields: { address: '1 Main Street, New York, NY', unit: '#2', status: 'sold', price: 3000000 }, asOf: AS_OF },
  };
  const out = removedComps(imports, [a, b, typed, ...judgments.slice(4)]);
  assert.deepEqual(out.map((c) => c.judgment!.reportCompId), [b.reportCompId, a.reportCompId, typed.reportCompId]);
  assert.equal(out[0]!.record.facts.floor?.value, 3);
  assert.equal(out[2]!.origin, 'manual');
});
