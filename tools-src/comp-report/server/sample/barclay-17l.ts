// The walkthrough's sample (Dispatch 07): 100 Barclay Street #17L, the home
// Hannah comped live in her briefing (docs/comp-report/sources), with her
// StreetEasy export for step 2. Admins only — served by /api/comp-report/sample,
// never bundled into the public build.
//
// Every value here is marked sample, and shows labelled "Sample" wherever it
// shows. Where the real fact isn't known — 17L isn't in the export, so its size,
// charges and taxes aren't — the value is a plausible one, and the size is also
// marked as the agent's estimate, so it counts in "with estimates" only.
import type { Tier } from '../../engine/index.ts';
import type { Brief, CallState, DealTermsState, Entry, Intake, ReasonType, SendState, TargetState } from '../../workspace/state.ts';

const AS_OF = '2026-09-23';
const s = <T>(value: T, extra: Partial<Entry<T>> = {}): Entry<T> => ({ value, asOf: AS_OF, sample: true, ...extra });

export const SAMPLE_INTAKE: Intake = {
  address: s('100 Barclay Street, New York, NY'),
  unit: s('#17L'),
  // Not in the export and not in the briefing: a plausible size for a three-bedroom here.
  areaSqft: s(2000, { estimate: true }),
  beds: s(3),
  baths: s(3), // Hannah filtered her search to three bathrooms
  floor: s(17),
  commonCharges: s(2650),
  taxes: s(2480),
  centralAir: s(true),
  dishwasher: s(true),
  fireplace: s(false),
  laundry: s('installed' as const),
  outdoorKind: s('none' as const),
  views: s(['City', 'Water']),
};

export const SAMPLE_BRIEF: Brief = {
  question: s('What range can we defend for 17L, and where should it list?'),
  audience: s('seller' as const),
  clientNote: s('The owners are thinking about listing this fall and want to know where the market is.'),
};

export const SAMPLE_TARGET: TargetState = {
  price: s(4_250_000),
  note: s('The owners’ hoped-for price.'),
};

export const SAMPLE_DEAL_TERMS: DealTermsState = {
  template: 'seller_pricing',
  sellerTarget: s(4_250_000),
  timing: s('List in October'),
  flexibility: s('Some room on price for a quick, clean close'),
};

/** Step 6: a made-up client for the placeholder email, and the result that has a range. */
export const SAMPLE_SEND: SendState = {
  result: 'with_estimates',
  clientName: s('Jordan and Sam'),
};

/** Hannah's own read in the briefing: "between 3.4 and 4-something". */
export const SAMPLE_CALL: Omit<CallState, 'at'> = { low: 3_400_000, high: 4_200_000, sample: true };

export interface SampleTier {
  propertyKey: string;
  tier: Tier;
  reasonType: ReasonType;
  reason: string;
  anchor?: boolean;
}

/**
 * A first-pass sort of Hannah's eleven comps, the way the orientation reads
 * them (00-orientation.md, "The traps"). Keys are the parser's stable property
 * keys; sample.test.ts checks every one is in the export.
 */
export const SAMPLE_TIERS: SampleTier[] = [
  { propertyKey: 'pk1|ny|new york|200 chambers st|10A', tier: 'primary', reasonType: 'property', anchor: true, reason: 'Full-service Tribeca condo, high floor, water views, close in size — the closest match.' },
  { propertyKey: 'pk1|ny|new york|79 laight st|1A', tier: 'excluded', reasonType: 'property', reason: 'Public-record closing: ground floor, no listing data, condition can’t be checked.' },
  { propertyKey: 'pk1|ny|new york|181 hudson st|1A', tier: 'secondary', reasonType: 'property', reason: 'Ground-floor loft in a small building with no doorman — a different product. Sold 12% over ask.' },
  { propertyKey: 'pk1|ny|new york|5 franklin pl|14A', tier: 'primary', reasonType: 'property', reason: 'High floor, full service, similar size. Its square footage is approximate.' },
  { propertyKey: 'pk1|ny|new york|66 leonard st|12A', tier: 'primary', reasonType: 'property', reason: 'Similar floor and size in a full-service building.' },
  { propertyKey: 'pk1|ny|new york|108 leonard st|7G', tier: 'primary', reasonType: 'property', reason: 'Similar size, full service: current ask evidence.' },
  { propertyKey: 'pk1|ny|new york|101 leonard st|5B', tier: 'secondary', reasonType: 'property', reason: 'No floor in the export, and the ask per foot is far below the rest. Context only.' },
  { propertyKey: 'pk1|ny|new york|25 n moore st|9C', tier: 'primary', reasonType: 'property', reason: 'Similar size and floor: current ask evidence.' },
  { propertyKey: 'pk1|ny|new york|111 murray st|35A', tier: 'secondary', reasonType: 'property', reason: 'Far higher floor in new development; the ask sits well above the sold band.' },
  { propertyKey: 'pk1|ny|new york|100 barclay st|11F', tier: 'primary', reasonType: 'property', reason: 'Same building. No square footage in the export, so it can’t give a $/sqft.' },
  { propertyKey: 'pk1|ny|new york|77 reade st|PHA', tier: 'secondary', reasonType: 'property', reason: 'A penthouse — a different product from a 17th-floor unit.' },
];

/** What /api/comp-report/sample serves: everything but the export, which the sample import stores. */
export function sampleWalkthrough() {
  return {
    intake: SAMPLE_INTAKE,
    brief: SAMPLE_BRIEF,
    target: SAMPLE_TARGET,
    dealTerms: SAMPLE_DEAL_TERMS,
    call: SAMPLE_CALL,
    send: SAMPLE_SEND,
  };
}
