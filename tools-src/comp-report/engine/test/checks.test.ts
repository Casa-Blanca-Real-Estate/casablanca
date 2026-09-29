// The mentors' comparability checks (§6.10, CR-2.2 phase 2): Kara's rules as
// flags on each comp, with a suggested tier and the facts behind it — never a
// tier change, never a moved number. Also the two rules they lean on: a floor
// read from a unit label like "10A" (inferred), and a sale dated by its
// contract where a listing's history gives one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compRecordFromListing, compRecordFromManual, compute, confirmListingRecord, floorFromUnitLabel, loadHouseMethod,
  HouseMethodError, type CompCheck, type CompInput, type CompOut, type CompRecord, type EngineOutput, type PropertyFacts,
} from '../index.ts';
import { distanceMiles } from '../compute/checks.ts';
import production from '../house-method/production.json' with { type: 'json' };
import { agentFact, comps, fixtureText, hannah, input, KEY, subjectFacts, SUBJECT_IDENTITY } from './helpers.ts';

const READ_ON = '2026-09-29';

const comp = (out: EngineOutput, id: string): CompOut => out.comps.find((c) => c.id === id)!;
const flags = (c: CompOut): string[] => c.checks.filter((k) => k.status === 'flagged').map((k) => k.code);
const check = (c: CompOut, code: CompCheck['code']): CompCheck | undefined => c.checks.find((k) => k.code === code);

/** A comp typed in, with any further facts the agent gave. */
function typed(id: string, fields: Parameters<typeof compRecordFromManual>[0], extra: Partial<PropertyFacts> = {}, tier: CompInput['tier'] = 'primary'): CompInput {
  const { record } = compRecordFromManual(fields, { as_of: READ_ON });
  return { id, record: { ...record, facts: { ...record.facts, ...extra } }, tier };
}

test("Hannah's comps: first floors, the one same-building comp, a size far off, floors far off, an old contract", () => {
  const out = compute(input());
  assert.deepEqual(flags(comp(out, KEY.hudson)), ['first_floor']);
  assert.deepEqual(flags(comp(out, KEY.laight)), ['first_floor', 'size_far_off']);
  assert.deepEqual(flags(comp(out, KEY.barclay11f)), ['same_building', 'floor_far_off']);
  assert.deepEqual(flags(comp(out, KEY.franklin)), []); // floor 14 against 17: inside the band of 3
  assert.deepEqual(flags(comp(out, KEY.moore)), ['sale_age', 'floor_far_off']);

  const first = check(comp(out, KEY.hudson), 'first_floor')!;
  assert.equal(first.message, 'First floor: a different product — the home is on floor 17');
  assert.deepEqual([first.suggested_tier, first.suggestion, first.confidence], ['excluded', 'Excluded, unless nothing else', 'exact']);
  assert.deepEqual(first.evidence.map((e) => [e.side, e.field, e.value, e.source]), [['comp', 'floor', 1, 'se_export'], ['subject', 'floor', 17, 'agent']]);

  const same = check(comp(out, KEY.barclay11f), 'same_building')!;
  assert.deepEqual([same.label, same.suggested_tier, same.suggestion], ['Same building', 'primary', 'Primary — and a candidate for the closest comp']);

  const size = check(comp(out, KEY.laight), 'size_far_off')!;
  assert.equal(size.message, '50% bigger than the home (3000 sq ft against 2000): more than about 25% either way');
  assert.deepEqual([size.suggested_tier, size.measured, size.threshold], ['secondary', { value: 50, unit: 'percent' },
    { name: 'size_percent', value: 25, unit: 'percent', basis: "Kara's rule, pending Noble" }]);

  const floor = check(comp(out, KEY.chambers), 'floor_far_off')!;
  assert.equal(floor.message, '7 floors lower than the home (floor 10 against 17): beyond its floor band of 3 floors either way');
  assert.deepEqual([floor.suggested_tier, floor.measured, floor.threshold!.basis], ['secondary', { value: -7, unit: 'floors' }, "Frankie's band (floors 2–8 around a 5th-floor home), pending Noble"]);
  // A first floor is flagged as that, not as a floor far off too.
  assert.ok(!flags(comp(out, KEY.hudson)).includes('floor_far_off'));

  const age = check(comp(out, KEY.moore), 'sale_age')!;
  assert.equal(age.message, 'Went into contract 2026-04-13, over 3 months ago: noted');
  assert.deepEqual([age.label, age.suggested_tier, age.measured], ['In contract over 3 months ago', null, { value: 5, unit: 'months' }]);

  // Distance needs coordinates, which neither the export nor a page gives — and every comp says so.
  for (const c of out.comps) {
    const d = check(c, 'distance')!;
    assert.deepEqual([d.status, d.suggested_tier], ['unknown', null], c.id);
    assert.match(d.message, /^Distance can't be checked yet: it needs coordinates for the home and the comp/);
  }
});

test('a check never changes a tier or moves a number: other thresholds change the flags and nothing else', () => {
  const base = compute(input());
  const loose = structuredClone(production) as Record<string, any>;
  loose['check_thresholds'].size_percent.value = 60;
  loose['check_thresholds'].floor_band_floors.value = 20;
  const out = compute(input(), { houseMethod: loadHouseMethod(loose) });
  assert.ok(!flags(comp(out, KEY.laight)).includes('size_far_off'));
  assert.ok(!out.comps.some((c) => flags(c).includes('floor_far_off')));
  // Every tier is the agent's, and every figure is the same.
  for (const c of out.comps) assert.equal(c.tier, input().comps.find((x) => x.id === c.id)!.tier);
  const strip = (o: EngineOutput) => JSON.stringify({ results: o.results, headline: o.headline_facts, gaps: o.gaps, warnings: o.warnings });
  assert.equal(strip(out).replaceAll(loadHouseMethod(loose).hash, ''), strip(base).replaceAll(base.meta.house_method.hash, ''));
  // Flagged Excluded, a primary comp stays primary and in the numbers.
  const hudson = comp(base, KEY.hudson);
  assert.equal(check(hudson, 'first_floor')!.suggested_tier, 'excluded');
  assert.deepEqual([hudson.tier, hudson.per_result.on_facts.included], ['primary', true]);
});

test("the check thresholds are the house method's: the mentors' defaults, no sign-off, and refused when malformed", () => {
  const hm = loadHouseMethod(production);
  assert.deepEqual([hm.all_null, hm.approval], [true, null]);
  const bad = (mutate: (t: Record<string, any>) => void, issue: RegExp) => {
    const raw = structuredClone(production) as Record<string, any>;
    mutate(raw['check_thresholds']);
    assert.throws(() => loadHouseMethod(raw), (e: unknown) => e instanceof HouseMethodError && e.issues.some((i) => issue.test(i)));
  };
  bad((t) => { t.sale_age_months.old = 2; }, /noted < old < market_moved/);
  bad((t) => { t.sale_age_months.noted = 2.5; }, /sale_age_months.noted must be a whole number/);
  bad((t) => { t.size_percent.value = -5; }, /size_percent.value must be a number above zero/);
  bad((t) => { t.distance_miles.far = 0.1; }, /noted < far/);
  bad((t) => { delete t.floor_band_floors.basis; }, /floor_band_floors.basis must say whose rule it is/);
  bad((t) => { t.walk_score = { value: 80, basis: 'no one' }; }, /walk_score is not a check threshold/);
  bad((t) => { delete t.distance_miles; }, /distance_miles is missing/);
});

test('private outdoor space on one side only: never compare — weaker when the lack is only an untagged listing', () => {
  const terrace = typed('terrace', { address: '1 Test Street, New York, NY', unit: '#9A', status: 'sold', price: 2_000_000, date: '9/1/2026', area_sqft: 1000, floor: 9 },
    { outdoor_private: agentFact(true), outdoor_kinds: agentFact(['terrace']) });
  const out = compute(input({ subject: { identity: SUBJECT_IDENTITY, facts: subjectFacts({ outdoor_private: agentFact(false) }) }, comps: [terrace] }));
  const k = check(comp(out, 'terrace'), 'private_outdoor_one_side')!;
  assert.deepEqual([k.label, k.message, k.suggested_tier, k.confidence], ['Has private outdoor space', "Has private outdoor space; the home doesn't", 'excluded', 'exact']);
  // The reverse, where the comp's lack rests on its listing naming none: approximate, and it says so.
  const hannahOut = compute(input({ subject: { identity: SUBJECT_IDENTITY, facts: subjectFacts({ outdoor_private: agentFact(true) }) } }));
  const r = check(comp(hannahOut, KEY.chambers), 'private_outdoor_one_side')!;
  assert.equal(r.message, 'No private outdoor space; the home has it (none is listed for it — weak evidence)');
  assert.equal(r.confidence, 'approx');
  assert.equal(check(comp(hannahOut, KEY.franklin), 'private_outdoor_one_side'), undefined); // it has a terrace too
});

test('new development, HDFC, co-op against condo and a sponsor sale', () => {
  const at = (unit: string, extra: Partial<PropertyFacts>, fields: Partial<Parameters<typeof compRecordFromManual>[0]> = {}) =>
    typed(unit, { address: '2 Test Street, New York, NY', unit, status: 'sold', price: 1_000_000, date: '9/1/2026', area_sqft: 1000, floor: 16, ...fields }, extra);
  const comps = [
    at('#16A', { new_development: agentFact(true) }),
    at('#16B', { income_restricted: agentFact(true) }),
    at('#16C', {}, { property_type: 'Co-op' }),
    at('#16D', { sponsor_unit: agentFact(true) }),
  ];
  const out = compute(input({ comps }));
  const nd = check(comp(out, '#16A'), 'new_development_vs_resale')!;
  // A resale page never says "resale", so the home reads as unmarked, and the flag as approximate.
  assert.deepEqual([nd.message, nd.suggested_tier, nd.confidence], ["New development; the home isn't marked as one", 'excluded', 'approx']);
  const resale = compute(input({ comps, subject: { identity: SUBJECT_IDENTITY, facts: subjectFacts({ new_development: agentFact(false) }) } }));
  assert.deepEqual([check(comp(resale, '#16A'), 'new_development_vs_resale')!.message, check(comp(resale, '#16A'), 'new_development_vs_resale')!.confidence],
    ['New development; the home is a resale', 'exact']);
  assert.deepEqual([check(comp(out, '#16B'), 'income_restricted')!.label, check(comp(out, '#16B'), 'income_restricted')!.suggested_tier], ['HDFC or income-restricted', 'excluded']);
  const coop = check(comp(out, '#16C'), 'property_type_differs')!;
  assert.deepEqual([coop.label, coop.message, coop.suggested_tier], ['Co-op', 'A co-op; the home is a condo — like for like only', 'excluded']);
  const sponsor = check(comp(out, '#16D'), 'sponsor_unit')!;
  assert.deepEqual([sponsor.message, sponsor.suggested_tier, sponsor.suggestion], ['Sponsor sale: often sells higher (no board package)', 'secondary', 'Secondary — context, with the note (Kara)']);
  // A new-development home against resale comps: every unmarked comp is flagged for the agent to check.
  const newDev = compute(input({ comps: [at('#16E', {})], subject: { identity: SUBJECT_IDENTITY, facts: subjectFacts({ new_development: agentFact(true) }) } }));
  assert.equal(check(comp(newDev, '#16E'), 'new_development_vs_resale')!.message, 'Not marked as a new development; the home is one');
});

test("a sale's age: past 3 months noted, past 6 old for a comp, past 12 the market has moved — from the contract date where there is one", () => {
  const sold = (unit: string, date: string, extra: Partial<PropertyFacts> = {}) =>
    typed(unit, { address: '3 Test Street, New York, NY', unit, status: 'sold', price: 1_000_000, date, area_sqft: 1000, floor: 17 }, extra);
  const out = compute(input({
    comps: [
      sold('#17A', '8/1/2026'),
      sold('#17B', '5/1/2026'),
      sold('#17C', '2/1/2026'),
      sold('#17D', '8/1/2025'),
      // Closed in August, but the price was agreed in March.
      sold('#17E', '8/15/2026', { contract_date: agentFact('2026-03-10') }),
    ],
  }));
  assert.equal(check(comp(out, '#17A'), 'sale_age'), undefined);
  const noted = check(comp(out, '#17B'), 'sale_age')!;
  assert.deepEqual([noted.message, noted.suggested_tier], ['Sold 2026-05-01, over 3 months ago: noted', null]);
  const old = check(comp(out, '#17C'), 'sale_age')!;
  assert.deepEqual([old.message, old.suggested_tier, old.suggestion], ['Sold 2026-02-01, over 6 months ago: old for a comp', 'secondary', 'Secondary — context past 6 months (Kara)']);
  const moved = check(comp(out, '#17D'), 'sale_age')!;
  assert.deepEqual([moved.message, moved.threshold!.name, moved.measured], ['Sold 2025-08-01, over 12 months ago: the market has moved', 'sale_age_months.market_moved', { value: 13, unit: 'months' }]);
  const contract = check(comp(out, '#17E'), 'sale_age')!;
  assert.equal(contract.message, 'Went into contract 2026-03-10 (closed 2026-08-15), over 6 months ago: old for a comp');
  assert.deepEqual(comp(out, '#17E').market_date, { date: '2026-03-10', basis: 'contract_date', age_days: 198 });
  assert.deepEqual(comp(out, '#17A').market_date, { date: '2026-08-01', basis: 'closing_date', age_days: 54 });
  // An active listing's ask is current evidence: no age flag, however long it has been listed.
  assert.equal(check(comp(compute(input()), KEY.reade), 'sale_age'), undefined);
});

test('distance, once there are coordinates: past a quarter mile noted, past half a mile far for Manhattan', () => {
  // A degree of latitude is 69.094 miles on a sphere of radius 3,958.8.
  assert.ok(Math.abs(distanceMiles({ lat: 40, lng: -74 }, { lat: 41, lng: -74 }) - 69.0941) < 0.0001);
  // A degree of longitude shrinks with the cosine of the latitude: cos 40.7° = 0.758134.
  assert.ok(Math.abs(distanceMiles({ lat: 40.7, lng: -74 }, { lat: 40.7, lng: -73 }) / 69.0941 - 0.758134) < 0.000001);
  const home = { lat: 40.7135, lng: -74.0107 };
  const at = (unit: string, lat: number) => typed(unit, { address: '4 Test Street, New York, NY', unit, status: 'sold', price: 2_000_000, date: '9/1/2026', area_sqft: 1000, floor: 17 },
    { coordinates: agentFact({ lat, lng: home.lng }) });
  const out = compute(input({
    subject: { identity: SUBJECT_IDENTITY, facts: subjectFacts({ coordinates: agentFact(home) }) },
    comps: [at('#1', home.lat + 0.002), at('#2', home.lat + 0.004), at('#3', home.lat + 0.009)],
  }));
  assert.equal(check(comp(out, '#1'), 'distance'), undefined); // 0.14 miles
  const noted = check(comp(out, '#2'), 'distance')!;
  assert.deepEqual([noted.status, noted.label, noted.suggested_tier], ['flagged', '0.28 miles away', null]);
  assert.equal(noted.message, 'Over 0.25 miles away (0.28): noted');
  const far = check(comp(out, '#3'), 'distance')!;
  assert.deepEqual([far.message, far.suggested_tier, far.threshold!.basis], ['Over 0.5 miles away (0.62): far for Manhattan', 'secondary', "Kara's rule, pending Noble"]);
  assert.ok(Math.abs(far.measured!.value - 0.009 * 69.0941) < 0.0001);
});

test('a floor from the unit label: only where it reads cleanly, inferred, pending — and a "1A" raises the first-floor check', () => {
  const cases: [string | null, number | null][] = [
    ['10A', 10], ['#10A', 10], ['1004', 10], ['504', 5], ['1A', 1], ['#5B', 5], ['Apt 7G', 7], ['10-B', 10], ['35AB', 35],
    ['PHA', null], ['PH2', null], ['G', null], ['R1', null], ['A', null], ['12', null], ['0A', null], ['12345', null], ['', null], [null, null],
  ];
  for (const [label, floor] of cases) assert.equal(floorFromUnitLabel(label), floor, String(label));

  // The export: 101 Leonard #5B has no floor, so "5B" suggests floor 5 — pending, and in neither result.
  const leonard = hannah().comps.find((c) => c.identity.key === KEY.leonard101)!;
  assert.deepEqual(leonard.suggestions, [{
    field: 'floor', value: { value: 5, source: 'se_export', as_of: '2026-09-23', confidence: 'inferred', note: 'from the unit label #5B — confirm the floor' },
  }]);
  assert.equal(hannah().comps.find((c) => c.identity.key === KEY.chambers)!.suggestions, undefined); // it has a floor
  const out = compute(input());
  const c = comp(out, KEY.leonard101);
  assert.equal(c.flags.floor_missing, true);
  assert.ok(out.pending_confirmation.some((p) => p.target === KEY.leonard101 && p.what === 'floor' && p.value === 5));
  // The check still runs on it, and says what it rests on.
  const far = check(c, 'floor_far_off')!;
  assert.equal(far.confidence, 'inferred');
  assert.match(far.message, /\(its floor is inferred: from the unit label #5B — confirm the floor\)$/);

  // A typed-in "1A" with no floor: the first-floor check, with the same inferred note.
  const oneA = typed('oneA', { address: '5 Test Street, New York, NY', unit: '1A', status: 'sold', price: 1_500_000, date: '9/1/2026', area_sqft: 1000 });
  assert.equal(oneA.record.suggestions![0]!.value.value, 1);
  const first = check(comp(compute(input({ comps: [oneA] })), 'oneA'), 'first_floor')!;
  assert.equal(first.message, 'First floor: a different product — the home is on floor 17 (its floor is inferred: from the unit label 1A — confirm the floor)');
  assert.equal(first.confidence, 'inferred');

  // A page without a floor gets the same suggestion; confirming the row leaves it pending.
  const extract = JSON.parse(fixtureText('listings/sold-200-chambers-10a.json'));
  const { record } = compRecordFromListing({ ...extract, floor: '' }, { as_of: READ_ON, url: null });
  assert.deepEqual(record.suggestions!.map((s) => [s.field, s.value.value, s.value.source, s.value.confidence]), [['floor', 10, 'listing', 'inferred']]);
  assert.equal(confirmListingRecord(record).suggestions![0]!.value.confidence, 'inferred');
});

test('a check reads what waits for the confirm: an unconfirmed link row is flagged as it lands', () => {
  const { record } = compRecordFromListing(JSON.parse(fixtureText('listings/sold-200-chambers-10a.json')), { as_of: READ_ON, url: null });
  const out = compute(input({ comps: [{ id: 'link', record, tier: 'primary' }] }));
  const c = comp(out, 'link');
  assert.equal(c.flags.unconfirmed, true);
  assert.equal(c.per_result.on_facts.included, false);
  const far = check(c, 'floor_far_off')!;
  assert.equal(far.confidence, 'inferred');
  assert.match(far.message, /\(its floor is inferred: /);
});

test('recency by the contract date where a listing gives one: a sale agreed before the window is out of it, and says which date', () => {
  const link = confirmListingRecord(compRecordFromListing(JSON.parse(fixtureText('listings/sold-200-chambers-10a.json')), { as_of: READ_ON, url: null }).record);
  const swapped: CompInput[] = comps().map((c) => (c.id === KEY.chambers ? { ...c, record: link as CompRecord } : c));
  const method = { recency: { since: '2026-08-01' } };
  const exported = comp(compute(input({ method })), KEY.chambers);
  assert.equal(exported.per_result.on_facts.included, true); // closed 2026-08-27: inside
  assert.deepEqual(exported.market_date, { date: '2026-08-27', basis: 'closing_date', age_days: 28 });
  const linked = comp(compute(input({ comps: swapped, method })), KEY.chambers);
  assert.deepEqual(linked.per_result.on_facts.not_included_because, ['went into contract 2026-07-23 (closed 2026-08-27), before the recency window opens (2026-08-01)']);
  assert.deepEqual(linked.market_date, { date: '2026-07-23', basis: 'contract_date', age_days: 63 });
  // The market-movement comparison runs from the contract date too.
  const recency = comp(compute(input({ comps: swapped })), KEY.chambers).per_result.on_facts.comparisons.find((x) => x.line === 'recency_market')!;
  assert.equal(recency.basis, 'went into contract 2026-07-23 (closed 2026-08-27), 63 days before 2026-09-24');
});
