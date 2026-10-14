// Fixed listing texts, written here, with no user data (Dispatch 10 phase 2
// steps 1 and 6). They're invented: no real home, building, person or number.
//
// - The go/no-go call (probe.ts) sends the first one, with every question, once.
// - The weekly drift check (drift.ts) re-asks all of them through the queue,
//   because the Gateway reports only "typesafe-ai/jev", never a version, so an
//   upstream change is otherwise invisible (handoff §7.1, 8). What's measured
//   is movement against the first answers recorded, not correctness.
//
// `expected` is what the registry's own wording says each text should get. It's
// a sanity check on the probe, never a label for calibration: the labelled set
// is real listings, labelled by a person (docs/comp-report/jev-labels.csv).
//
// The texts deliberately include MindBinder's traps (handoff §7.1, 9): negation
// ("no sponsor involvement"), scope (a renovated lobby, not the home), and
// things offered separately (parking for a fee, storage for rent).
//
// Any change to a text here starts its drift record over: bump FIXTURES_VERSION.

import { LISTING_ORIGIN, listingState } from './scrub.ts';

export const FIXTURES_VERSION = 'fixtures-2026-10-14.1';

export interface Fixture {
  /** lower-kebab-case; stored as the judgment's fixture_id. */
  id: string;
  text: string;
  /** Per registry question: an option key for a choice, "true"/"false" for a yes/no. */
  expected: Readonly<Record<string, string>>;
}

export const FIXTURES: readonly Fixture[] = Object.freeze([
  {
    id: 'renovated-park-sponsor',
    text:
      'Gut renovated in 2025, this two-bedroom condominium has a new kitchen, new baths and wide-plank oak floors. ' +
      'The living room windows look straight out over the park. A private terrace off the main bedroom is for this ' +
      'home\'s use only. This is a sponsor unit, sold by the developer: no board approval is needed. It is sold with a ' +
      'tenant in place, on a lease through June 2027. A deeded parking space in the garage is included in the price.',
    expected: {
      condition: 'renovated', view: 'notable', outdoor: 'private', sponsor_unit: 'true', estate_or_as_is: 'false',
      tenant_in_place: 'true', parking_or_storage_included: 'true',
    },
  },
  {
    id: 'estate-needs-work',
    text:
      'Estate sale. This classic six-room co-op has its original kitchen and baths and needs a full renovation: ' +
      'bring your architect. The bedrooms face a quiet interior courtyard. The apartment is being sold as-is.',
    expected: {
      condition: 'needs_work', view: 'ordinary', outdoor: 'not_stated', sponsor_unit: 'false', estate_or_as_is: 'true',
      tenant_in_place: 'false', parking_or_storage_included: 'false',
    },
  },
  {
    id: 'good-shared-roof',
    text:
      'A move-in ready one-bedroom in a well-kept elevator building. Residents share a landscaped roof deck and a bike ' +
      'room. Parking is available in the building\'s garage for an additional monthly fee.',
    expected: {
      condition: 'good', view: 'not_stated', outdoor: 'shared_only', sponsor_unit: 'false', estate_or_as_is: 'false',
      tenant_in_place: 'false', parking_or_storage_included: 'false',
    },
  },
  {
    id: 'nothing-stated',
    text:
      'A spacious studio with high ceilings and an open layout, steps from the subway, shops and restaurants. ' +
      'Common charges are low.',
    expected: {
      condition: 'not_stated', view: 'not_stated', outdoor: 'not_stated', sponsor_unit: 'false', estate_or_as_is: 'false',
      tenant_in_place: 'false', parking_or_storage_included: 'false',
    },
  },
  {
    id: 'negations-and-scope',
    text:
      'No sponsor involvement: this is a resale by the original buyer. The lobby and gym were renovated last year; ' +
      'the apartment itself keeps its original finishes. A Juliet balcony opens off the living room. The home will be ' +
      'delivered vacant. A storage unit is available for rent from the building.',
    expected: {
      condition: 'needs_work', view: 'not_stated', outdoor: 'not_stated', sponsor_unit: 'false', estate_or_as_is: 'false',
      tenant_in_place: 'false', parking_or_storage_included: 'false',
    },
  },
] satisfies Fixture[]);

export const FIXTURE_BY_ID: ReadonlyMap<string, Fixture> = new Map(FIXTURES.map((f) => [f.id, f]));

/** The go/no-go call's fixture: every question has a clear answer in it. */
export const PROBE_FIXTURE: Fixture = FIXTURES[0]!;

/** A fixture's whole state, in the listing lane's shape — the same shape a real listing gets. */
export function fixtureState(f: Fixture): { listing: string } {
  return listingState(`${LISTING_ORIGIN} ${f.text}`);
}
