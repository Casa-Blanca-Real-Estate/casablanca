// Comps from StreetEasy links and comps typed in (CR-2.2 phase 1, §6.2): the
// same comp record the export makes, inferred until the agent confirms a
// link's row, and the same stable key, so a comp added both ways is one comp.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compRecordFromListing, compRecordFromManual, compute, confirmListingRecord, LISTING_EXTRACT_PROMPT,
  LISTING_EXTRACT_SCHEMA, ParseError, sameUnit, type CompInput, type CompRecord, type EngineOutput, type ListingRead,
} from '../index.ts';
import { comps, fixtureText, hannah, input, KEY } from './helpers.ts';

const READ_ON = '2026-09-29';
const URL_CHAMBERS = 'https://streeteasy.com/building/200-chambers-street-new_york/10a?share=abc';

function page(name: string, url: string | null = null, as_of = READ_ON): ListingRead {
  return compRecordFromListing(JSON.parse(fixtureText(`listings/${name}.json`)), { as_of, url });
}

/** Hannah's comps with one record swapped for another. */
function swapped(key: string, record: CompRecord): CompInput[] {
  return comps().map((c) => (c.id === key ? { ...c, record } : c));
}

const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code);

test('the extract schema: every value is text as the page shows it, and every field the dispatch lists is there', () => {
  const props = LISTING_EXTRACT_SCHEMA.properties as Record<string, { type: string; description: string; items?: unknown }>;
  for (const field of [
    'address', 'unit', 'url', 'status', 'sale_price', 'sale_date', 'last_ask', 'original_ask', 'list_date', 'contract_date',
    'days_on_market', 'floor', 'interior_size', 'interior_size_approximate', 'beds', 'baths', 'rooms', 'common_charges',
    'taxes', 'maintenance', 'property_type', 'building_name', 'building_units', 'building_stories', 'year_built',
    'new_development', 'amenities', 'features', 'policies', 'history', 'description',
  ]) assert.ok(props[field], field);
  for (const [name, p] of Object.entries(props)) {
    assert.ok(p.description.length > 0 && p.description.length < 140, `${name}: a short description`);
    assert.ok(p.type === 'string' || p.type === 'array', `${name}: text or a list`);
  }
  // It travels as JSON to Firecrawl, with the prompt.
  assert.deepEqual(JSON.parse(JSON.stringify(LISTING_EXTRACT_SCHEMA)), LISTING_EXTRACT_SCHEMA);
  assert.match(LISTING_EXTRACT_PROMPT, /exactly as the page shows it/);
  assert.match(LISTING_EXTRACT_PROMPT, /Never estimate, compute or infer/);
});

test('every scalar field of the schema is read: each yields a value or a warning naming it', () => {
  const props = LISTING_EXTRACT_SCHEMA.properties as Record<string, { type: string }>;
  const scalar = Object.entries(props).filter(([name, p]) => p.type === 'string' && !['address', 'unit', 'city', 'state', 'zip', 'neighborhood', 'url', 'status', 'building_name', 'description', 'interior_size_approximate'].includes(name)).map(([name]) => name);
  const junk = Object.fromEntries(scalar.map((name) => [name, 'xyzzy']));
  const { record, warnings } = compRecordFromListing({ address: '1 Test Street', city: 'New York', state: 'NY', status: 'Sold', ...junk }, { as_of: READ_ON, url: 'https://streeteasy.com/sale/1' });
  for (const name of scalar) {
    assert.ok(warnings.some((w) => w.column === name), `${name} was read (and refused)`);
  }
  // Only the property type reads junk as a value — "other", with a note, as the export does.
  assert.deepEqual(Object.keys(record.facts), ['property_type']);
});

test('a sold page: the same key as the export, every value inferred, the history oldest first', () => {
  const { record, warnings } = page('sold-200-chambers-10a', URL_CHAMBERS);
  assert.deepEqual(warnings, []);
  assert.equal(record.identity.key, KEY.chambers);
  assert.equal(record.identity.streeteasy!.url, 'https://streeteasy.com/building/200-chambers-street-new_york/10a');
  assert.deepEqual(record.status, { raw: 'Sold', evidence_class: 'sold', listing_status: 'sold' });
  assert.deepEqual(record.origin, { parser_version: record.origin!.parser_version, row: 1, as_of: READ_ON, via: 'listing' });
  // Every value the page gave waits for the agent.
  for (const [field, v] of Object.entries(record.facts)) {
    assert.deepEqual([v.source, v.confidence, v.as_of], ['listing', 'inferred', READ_ON], field);
  }
  const f = record.facts;
  assert.deepEqual(
    [f.sale_price!.value, f.list_price!.value, f.area_sqft!.value, f.floor!.value, f.beds!.value, f.baths!.value, f.rooms!.value, f.status_date!.value, f.days_on_market!.value],
    [4_650_000, 4_795_000, 2201, 10, 3, 3, 6, '2026-08-27', 24],
  );
  assert.deepEqual([f.common_charges_monthly!.value, f.taxes_monthly!.value, f.building_units!.value, f.building_stories!.value, f.year_built!.value], [2862, 2812, 256, 29, 2008]);
  // Fields the page left blank come from its own history, and say so.
  assert.deepEqual([f.original_list_price!.value, f.list_date!.value, f.contract_date!.value], [4_795_000, '2026-06-29', '2026-07-23']);
  assert.match(f.contract_date!.note!, /from the listing's history/);
  assert.deepEqual(record.listing!.history.map((e) => [e.date, e.kind, e.price]), [
    ['2026-06-29', 'listed', 4_795_000], ['2026-07-23', 'in_contract', null], ['2026-08-27', 'sold', 4_650_000],
  ]);
  assert.equal(record.listing!.confirmed, false);
  assert.equal(record.listing!.url, 'https://streeteasy.com/building/200-chambers-street-new_york/10a');
  // What a confirm makes each value: tags that are there exact, "none listed" approximate.
  assert.equal(record.listing!.on_confirm.views, 'exact');
  assert.equal(record.listing!.on_confirm.fireplace, 'approx');
  assert.equal(record.listing!.on_confirm.parking, 'approx');
  assert.equal(record.listing!.on_confirm.area_sqft, 'exact');
});

test("a comp added by link is the export's comp: one key, and once confirmed the same numbers", () => {
  const exported = hannah().comps.find((c) => c.identity.key === KEY.chambers)!;
  const linked = page('sold-200-chambers-10a', URL_CHAMBERS).record;
  assert.equal(linked.identity.key, exported.identity.key);
  assert.equal(linked.identity.building_key, exported.identity.building_key);
  assert.ok(sameUnit(linked.identity, exported.identity));
  const figures = (out: EngineOutput) => {
    const r = out.results.on_facts;
    return [r.evidence.sold.price_per_sqft!.mean.value, r.evidence.sold.price_per_sqft!.median.value, r.base?.value, r.range?.low.value, r.range?.high.value, r.sale_to_ask?.median.value];
  };
  const fromExport = compute(input());
  const fromLink = compute(input({ comps: swapped(KEY.chambers, confirmListingRecord(linked)) }));
  assert.deepEqual(figures(fromLink), figures(fromExport));
  assert.equal(Math.trunc(fromLink.results.on_facts.evidence.sold.price_per_sqft!.mean.value), 1906);
  const chambers = fromLink.comps.find((c) => c.id === KEY.chambers)!;
  assert.equal(chambers.per_result.on_facts.included, true);
  assert.equal(chambers.flags.unconfirmed, false);
});

test('until the agent confirms it, a link comp counts in neither result and says so once', () => {
  const linked = page('sold-200-chambers-10a', URL_CHAMBERS).record;
  const out = compute(input({ comps: swapped(KEY.chambers, linked) }));
  const chambers = out.comps.find((c) => c.id === KEY.chambers)!;
  assert.equal(chambers.flags.unconfirmed, true);
  for (const kind of ['on_facts', 'with_estimates'] as const) {
    assert.equal(chambers.per_result[kind].included, false);
    assert.deepEqual(chambers.per_result[kind].not_included_because, ['read from its StreetEasy page, and waits for the agent to confirm it']);
  }
  assert.equal(out.results.on_facts.evidence.sold.counts.included, 4);
  // One gap and one pending item for the row, not one per value — and no "missing" gaps for values that aren't missing.
  assert.deepEqual(out.gaps.filter((g) => g.target === KEY.chambers).map((g) => g.code), ['comp_unconfirmed']);
  const pending = out.pending_confirmation.filter((p) => p.target === KEY.chambers);
  assert.deepEqual(pending.map((p) => [p.kind, p.what]), [['listing', 'listing']]);
  assert.match(pending[0]!.note, /200 Chambers Street #10A: read from its StreetEasy page — confirm the row/);
});

test('confirming a row: exact, or approx where the page says so; suggestions stay pending; the input is untouched', () => {
  const read = page('sold-5-franklin-14a-approx-size', 'https://streeteasy.com/building/5-franklin-place-new_york/14a');
  assert.deepEqual(codes(read), ['approx_area']); // the export's code for the same thing
  assert.equal(read.record.flags.approx_area, true);
  const before = structuredClone(read.record);
  const confirmed = confirmListingRecord(read.record);
  assert.deepEqual(read.record, before);
  assert.equal(confirmed.listing!.confirmed, true);
  assert.equal(confirmed.facts.area_sqft!.confidence, 'approx');
  assert.equal(confirmed.facts.sale_price!.confidence, 'exact');
  assert.equal(confirmed.facts.fireplace!.confidence, 'approx'); // none listed
  assert.equal(confirmed.facts.outdoor_private!.confidence, 'exact'); // a balcony and a terrace are listed
  assert.equal(confirmListingRecord(confirmed), confirmed); // idempotent
  // Its $/sqft is the export's, approximate like the export's.
  const out = compute(input({ comps: swapped(KEY.franklin, confirmed) }));
  const exported = compute(input()).comps.find((c) => c.id === KEY.franklin)!.per_result.on_facts.price_per_sqft!;
  const linked = out.comps.find((c) => c.id === KEY.franklin)!.per_result.on_facts.price_per_sqft!;
  assert.deepEqual([linked.value, linked.confidence], [exported.value, 'approx']);
  // A penthouse guessed from a "PH" label is a guess beyond the page: confirming the row doesn't confirm it.
  const ph = compRecordFromListing({ address: '77 Reade Street', unit: 'PHA', city: 'New York', state: 'NY', status: 'For sale', features: ['Terrace'] }, { as_of: READ_ON, url: 'https://streeteasy.com/sale/9' }).record;
  const phConfirmed = confirmListingRecord(ph);
  assert.equal(phConfirmed.suggestions![0]!.value.confidence, 'inferred');
  assert.equal(phConfirmed.facts.unit_type!.confidence, 'approx');
  // An export record has nothing to confirm.
  const exportRecord = hannah().comps[0]!;
  assert.equal(confirmListingRecord(exportRecord), exportRecord);
});

test('an in-contract page: the contract date is its status date', () => {
  const { record, warnings } = page('in-contract-111-fulton-315', 'https://streeteasy.com/building/111-fulton-street-new_york/315');
  assert.deepEqual(warnings, []);
  assert.deepEqual([record.status.evidence_class, record.status.listing_status], ['in_contract', 'in_contract']);
  const f = record.facts;
  assert.deepEqual([f.status_date!.value, f.contract_date!.value, f.list_date!.value], ['2026-07-12', '2026-07-12', '2026-06-01']);
  assert.deepEqual([f.list_price!.value, f.original_list_price!.value, f.days_on_market!.value], [715_000, 735_000, 41]);
  assert.equal(f.sale_price, undefined);
  // A doorman of unstated hours and no concierge: service rests partly on a missing tag.
  assert.equal(record.listing!.on_confirm.service, 'approx');
});

test("an active page: the city and state come from the link's slug when the page doesn't give them", () => {
  const { record, warnings } = page('active-20-pine-617', 'https://streeteasy.com/building/20-pine-street-new_york/617');
  assert.deepEqual(warnings, []);
  assert.equal(record.identity.key, 'pk1|ny|new york|20 pine st|617');
  assert.deepEqual([record.status.evidence_class, record.facts.status_date!.value, record.facts.list_date!.value], ['active', '2026-06-30', '2026-06-30']);
  assert.equal(record.facts.floor!.value, 6); // "6th floor"
  assert.equal(record.facts.property_type!.value, 'condo'); // "Condo in Financial District"
  assert.equal(record.facts.laundry!.value, 'none_listed');
  assert.equal(record.listing!.on_confirm.laundry, 'approx');
  // Without a city, state or a slug to read them from, the key can't match an export's — and it says so.
  const bare = compRecordFromListing({ address: '20 Pine Street', unit: '#617', status: 'For sale' }, { as_of: READ_ON, url: 'https://streeteasy.com/sale/1780000' });
  assert.equal(bare.record.identity.key, 'pk1|||20 pine st|617');
  assert.deepEqual(codes(bare), ['partial_address']);
});

test('an off-market page is "didn\'t sell": its own evidence status, on ask basis', () => {
  const { record, warnings } = page('off-market-111-fulton-309', 'https://streeteasy.com/building/111-fulton-street-new_york/309');
  assert.deepEqual(codes({ warnings }), ['off_market']);
  assert.deepEqual(record.status, { raw: 'No longer available', evidence_class: 'off_market', listing_status: 'off_market' });
  // Its status date is the day it came off; its ask and listing date stay.
  assert.deepEqual([record.facts.status_date!.value, record.facts.list_date!.value, record.facts.list_price!.value], ['2026-03-02', '2025-12-04', 625_000]);
  assert.equal(record.facts.maintenance_monthly!.value, 1242);
  const out = compute(input({ comps: [...comps(), { id: record.identity.key!, record: confirmListingRecord(record), tier: 'primary' }] }));
  const c = out.comps.find((x) => x.id === record.identity.key)!;
  assert.deepEqual([c.evidence_class, c.basis, c.flags.off_market, c.flags.unrecognised_status], ['off_market', 'ask', true, false]);
  assert.ok(!out.warnings.some((w) => w.code === 'unrecognised_status' && w.comp_ids.includes(c.id)));
  // Co-op against a condo report: like for like still applies — the only reason it's out — and the check says so.
  assert.deepEqual(c.per_result.on_facts.not_included_because, ['a co-op, and this is a condo report — like for like only']);
  assert.ok(c.checks.some((k) => k.code === 'property_type_differs' && k.suggested_tier === 'excluded'));
  assert.equal(out.results.on_facts.evidence.off_market.counts.total, 1);
  assert.equal(out.results.on_facts.evidence.off_market.counts.included, 0);
});

test('junk from a misread page is refused field by field, the way the export refuses it, and nothing stops', () => {
  const { record, warnings } = page('junk-values', 'https://streeteasy.com/sale/1234567');
  const byColumn = new Map(warnings.map((w) => [w.column, w.code]));
  for (const column of ['interior_size', 'beds', 'rooms', 'floor', 'common_charges', 'building_units', 'year_built', 'new_development', 'sale_price', 'sale_date', 'history']) {
    assert.equal(byColumn.get(column), 'unreadable_value', column);
  }
  assert.equal(byColumn.get('last_ask'), 'zero_price');
  assert.equal(byColumn.get('property_type'), 'value_adjusted');
  // Blank markers ("n/a", "—") are blanks, not junk.
  assert.ok(!byColumn.has('days_on_market') && !byColumn.has('baths'));
  // What could be read was: the sale price from its history, the tags from a string and a messy list.
  assert.equal(record.facts.sale_price!.value, 620_000);
  assert.equal(record.facts.status_date, undefined); // the history's date was junk
  assert.deepEqual([record.facts.central_air!.value, record.facts.dishwasher!.value], [true, true]);
  assert.deepEqual(record.tags.amenities, ['Gym']);
  assert.equal(record.listing!.description, null);
  for (const [field, v] of Object.entries(record.facts)) assert.equal(v.confidence, 'inferred', field);
});

test("the status: the page's label, its history, and what doesn't fit", () => {
  const read = (extract: Record<string, unknown>, url = 'https://streeteasy.com/sale/1') =>
    compRecordFromListing({ address: '1 Test Street', city: 'New York', state: 'NY', ...extract }, { as_of: READ_ON, url });
  // No label: the history settles it.
  const history = [{ date: '1/5/2026', event: 'Listed', price: '$900,000' }, { date: '3/1/2026', event: 'In contract', price: '' }];
  const fromHistory = read({ history });
  assert.deepEqual([fromHistory.record.status.evidence_class, fromHistory.record.status.raw], ['in_contract', "(from the listing's history) in contract"]);
  assert.deepEqual(codes(fromHistory), []);
  // A recorded sale beats an off-market label, and says so.
  const conflict = read({ status: 'Off market', sale_price: '$880,000', history: [...history, { date: '4/20/2026', event: 'Sold', price: '$880,000' }] });
  assert.deepEqual([conflict.record.status.evidence_class, codes(conflict)], ['sold', ['status_conflict']]);
  assert.equal(conflict.record.facts.sale_price!.value, 880_000);
  // A relisting starts again: an old sale doesn't make it sold.
  const relisted = read({ history: [{ date: '1/1/2019', event: 'Sold', price: '$700,000' }, { date: '5/1/2026', event: 'Listed', price: '$950,000' }] });
  assert.equal(relisted.record.status.listing_status, 'active');
  assert.equal(relisted.record.facts.original_list_price!.value, 950_000);
  // A new price changes the ask, not the listing period; "Listing updated" starts nothing; "never sold" isn't a sale.
  const repriced = read({ history: [
    { date: '1/5/2026', event: 'Listed', price: '$900,000' }, { date: '2/1/2026', event: 'New price', price: '$875,000' },
    { date: '2/9/2026', event: 'Listing updated', price: '' },
  ] });
  assert.deepEqual([repriced.record.facts.original_list_price!.value, repriced.record.facts.list_date!.value, repriced.record.facts.list_price!.value], [900_000, '2026-01-05', 875_000]);
  assert.deepEqual(repriced.record.listing!.history.map((e) => e.kind), ['listed', 'price_change', 'other']);
  assert.equal(read({ status: 'Off market, never sold' }).record.status.listing_status, 'off_market');
  assert.equal(read({ status: 'New' }).record.status.listing_status, 'active');
  // A sale price on a page that isn't sold is an earlier sale: left out.
  const earlier = read({ status: 'For sale', last_ask: '$950,000', sale_price: '$700,000' });
  assert.equal(earlier.record.facts.sale_price, undefined);
  assert.deepEqual(codes(earlier), ['value_adjusted']);
  // A rental; a label nothing can read; no link; a building page; a public-record closing.
  assert.deepEqual(codes(read({ status: 'For rent' })), ['rental_listing']);
  const unknown = read({ status: 'Coming soon' });
  assert.deepEqual([unknown.record.status.evidence_class, codes(unknown)], [null, ['unrecognised_status']]);
  assert.deepEqual(codes(compRecordFromListing({ address: '1 Test Street', city: 'New York', state: 'NY', status: 'Sold' }, { as_of: READ_ON })), ['not_a_listing']);
  assert.deepEqual(codes(read({ status: 'Sold' }, 'https://streeteasy.com/building/1-test-street-new_york')), ['not_a_listing']);
  const closing = read({ status: 'Sold' }, 'https://streeteasy.com/closing/11324235');
  assert.deepEqual([closing.record.flags.closing_record, codes(closing)], [true, ['closing_record']]);
  // The address field may carry the whole line; it isn't doubled.
  const full = compRecordFromListing({ address: '200 Chambers Street, New York, NY 10007', unit: '10A', city: 'New York', state: 'NY', status: 'Sold' }, { as_of: READ_ON, url: URL_CHAMBERS });
  assert.equal(full.record.identity.key, KEY.chambers);
  assert.deepEqual(codes(compRecordFromListing({ status: 'Sold' }, { as_of: READ_ON, url: 'https://streeteasy.com/sale/2' })), ['missing_address']);
});

test('what a listing reader refuses outright', () => {
  assert.throws(() => compRecordFromListing(null, { as_of: READ_ON }), ParseError);
  assert.throws(() => compRecordFromListing(['a'], { as_of: READ_ON }), ParseError);
  assert.throws(() => compRecordFromListing({}, { as_of: '9/29/2026' }), ParseError);
});

test("a typed-in comp is the agent's record: exact unless marked an estimate, and one key with the export", () => {
  const { record, warnings } = compRecordFromManual({
    address: '200 Chambers Street, New York, NY', unit: '#10A', status: 'sold',
    price: '$4,650,000', date: '8/27/2026', area_sqft: '2,201 ft²', floor: 10, beds: 3, baths: 3,
  }, { as_of: READ_ON });
  assert.deepEqual(warnings, []);
  assert.equal(record.identity.key, KEY.chambers);
  assert.deepEqual(record.origin, { parser_version: record.origin!.parser_version, row: 1, as_of: READ_ON, via: 'manual' });
  assert.equal(record.listing, undefined);
  for (const [field, v] of Object.entries(record.facts)) assert.deepEqual([v.source, v.confidence], ['agent', 'exact'], field);
  // Hannah's figures come out the same with it in place of the export's row.
  const figures = (out: EngineOutput) => [out.results.on_facts.evidence.sold.price_per_sqft!.mean.value, out.results.on_facts.base?.value];
  assert.deepEqual(figures(compute(input({ comps: swapped(KEY.chambers, record) }))), figures(compute(input())));
  // An estimate lands in "with estimates" only.
  const guessed = compRecordFromManual({ address: '1 Test Street, New York, NY', status: 'sold', price: { value: 1_000_000, estimate: true }, area_sqft: 800 }, { as_of: READ_ON });
  assert.equal(guessed.record.facts.sale_price!.confidence, 'guesstimate');
  assert.equal(guessed.record.facts.area_sqft!.confidence, 'exact');
  // In contract, the date is the contract date too; active, the listing date.
  const inContract = compRecordFromManual({ address: '1 Test Street, New York, NY', status: 'in_contract', price: 900_000, date: 'Mar 1, 2026' }, { as_of: READ_ON }).record;
  assert.deepEqual([inContract.facts.list_price!.value, inContract.facts.status_date!.value, inContract.facts.contract_date!.value], [900_000, '2026-03-01', '2026-03-01']);
  // Didn't sell: its own evidence status, its price the last ask — the same as from a link.
  const offMarket = compRecordFromManual({ address: '1 Test Street, New York, NY', status: 'off_market', price: 625_000 }, { as_of: READ_ON });
  assert.deepEqual([offMarket.record.status.evidence_class, offMarket.record.status.listing_status, codes(offMarket)], ['off_market', 'off_market', ['off_market']]);
  assert.equal(offMarket.record.facts.list_price!.value, 625_000);
  // Junk is refused field by field; no address means no key.
  const junk = compRecordFromManual({ address: '', status: 'active', price: 'soon', area_sqft: 0, floor: 'PH' }, { as_of: READ_ON });
  assert.deepEqual(codes(junk).sort(), ['missing_address', 'unreadable_value', 'unreadable_value', 'unreadable_value']);
  assert.equal(junk.record.identity.key, null);
  assert.throws(() => compRecordFromManual({ address: '1 Test Street', status: 'pending' as never }, { as_of: READ_ON }), ParseError);
  assert.throws(() => compRecordFromManual({ address: '1 Test Street', status: 'sold' }, { as_of: 'today' }), ParseError);
});
