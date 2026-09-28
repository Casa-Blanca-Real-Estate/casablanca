// The adjustment catalog is Appendix A, all 36 factors, and the interaction
// map is A.5 — structure only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTORS, FACTOR_BY_ID, INTERACTIONS, interactionPairs, magnitudeKeys } from '../index.ts';

const APPENDIX_A = [
  'Interior size', 'Bedrooms and bathrooms', 'Layout and efficiency', 'Floor', 'Exposure and light', 'Views',
  'Outdoor space', 'Condition', 'Finishes and systems', 'Ceiling height and volume', 'Unit type',
  'Noise and street position', 'Private storage and extras', 'Service level', 'Amenities', 'Building era and type',
  'Building size', 'Sponsor and new-development sales', 'Carrying costs', 'Tax abatements', 'Building financials',
  'Policies', 'Parking', 'Ground lease', 'Micro-location', 'Distance from subject', 'School zone',
  'Recency and market movement', 'Sale conditions', 'Concessions and credits', 'Combination units', 'Evidence status',
  'Air and development rights', 'Lot size, width and frontage', 'Legal use and certificate of occupancy',
  'Rental income and yield',
];

test('all 36 factors, numbered and named as in Appendix A', () => {
  assert.equal(FACTORS.length, 36);
  assert.deepEqual(FACTORS.map((f) => f.number), Array.from({ length: 36 }, (_, i) => i + 1));
  assert.deepEqual(FACTORS.map((f) => f.name), APPENDIX_A);
  assert.equal(new Set(FACTORS.map((f) => f.id)).size, 36);
  const groups = FACTORS.map((f) => f.group);
  assert.deepEqual([groups.indexOf('building'), groups.indexOf('location'), groups.indexOf('transaction_market'), groups.indexOf('later')], [13, 24, 27, 32]);
  for (const f of FACTORS) {
    assert.ok(f.captures.length > 0 && f.data_sources.length > 0 && f.applies_to.length > 0, f.id);
  }
});

test('every adjustment has a magnitude shape; evidence status and the later modules have none', () => {
  for (const f of FACTORS) {
    if (f.role === 'adjustment') for (const l of f.lines) assert.ok(magnitudeKeys(l.magnitude).length > 0, f.id);
    else for (const l of f.lines) assert.equal(l.magnitude.shape, 'none', f.id);
  }
  assert.equal(FACTOR_BY_ID.get('evidence_status')!.role, 'evidence_class');
  assert.deepEqual(FACTORS.filter((f) => f.role === 'later_module').map((f) => f.number), [33, 34, 35, 36]);
  assert.equal(FACTOR_BY_ID.get('school_zone')!.client_visible, false);
  assert.ok(FACTORS.filter((f) => f.id !== 'school_zone').every((f) => f.client_visible));
});

test('the interaction map is A.5, and every member is a real factor line', () => {
  assert.deepEqual(INTERACTIONS.map((i) => i.relationship), [
    'substitute', 'conditional_substitute', 'complement', 'overlap', 'overlap', 'overlap', 'offsetting', 'correlated', 'correlated', 'overlap',
  ]);
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
