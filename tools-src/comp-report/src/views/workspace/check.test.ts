// The comp against the target, and Hubert's flags against the guidance (comps.md §3–4, 2026-11-18).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import type { Intake } from '../../../workspace/state.ts';
import { guidanceFlags, versusLine } from './check.ts';

const e = <T,>(value: T) => ({ value, source: 'agent', as_of: '2026-11-18' }) as never;
const home: Intake = { areaSqft: e(2000), floor: e(17), beds: e(3) };

function comp(facts: Record<string, unknown>, status = 'sold', approx = false): WorkspaceComp {
  const record = {
    facts: Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, { value: v, confidence: 'exact' }])),
    flags: { approx_area: approx },
    status: { listing_status: status },
    identity: { address: { street: '200 Chambers Street' }, unit: { raw: '10A' } },
  };
  return { id: 'x', record: record as unknown as WorkspaceComp['record'], origin: 'listing', importId: null, readId: null, unconfirmed: true, judgment: null, unsortable: null };
}

test('the vs line: size, floors and bedrooms against the target', () => {
  const c = comp({ area_sqft: 2201, floor: 10, beds: 3 });
  assert.equal(versusLine(c, home, { sameBuilding: false, miles: 0.2 }), '+201 sq ft · 7 floors lower · same bedrooms');
  const same = comp({ area_sqft: 1847, floor: 12, beds: 3 });
  assert.equal(versusLine(same, home, { sameBuilding: true, miles: null }), 'same building · 153 sq ft smaller · 5 floors lower · same bedrooms');
  assert.equal(versusLine(comp({ area_sqft: 2010, floor: 17, beds: 4 }), home, { sameBuilding: false, miles: 0.1 }), 'same size · same floor · 1 bedroom more');
});

test('flags: distance, age, the floor band, an estimated size', () => {
  const far = comp({ status_date: '2026-03-10', floor: 10, area_sqft: 1840 }, 'sold', true);
  const flags = guidanceFlags(far, home, { sameBuilding: false, miles: 3.1 }, '17L', 'condo', '2026-11-18').map((f) => f.short);
  assert.deepEqual(flags, ['3.1 mi away', 'Sold 8 months ago', 'Floor 10, seven below 17L', 'Size is the listing’s estimate']);
  const fine = comp({ status_date: '2026-09-01', floor: 15, area_sqft: 1950 });
  assert.deepEqual(guidanceFlags(fine, home, { sameBuilding: true, miles: null }, '17L', 'condo', '2026-11-18'), []);
});
