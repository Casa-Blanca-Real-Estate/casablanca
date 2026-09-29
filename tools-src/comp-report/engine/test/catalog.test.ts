// The adjustment catalog is Appendix A (v0.4), all 39 factors, and the
// interaction map is A.5 — structure only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTORS, FACTOR_BY_ID, INTERACTIONS, interactionPairs, magnitudeKeys } from '../index.ts';

// In Appendix A's order: 37–39 sit with their group, after 32.
const APPENDIX_A: [number, string][] = [
  [1, 'Interior size'], [2, 'Bedrooms and bathrooms'], [3, 'Layout and efficiency'], [4, 'Floor'], [5, 'Exposure and light'],
  [6, 'Views'], [7, 'Outdoor space'], [8, 'Condition'], [9, 'Finishes and systems'], [10, 'Ceiling height and volume'],
  [11, 'Unit type'], [12, 'Noise and street position'], [13, 'Private storage and extras'], [14, 'Service level'],
  [15, 'Amenities'], [16, 'Building era and type'], [17, 'Building size'], [18, 'Sponsor and new-development sales'],
  [19, 'Carrying costs'], [20, 'Tax exemptions and abatements'], [21, 'Building financials'], [22, 'Policies'],
  [23, 'Parking'], [24, 'Ground lease'], [25, 'Micro-location'], [26, 'Distance from subject'], [27, 'School zone'],
  [28, 'Recency and market movement'], [29, 'Sale conditions'], [30, 'Concessions and credits'], [31, 'Combination units'],
  [32, 'Evidence status'], [37, 'Financing terms'], [38, 'Tenant in place'], [39, 'Non-realty items'],
  [33, 'Air and development rights'], [34, 'Lot size, width and frontage'], [35, 'Legal use and certificate of occupancy'],
  [36, 'Rental income and yield'],
];

test('all 39 factors, numbered and named as in Appendix A v0.4', () => {
  assert.equal(FACTORS.length, 39);
  assert.deepEqual(FACTORS.map((f) => [f.number, f.name]), APPENDIX_A);
  // Numbers are identifiers: each of 1–39 exactly once, none renumbered.
  assert.deepEqual(FACTORS.map((f) => f.number).sort((a, b) => a - b), Array.from({ length: 39 }, (_, i) => i + 1));
  assert.equal(new Set(FACTORS.map((f) => f.id)).size, 39);
  const groups = FACTORS.map((f) => f.group);
  assert.deepEqual([groups.indexOf('building'), groups.indexOf('location'), groups.indexOf('transaction_market'), groups.indexOf('later')], [13, 24, 27, 35]);
  assert.deepEqual(FACTORS.filter((f) => f.number >= 37).map((f) => [f.id, f.group, f.role, f.comparison]), [
    ['financing_terms', 'transaction_market', 'adjustment', 'assessment'],
    ['tenant_in_place', 'transaction_market', 'adjustment', 'assessment'],
    ['non_realty_items', 'transaction_market', 'adjustment', 'assessment'],
  ]);
  for (const f of FACTORS) {
    assert.ok(f.captures.length > 0 && f.data_sources.length > 0 && f.applies_to.length > 0, f.id);
  }
});

test("v0.4's definitions: floor against its neighbours, the finishes split, tax exemptions", () => {
  const lines = (id: string) => FACTOR_BY_ID.get(id)!.lines.map((l) => [l.facet, l.name, l.magnitude.shape]);
  assert.deepEqual(lines('floor'), [[null, 'Floor', 'per_unit'], ['neighbours', 'Height against neighbouring buildings', 'by_degree']]);
  assert.deepEqual(lines('finishes_systems'), [
    ['quality', 'Kitchen and bath quality', 'by_degree'], ['central_air', 'Central air', 'by_degree'],
    ['dishwasher', 'Dishwasher', 'by_degree'], ['en_suite', 'En-suite bathrooms', 'by_degree'],
    ['fireplace', 'Fireplace', 'by_degree'], ['laundry', 'In-unit laundry', 'by_degree'],
  ]);
  assert.match(FACTOR_BY_ID.get('finishes_systems')!.captures, /installed, permitted or prohibited/);
  // Renamed, same id: ids are identifiers.
  const tax = FACTOR_BY_ID.get('tax_abatements')!;
  assert.equal(tax.name, 'Tax exemptions and abatements');
  assert.equal(tax.applies_to, 'Both');
  for (const programme of ['421-a', '421-a(16)', '485-x', 'J-51', 'Battery Park City']) assert.ok(tax.captures.includes(programme), programme);
  assert.match(FACTOR_BY_ID.get('recency_market')!.captures, /contract date where a listing's history gives one, else from closing/);
});

test('every adjustment has a magnitude shape; distance, evidence status and the later modules have none', () => {
  for (const f of FACTORS) {
    if (f.role === 'adjustment') for (const l of f.lines) assert.ok(magnitudeKeys(l.magnitude).length > 0, f.id);
    else for (const l of f.lines) assert.equal(l.magnitude.shape, 'none', f.id);
  }
  assert.equal(FACTOR_BY_ID.get('evidence_status')!.role, 'evidence_class');
  const distance = FACTOR_BY_ID.get('distance')!;
  assert.deepEqual([distance.number, distance.role, distance.comparison], [26, 'selection_rule', 'none']);
  assert.deepEqual(FACTORS.filter((f) => f.role === 'later_module').map((f) => f.number), [33, 34, 35, 36]);
  assert.equal(FACTOR_BY_ID.get('school_zone')!.client_visible, false);
  assert.ok(FACTORS.filter((f) => f.id !== 'school_zone').every((f) => f.client_visible));
});

test('the interaction map is A.5, and every member is a real factor line', () => {
  assert.deepEqual(INTERACTIONS.map((i) => i.relationship), [
    'substitute', 'conditional_substitute', 'complement', 'overlap', 'overlap', 'overlap', 'offsetting', 'correlated', 'correlated', 'overlap',
    // v0.4's five, from CR-R
    'overlap', 'overlap', 'overlap', 'overlap', 'overlap',
  ]);
  assert.deepEqual(INTERACTIONS.slice(10).flatMap((i) => interactionPairs(i).map(([a, b]) => `${a.factor}${a.facet ? `.${a.facet}` : ''}~${b.factor}`)), [
    'tax_abatements~carrying_costs', 'carrying_costs~building_financials', 'carrying_costs~ground_lease',
    'outdoor_space~interior_size', 'amenities.general~parking', 'amenities.general~private_storage', 'finishes_systems~condition',
  ]);
  assert.ok(INTERACTIONS.slice(10).every((i) => i.v1_behaviour === 'warn_double_counting'));
  // Distance is a selection rule now, so nothing pairs with it.
  assert.ok(INTERACTIONS.every((i) => i.members.every((m) => FACTOR_BY_ID.get(m.factor)!.role === 'adjustment')));
  for (const def of INTERACTIONS) {
    for (const m of def.members) {
      const f = FACTOR_BY_ID.get(m.factor);
      assert.ok(f, `${def.id}: ${m.factor}`);
      if (m.facet) assert.ok(f!.lines.some((l) => l.facet === m.facet), `${def.id}: ${m.factor}.${m.facet}`);
    }
  }
  const hub = INTERACTIONS.find((i) => i.pattern === 'hub')!;
  assert.deepEqual(interactionPairs(hub).map(([a, b]) => `${a.factor}~${b.factor}`), ['unit_type~floor', 'unit_type~outdoor_space', 'unit_type~views']);
  assert.equal(INTERACTIONS.find((i) => i.relationship === 'substitute')!.v1_behaviour, 'larger_not_sum');
  assert.equal(INTERACTIONS.find((i) => i.relationship === 'complement')!.v1_behaviour, 'undetermined_interaction_line');
});
