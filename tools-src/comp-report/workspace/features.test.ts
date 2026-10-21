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
  // A home read from its listing: outdoor space of no named kind with its size, a river view and a city one, a doorman.
  const intake: Intake = {
    outdoorKind: { value: 'outdoor_space', asOf: AS_OF, from: 'listing' } as Intake['outdoorKind'],
    outdoorSqft: { value: 300, asOf: AS_OF },
    views: { value: ['river', 'City'], asOf: AS_OF },
    building: { value: ['Doorman'], asOf: AS_OF },
  };
  const f = homeFeatures(intake);
  assert.deepEqual(f, { outdoor: [], views: ['City'], building: ['Doorman'], wellness: [], shared_outdoor: [] });
  // Adding a gym touches nothing else.
  const gym = withHomeFeatures(intake, toggleFeature(f, 'building', 'Gym'), AS_OF);
  assert.equal(gym.outdoorKind?.value, 'outdoor_space');
  assert.equal(gym.outdoorSqft?.value, 300);
  assert.deepEqual(gym.views?.value, ['river', 'City']);
  assert.deepEqual(gym.building?.value, ['Doorman', 'Gym']);
  // Changing the views keeps the river.
  const water = withHomeFeatures(intake, toggleFeature(f, 'views', 'Water'), AS_OF);
  assert.deepEqual(water.views?.value, ['river', 'City', 'Water']);
  // Choosing an outdoor space replaces the unnamed one; None says there's none.
  assert.equal(withHomeFeatures(intake, toggleFeature(f, 'outdoor', 'Terrace'), AS_OF).outdoorKind?.value, 'terrace');
  assert.equal(withHomeFeatures(intake, toggleFeature(f, 'outdoor', 'None'), AS_OF).outdoorKind?.value, 'none');
  // Exposure from the picker replaces the old one-line text.
  const exp = withHomeFeatures({ exposure: { value: 'South and west', asOf: AS_OF } }, { exposure: ['South', 'West', 'North'] }, AS_OF);
  assert.deepEqual([exp.exposures?.value, exp.exposure], [['South', 'West', 'North'], undefined]);
});

// ─── Dispatch 16: StreetEasy's vocabulary, and the read filling the pickers ──

import { readFileSync } from 'node:fs';
import { compRecordFromListing, parseExport } from '../engine/index.ts';
import { SAMPLE_EXPORT } from '../server/sample/barclay-17l-export.ts';
import {
  CONDITION_INFO, FEATURE_GROUPS, featuresFromRecord, groupsFor, TAG_GROUPS, TAGS, toggleTag, typeFromListing,
} from './features.ts';
import { homeFromListing } from './subject.ts';

const listingFixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../engine/test/fixtures/listings/${name}`, import.meta.url), 'utf8')) as Record<string, unknown>;
const COOP = 'active-coop-photos-301-east-79-12c.json';
const COOP_URL = 'https://streeteasy.com/building/301-east-79-street-new_york/12c';

/** Every option label and tag string stored before Dispatch 16 (Dispatch 14's lists). */
const OLD_OPTIONS: Record<string, string[]> = {
  outdoor: ['None', 'Balcony', 'Terrace', 'Private roof'],
  views: ['Water', 'City', 'Open', 'Partial', 'Courtyard'],
  exposure: ['North', 'South', 'East', 'West'],
  condition: ['Original', 'Updated', 'Renovated', 'Mint'],
  building: ['Doorman', 'Gym', 'Pool', 'Storage', 'Parking', 'Roof deck'],
};
const OLD_TAGS = [
  'Same building', 'Same area', 'Same layout', 'Similar size', 'Similar floor', 'Full service', 'Smaller', 'Bigger',
  'Much smaller', 'Much bigger', 'Lower floor', 'Higher floor', 'First floor', 'No outdoor space', 'Renovated',
  'Water views', 'New development', '6+ months',
];

test('stored comps keep every feature and tag they had: today’s shapes load through cleanFeatures', () => {
  // Every option of every old group, as report_comps.features holds them: one at a time in a
  // one-choice group, all at once in the others.
  for (const key of ['outdoor', 'condition']) {
    for (const o of OLD_OPTIONS[key]!) assert.deepEqual(cleanFeatures({ [key]: [o] }), { [key]: [o] }, `${key}: ${o}`);
  }
  const { outdoor: _o, condition: _c, ...multi } = OLD_OPTIONS;
  const stored = cleanFeatures(multi);
  assert.deepEqual(Object.values(stored).flat().sort(), Object.values(multi).flat().sort(), 'no label is lost');
  // The handoff's Building holds what now sits in its own StreetEasy category.
  assert.deepEqual(stored.building, ['Doorman', 'Storage', 'Parking']);
  assert.deepEqual(stored.wellness, ['Gym', 'Pool']);
  assert.deepEqual(stored.shared_outdoor, ['Roof deck']);
  assert.deepEqual(cleanFeatures({ outdoor: ['Terrace'], building: ['Gym'] }), { outdoor: ['Terrace'], building: [], wellness: ['Gym'] });
  // A single group still keeps one; the outdoor group's key is still `outdoor`.
  assert.deepEqual(cleanFeatures({ condition: ['Original', 'Mint'] }), { condition: ['Original'] });
  for (const t of OLD_TAGS) assert.ok(isTag(t), t);
  // Once more after a save: what cleanFeatures returns is a fixed point.
  assert.deepEqual(cleanFeatures(stored), stored);
});

test('the groups: Private outdoor space keeps its key, each group is unit or building, and labels don’t repeat across the home’s building groups', () => {
  const outdoor = FEATURE_GROUPS.find((g) => g.key === 'outdoor')!;
  assert.equal(outdoor.label, 'Private outdoor space');
  assert.deepEqual(FEATURE_GROUPS.map((g) => [g.key, g.scope]), [
    ['outdoor', 'unit'], ['views', 'unit'], ['exposure', 'unit'], ['condition', 'unit'], ['corner', 'unit'],
    ['building', 'building'], ['wellness', 'building'], ['shared_outdoor', 'building'], ['policies', 'building'],
  ]);
  for (const [key, options] of Object.entries(OLD_OPTIONS)) {
    for (const o of options) assert.ok(FEATURE_GROUPS.some((g) => g.options.includes(o)), `${key}: ${o} is still an option`);
  }
  const building = FEATURE_GROUPS.filter((g) => ['building', 'wellness', 'shared_outdoor'].includes(g.key)).flatMap((g) => g.options);
  assert.equal(new Set(building).size, building.length);
});

test('groups by type: no concierge, gym or policies for a townhouse; an unknown type sees everything', () => {
  const town = groupsFor('townhouse');
  assert.deepEqual(town.map((g) => g.key), ['outdoor', 'views', 'exposure', 'condition', 'building']);
  assert.deepEqual(town.find((g) => g.key === 'building')!.options, ['Elevator', 'Storage', 'Parking', 'Wheelchair access']);
  assert.equal(groupsFor('coop').length, FEATURE_GROUPS.length);
  assert.ok(groupsFor('coop').find((g) => g.key === 'building')!.options.includes('Concierge'));
  assert.equal(groupsFor(null).length, FEATURE_GROUPS.length);
  assert.equal(groupsFor('other').length, FEATURE_GROUPS.length);
});

test('the condition scale: six steps low to high, good and needs_work under their own labels, and the ⓘ', () => {
  assert.deepEqual(FEATURE_GROUPS.find((g) => g.key === 'condition')!.options, ['Needs work', 'Original', 'Good', 'Updated', 'Renovated', 'Mint']);
  assert.deepEqual(homeFeatures({ condition: { value: 'good', asOf: AS_OF } }).condition, ['Good']);
  assert.deepEqual(homeFeatures({ condition: { value: 'needs_work', asOf: AS_OF } }).condition, ['Needs work']);
  assert.equal(withHomeFeatures({}, { condition: ['Good'] }, AS_OF).condition?.value, 'good');
  assert.equal(withHomeFeatures({}, { condition: ['Needs work'] }, AS_OF).condition?.value, 'needs_work');
  assert.match(CONDITION_INFO, /^Original: never redone, as built\. Good: well kept, not redone\. Needs work: dated or worn, a fixer-upper or gut\.$/);
});

test('tag groups: every tag in one group, size an ordered one-choice scale, new tags accepted', () => {
  const grouped = TAG_GROUPS.flatMap((g) => g.tags);
  assert.deepEqual([...grouped].sort(), [...TAGS].sort(), 'each tag once');
  assert.equal(new Set(grouped).size, grouped.length);
  const size = TAG_GROUPS.find((g) => g.key === 'size')!;
  assert.deepEqual([size.single, size.ordered, size.tags], [true, true, ['Much smaller', 'Smaller', 'Similar size', 'Bigger', 'Much bigger']]);
  assert.deepEqual(TAG_GROUPS.find((g) => g.key === 'differences')!.tags, ['No outdoor space', '6+ months']);
  assert.deepEqual(TAG_GROUPS.find((g) => g.key === 'similarities')!.tags.slice(3), ['Full service', 'Renovated', 'Water views', 'New development']);
  for (const t of ['Penthouse', 'One floor', 'Two floors', 'Three floors']) assert.ok(isTag(t), t);
  // One choice in Size and Multi-floor; several elsewhere.
  assert.deepEqual(toggleTag(['Same building', 'Smaller'], 'Much smaller'), ['Same building', 'Much smaller']);
  assert.deepEqual(toggleTag(['One floor'], 'Two floors'), ['Two floors']);
  assert.deepEqual(toggleTag(['Lower floor'], 'First floor'), ['Lower floor', 'First floor']);
  assert.deepEqual(toggleTag(['Lower floor', 'First floor'], 'First floor'), ['Lower floor']);
});

test('a pasted link fills the home: neighborhood, rooms, Building, policies, corner, year built, and returns the page’s type', () => {
  const r = homeFromListing(listingFixture(COOP), { asOf: '2026-10-21', url: COOP_URL }, {});
  const i = r.intake;
  assert.equal(i.neighborhood?.value, 'Upper East Side');
  assert.equal(i.rooms?.value, 5);
  assert.equal(i.yearBuilt?.value, 1964);
  assert.equal(i.corner?.value, true);
  assert.deepEqual(i.building?.value, [
    'Doorman', 'Elevator', 'Live-in super', 'Laundry in building', 'Bike room', 'Storage', 'Parking', 'Gym', 'Roof deck', 'Courtyard',
  ]);
  assert.deepEqual(i.policies?.value, ['Pets allowed', 'Smoke-free', 'Pied-à-terre allowed', 'Sublets allowed', 'Guarantors accepted']);
  assert.equal(i.building?.from, 'listing', 'marked from StreetEasy');
  for (const k of ['neighborhood', 'rooms', 'building', 'policies', 'corner'] as const) assert.ok(r.filled.includes(k), k);
  // The page's type is data: a co-op, which a report can switch to. Nothing in the intake is a type.
  assert.deepEqual(r.pageType, { value: 'coop', label: 'Co-op', asReportType: 'coop' });
  assert.equal(r.photos.length, 3);
  // The pickers read it back: the building's groups and policies, in their own order.
  const f = homeFeatures(i);
  assert.deepEqual(f.building, ['Doorman', 'Elevator', 'Live-in super', 'Laundry in building', 'Bike room', 'Storage', 'Parking']);
  assert.deepEqual(f.wellness, ['Gym']);
  assert.deepEqual(f.shared_outdoor, ['Roof deck', 'Courtyard']);
  assert.deepEqual(f.corner, ['Corner unit']);
  assert.deepEqual(f.outdoor, ['Balcony']);
  // The agent's own values stand.
  const mine = homeFromListing(listingFixture(COOP), { asOf: '2026-10-21', url: COOP_URL }, {
    neighborhood: { value: 'Lenox Hill', asOf: AS_OF }, policies: { value: [], asOf: AS_OF },
  });
  assert.equal(mine.intake.neighborhood?.value, 'Lenox Hill');
  assert.deepEqual(mine.intake.policies?.value, []);
  assert.ok(!mine.filled.includes('neighborhood') && !mine.filled.includes('policies'));
});

test('a page with no grey line and no policies fills nothing it doesn’t show', () => {
  const r = homeFromListing(listingFixture('sold-no-grey-line-40-bond-5.json'), { asOf: '2026-10-21', url: 'https://streeteasy.com/building/40-bond-street-new_york/5' }, {});
  assert.equal(r.pageType, null);
  assert.equal(r.intake.neighborhood, undefined);
  assert.equal(r.intake.policies, undefined);
  assert.equal(r.intake.corner, undefined);
  assert.equal(r.intake.newDevelopment, undefined);
  assert.deepEqual(r.intake.building?.value, ['Doorman', 'Gym', 'Pool']);
});

test('comps get the same pickers from their records — a link’s, and a stored export’s raw tags with no re-read', () => {
  const { record } = compRecordFromListing(listingFixture(COOP), { as_of: '2026-10-21', url: COOP_URL });
  assert.deepEqual(featuresFromRecord(record), {
    building: ['Doorman', 'Elevator', 'Live-in super', 'Laundry in building', 'Bike room', 'Storage', 'Parking'],
    wellness: ['Gym'],
    shared_outdoor: ['Roof deck', 'Courtyard'],
    policies: ['Pets allowed', 'Smoke-free', 'Pied-à-terre allowed', 'Sublets allowed', 'Guarantors accepted'],
    corner: ['Corner unit'],
    outdoor: ['Balcony'],
    views: ['City'],
  });
  assert.deepEqual(typeFromListing(record)?.value, 'coop');

  // The sample export: 200 Chambers #10A's tags fill Services, Wellness and Shared outdoor space.
  const parsed = parseExport(new TextEncoder().encode(SAMPLE_EXPORT.csv), { as_of: SAMPLE_EXPORT.asOf });
  const chambers = parsed.comps.find((c) => c.identity.address.street?.toLowerCase().startsWith('200 chambers'))!;
  const f = featuresFromRecord(chambers);
  assert.ok(f.building?.includes('Doorman') && f.building.includes('Concierge'), JSON.stringify(f));
  assert.ok(f.wellness?.includes('Gym'), JSON.stringify(f));
  assert.deepEqual(f.policies, ['Pets allowed']);
});
