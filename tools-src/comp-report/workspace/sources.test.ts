// Comps from every source, and the home from its page (Dispatch 09): a link's
// comp counts in neither result until the agent confirms it, then it does; a
// typed-in comp is the agent's; the newest observation decides a comp's record;
// and the home's page fills only what the agent hasn't.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compute, parseExport } from '../engine/index.ts';
import { SAMPLE_EXPORT } from '../server/sample/barclay-17l-export.ts';
import { engineInput, subjectFacts, workspaceComps, type ParsedImport, type RecordCache } from './engine-input.ts';
import type { CompJudgment, CompSource, Intake } from './state.ts';
import { homeFromListing } from './subject.ts';

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../engine/test/fixtures/listings/${name}`, import.meta.url), 'utf8')) as Record<string, unknown>;

const CHAMBERS = 'pk1|ny|new york|200 chambers st|10A';
const judgment = (propertyKey: string, source: CompSource, extra: Partial<CompJudgment> = {}): CompJudgment => ({
  reportCompId: `rc-${propertyKey}`, propertyKey, evidenceClass: 'sold', tier: 'primary', anchor: false, reviewedAt: null,
  reasons: [{ tier: 'primary', reason: 'Closest match', reasonType: 'property', actor: 'agent', at: '2026-09-30T10:00:00Z', by: 'ana@casa-blanca.com', sample: false }],
  source, ...extra,
});
const listing = (confirmedAt: string | null): CompSource => ({
  kind: 'listing', extract: fixture('sold-200-chambers-10a.json'), asOf: '2026-09-30',
  url: 'https://streeteasy.com/building/200-chambers-street-new_york/10a', readId: 'read-1', confirmedAt,
});
const INTAKE: Intake = { areaSqft: { value: 2000, asOf: '2026-09-30' }, floor: { value: 17, asOf: '2026-09-30' } };

test('a link’s comp counts in neither result until the agent confirms it, then it counts like any sale', () => {
  const unconfirmed = workspaceComps([], [judgment(CHAMBERS, listing(null))]);
  assert.equal(unconfirmed.length, 1);
  assert.deepEqual([unconfirmed[0]!.origin, unconfirmed[0]!.unconfirmed, unconfirmed[0]!.readId], ['listing', true, 'read-1']);
  const before = compute(engineInput({ asOf: '2026-09-30', intake: INTAKE, comps: unconfirmed }));
  assert.equal(before.comps[0]!.flags.unconfirmed, true);
  assert.equal(before.comps[0]!.per_result.on_facts.included, false);

  const confirmed = workspaceComps([], [judgment(CHAMBERS, listing('2026-09-30T10:05:00Z'))]);
  assert.equal(confirmed[0]!.unconfirmed, false);
  const after = compute(engineInput({ asOf: '2026-09-30', intake: INTAKE, comps: confirmed }));
  assert.equal(after.comps[0]!.per_result.on_facts.included, true);
  assert.equal(after.comps[0]!.per_result.on_facts.price_per_sqft?.value, 4650000 / 2201);
});

test('a typed-in comp is the agent’s record; an estimate counts with estimates only', () => {
  const typed = workspaceComps([], [judgment('pk1|ny|new york|88 greenwich st|602', {
    kind: 'manual', asOf: '2026-09-30',
    fields: { address: '88 Greenwich Street, New York, NY', unit: '#602', status: 'sold', price: '740000', date: '2026-08-15', area_sqft: { value: '735', estimate: true }, floor: '6' },
  })]);
  assert.deepEqual([typed[0]!.origin, typed[0]!.record.facts.sale_price?.source, typed[0]!.record.facts.area_sqft?.confidence], ['manual', 'agent', 'guesstimate']);
  const out = compute(engineInput({ asOf: '2026-09-30', intake: INTAKE, comps: typed }));
  assert.equal(out.comps[0]!.per_result.on_facts.price_per_sqft, null, 'its size is an estimate: no $/sq ft on the facts');
  assert.ok(out.comps[0]!.per_result.with_estimates.price_per_sqft);
});

test('the newest observation decides a comp’s record: the export’s, or its link’s', () => {
  const parsed: ParsedImport[] = [{ importId: 'imp-1', createdAt: '2026-09-29T10:00:00Z', parsed: parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf }) }];
  const fromExport = workspaceComps(parsed, [judgment(CHAMBERS, { kind: 'export', importId: 'imp-1' })]);
  const chambers = fromExport.find((c) => c.id === CHAMBERS)!;
  assert.deepEqual([chambers.origin, chambers.importId, chambers.judgment?.reportCompId], ['export', 'imp-1', `rc-${CHAMBERS}`]);
  assert.equal(fromExport.length, 11, 'the export’s other rows show too, unsorted');

  const fromLink = workspaceComps(parsed, [judgment(CHAMBERS, listing(null))]);
  const byLink = fromLink.filter((c) => c.id === CHAMBERS);
  assert.equal(byLink.length, 1, 'one property, one row');
  assert.equal(byLink[0]!.origin, 'listing');
});

test('reading a stored source is cached, and a source the parser refuses is left out, not guessed', () => {
  const cache: RecordCache = new Map();
  const a = workspaceComps([], [judgment(CHAMBERS, listing(null))], cache);
  const b = workspaceComps([], [judgment(CHAMBERS, listing(null))], cache);
  assert.equal(cache.size, 1);
  assert.equal(a[0]!.record, b[0]!.record, 'the same record, not read twice');
  const refused = workspaceComps([], [judgment(CHAMBERS, { kind: 'manual', asOf: '2026-09-30', fields: { address: '1 A St', status: 'somewhere' } })], cache);
  assert.equal(refused.length, 0);
});

test('the home’s page fills only what the agent hasn’t, marked from StreetEasy, never an old ask', () => {
  const extract = {
    address: '100 Barclay Street', unit: '#17L', city: 'New York', state: 'NY', status: 'No longer available',
    last_ask: '$3,995,000', floor: '17', interior_size: '~2,000 ft²', beds: '3 beds', baths: '3 baths',
    common_charges: '$2,650/mo', features: ['Central air', 'Washer/dryer'],
  };
  const mine: Intake = { floor: { value: 18, asOf: '2026-09-29' } };
  const home = homeFromListing(extract, { asOf: '2026-09-30', url: 'https://streeteasy.com/building/100-barclay-street-new_york/17l' }, mine);
  assert.equal(home.intake.floor?.value, 18, 'the agent’s own value stands');
  assert.deepEqual(home.intake.areaSqft, { value: 2000, asOf: '2026-09-30', from: 'listing', approx: true });
  assert.equal(home.intake.askingPrice, undefined, 'off the market: its last ask isn’t what it’s asking now');
  assert.equal(home.intake.address?.value, '100 Barclay Street, New York, NY');
  assert.equal(home.intake.unit?.value, '#17L');
  assert.equal(home.intake.laundry?.value, 'installed');
  assert.equal(home.title, '100 Barclay Street #17L');
  assert.ok(!home.filled.includes('floor'));

  const listed = homeFromListing({ ...extract, status: 'For sale' }, { asOf: '2026-09-30', url: null }, {});
  assert.equal(listed.intake.askingPrice?.value, 3995000, 'on the market: its ask is the asking price');

  // The engine sources them to the listing, with the page's own confidence.
  const facts = subjectFacts(home.intake, '2026-09-30');
  assert.deepEqual([facts.area_sqft?.source, facts.area_sqft?.confidence], ['listing', 'approx']);
  assert.deepEqual([facts.floor?.source, facts.floor?.confidence], ['agent', 'exact']);
});
