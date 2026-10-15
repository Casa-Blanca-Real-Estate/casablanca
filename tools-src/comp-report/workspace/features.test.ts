// The handoff's tags and pickers (Dispatch 14): what's stored, and the home's
// features in its intake without losing what the pickers can't show.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanFeatures, homeFeatures, isTag, sharedCount, toggleFeature, withHomeFeatures } from './features.ts';
import type { Intake } from './state.ts';

const AS_OF = '2026-10-15';

test('only known groups and options are stored; a single group keeps one', () => {
  assert.deepEqual(cleanFeatures({ views: ['Water', 'Nope'], outdoor: ['None', 'Terrace'], bogus: ['x'], building: 'Doorman' }), { views: ['Water'], outdoor: ['None'] });
  assert.deepEqual(cleanFeatures(null), {});
  assert.equal(isTag('Same building'), true);
  assert.equal(isTag('same building'), false);
});

test('toggling: a single group switches or clears, a multi group adds or removes', () => {
  assert.deepEqual(toggleFeature({ outdoor: ['None'] }, 'outdoor', 'Terrace'), { outdoor: ['Terrace'] });
  assert.deepEqual(toggleFeature({ outdoor: ['Terrace'] }, 'outdoor', 'Terrace'), { outdoor: [] });
  assert.deepEqual(toggleFeature({ views: ['City'] }, 'views', 'Water'), { views: ['City', 'Water'] });
  assert.equal(sharedCount({ views: ['Water', 'City'], building: ['Doorman'] }, { views: ['Water'], building: ['Doorman', 'Gym'] }), 2);
});

test('the home: a picked chip is written; what the pickers can’t show stays', () => {
  // A home read from its listing: a garden with its size, a river view and a city one, a doorman.
  const intake: Intake = {
    outdoorKind: { value: 'garden', asOf: AS_OF, from: 'listing' } as Intake['outdoorKind'],
    outdoorSqft: { value: 300, asOf: AS_OF },
    views: { value: ['river', 'City'], asOf: AS_OF },
    building: { value: ['Doorman'], asOf: AS_OF },
  };
  const f = homeFeatures(intake);
  assert.deepEqual(f, { outdoor: [], views: ['City'], building: ['Doorman'] });
  // Adding a gym touches nothing else.
  const gym = withHomeFeatures(intake, toggleFeature(f, 'building', 'Gym'), AS_OF);
  assert.equal(gym.outdoorKind?.value, 'garden');
  assert.equal(gym.outdoorSqft?.value, 300);
  assert.deepEqual(gym.views?.value, ['river', 'City']);
  assert.deepEqual(gym.building?.value, ['Doorman', 'Gym']);
  // Changing the views keeps the river.
  const water = withHomeFeatures(intake, toggleFeature(f, 'views', 'Water'), AS_OF);
  assert.deepEqual(water.views?.value, ['river', 'City', 'Water']);
  // Choosing an outdoor space replaces the garden; None says there's none.
  assert.equal(withHomeFeatures(intake, toggleFeature(f, 'outdoor', 'Terrace'), AS_OF).outdoorKind?.value, 'terrace');
  assert.equal(withHomeFeatures(intake, toggleFeature(f, 'outdoor', 'None'), AS_OF).outdoorKind?.value, 'none');
  // Exposure from the picker replaces the old one-line text.
  const exp = withHomeFeatures({ exposure: { value: 'South and west', asOf: AS_OF } }, { exposure: ['South', 'West', 'North'] }, AS_OF);
  assert.deepEqual([exp.exposures?.value, exp.exposure], [['South', 'West', 'North'], undefined]);
});
