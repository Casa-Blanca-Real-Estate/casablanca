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

/**
 * Send: a made-up client, the result that has a range, and the email's own
 * lines. The headline isn't here: it's the agent's, picked from the drafts.
 */
export const SAMPLE_SEND: SendState = {
  result: 'with_estimates',
  clientName: s('Jordan and Sam'),
  chosen: s('I focused on full-service condos close in size and floor, sold in the last few months.'),
  consider: s('Newer towers nearby trade higher than 100 Barclay. Its monthly charges run below most of the comps.'),
  nextStep: s('List in October near the top of what the sales support, with some room on price for a quick, clean close.'),
};

/** Hannah's own read in the briefing: "between 3.4 and 4-something". */
export const SAMPLE_CALL: Omit<CallState, 'at'> = {
  low: 3_400_000,
  high: 4_200_000,
  // The why, as long as a practice agent's must be (PRACTICE_WHY_MIN), so the sample passes the Gate for anyone.
  note: 'A high-floor three-bedroom with city and water views in a full-service building, with charges below most of the towers nearby. Between 3.4 and 4-something.',
  sample: true,
};

export interface SampleTier {
  propertyKey: string;
  tier: Tier;
  reasonType: ReasonType;
  reason: string;
  anchor?: boolean;
  /** The handoff's tags (workspace/features.ts), so the sample reaches Findings (Dispatch 14). */
  tags: string[];
  /** The comp's features, as the agent would pick them. */
  features?: Record<string, string[]>;
}

/**
 * A first-pass sort of Hannah's eleven comps, the way the orientation reads
 * them (00-orientation.md, "The traps"). Keys are the parser's stable property
 * keys; sample.test.ts checks every one is in the export.
 */
export const SAMPLE_TIERS: SampleTier[] = [
  { propertyKey: 'pk1|ny|new york|200 chambers st|10A', tier: 'primary', reasonType: 'property', anchor: true, reason: 'Full-service Tribeca condo, high floor, water views, close in size — the closest match.' , tags: ['Same area', 'Similar size', 'Full service', 'Water views'], features: { outdoor: ['None'], views: ['Water', 'City'], exposure: ['South'], condition: ['Renovated'], building: ['Doorman', 'Gym', 'Pool'] } },
  { propertyKey: 'pk1|ny|new york|79 laight st|1A', tier: 'excluded', reasonType: 'property', reason: 'Public-record closing: ground floor, no listing data, condition can’t be checked.' , tags: ['First floor', '6+ months'] },
  { propertyKey: 'pk1|ny|new york|181 hudson st|1A', tier: 'secondary', reasonType: 'property', reason: 'Ground-floor loft in a small building with no doorman — a different product. Sold 12% over ask.' , tags: ['First floor', 'Much smaller'] },
  { propertyKey: 'pk1|ny|new york|5 franklin pl|14A', tier: 'primary', reasonType: 'property', reason: 'High floor, full service, similar size. Its square footage is approximate.' , tags: ['Similar size', 'Full service'], features: { outdoor: ['None'], views: ['City'], exposure: ['East'], condition: ['Mint'], building: ['Doorman', 'Gym', 'Pool', 'Storage'] } },
  { propertyKey: 'pk1|ny|new york|66 leonard st|12A', tier: 'primary', reasonType: 'property', reason: 'Similar floor and size in a full-service building.' , tags: ['Similar floor', 'Similar size', 'Full service'] },
  { propertyKey: 'pk1|ny|new york|108 leonard st|7G', tier: 'primary', reasonType: 'property', reason: 'Similar size, full service: current ask evidence.' , tags: ['Similar size', 'Full service'] },
  { propertyKey: 'pk1|ny|new york|101 leonard st|5B', tier: 'secondary', reasonType: 'property', reason: 'No floor in the export, and the ask per foot is far below the rest. Context only.' , tags: ['Same area'] },
  { propertyKey: 'pk1|ny|new york|25 n moore st|9C', tier: 'primary', reasonType: 'property', reason: 'Similar size and floor: current ask evidence.' , tags: ['Similar size', 'Similar floor'] },
  { propertyKey: 'pk1|ny|new york|111 murray st|35A', tier: 'secondary', reasonType: 'property', reason: 'Far higher floor in new development; the ask sits well above the sold band.' , tags: ['New development', 'Higher floor'] },
  { propertyKey: 'pk1|ny|new york|100 barclay st|11F', tier: 'primary', reasonType: 'property', reason: 'Same building. No square footage in the export, so it can’t give a $/sqft.' , tags: ['Same building', 'Same layout', 'Lower floor'] },
  { propertyKey: 'pk1|ny|new york|77 reade st|PHA', tier: 'secondary', reasonType: 'property', reason: 'A penthouse — a different product from a 17th-floor unit.' , tags: ['Much bigger'] },
];

/** What /api/comp-report/sample serves: everything but the export, which the sample import stores. */
/** The sample report's name and type: a report filled with all of the sample is this home. */
export const SAMPLE_TITLE = '100 Barclay Street #17L';
export const SAMPLE_PROPERTY_TYPE = 'condo' as const;

export function sampleWalkthrough() {
  return {
    title: SAMPLE_TITLE,
    propertyType: SAMPLE_PROPERTY_TYPE,
    intake: SAMPLE_INTAKE,
    brief: SAMPLE_BRIEF,
    target: SAMPLE_TARGET,
    dealTerms: SAMPLE_DEAL_TERMS,
    call: SAMPLE_CALL,
    send: SAMPLE_SEND,
  };
}

/**
 * Hubert's review of each sample comp (Dispatch 25 item 7), so a demo shows the
 * per-comp flow with his view already there: a round of feedback on the
 * sample's note, then his take, with the tier he'd give and his weak flag.
 * Stored by the sample sort, marked sample, once per comp. His tier differs
 * from the sample's on 101 Leonard: the agent decides.
 */
export interface SampleReview {
  feedback: string;
  take: string;
  tier: Tier;
  tierWhy: string;
  weak?: string;
}

export const SAMPLE_REVIEWS: Record<string, SampleReview> = {
  'pk1|ny|new york|200 chambers st|10A': {
    feedback: 'What holds up:\n- Full service, water views and a similar size all match the home.\nLook again:\n- You call it the closest match: say what still differs, such as the lower floor, so the client sees you weighed it.',
    take: 'A full-service Tribeca condo close in size, with water views like the home’s. It sits a few floors lower, which works slightly in the home’s favour. The best single comparison in the set.',
    tier: 'primary',
    tierWhy: 'Same kind of building and home, recent, and close by: it should set the range.',
  },
  'pk1|ny|new york|79 laight st|1A': {
    feedback: 'What holds up:\n- A public-record closing with no listing data can’t be checked for condition.\nLook again:\n- Say what the ground floor means against a 17th-floor home: that’s the bigger gap.',
    take: 'A ground-floor closing from public records, with no listing behind it. Nothing says what condition it was in or what it offered, and the floor is far from the home’s.',
    tier: 'excluded',
    tierWhy: 'Too little is known about it to lean on.',
    weak: 'ground floor, public-record closing with no listing data',
  },
  'pk1|ny|new york|181 hudson st|1A': {
    feedback: 'What holds up:\n- A loft in a small building with no doorman is a different product from a full-service condo.\nLook again:\n- Selling over its ask tells you about demand for lofts, not about the home: keep that out of the comparison.',
    take: 'A ground-floor loft in a small walk-up-style building, much smaller than the home and without its services. Useful only to show the neighbourhood’s demand.',
    tier: 'secondary',
    tierWhy: 'Context at most: a different kind of home.',
    weak: 'no doorman against a full-service home, much smaller',
  },
  'pk1|ny|new york|5 franklin pl|14A': {
    feedback: 'What holds up:\n- High floor, full service and a similar size: a fair comparison.\nLook again:\n- Its size is approximate, so its price per square foot is too. Say so when you lean on it.',
    take: 'A high-floor, full-service condo of a similar size, recently sold. Its square footage is approximate, so treat its price per square foot as a guide rather than an exact figure.',
    tier: 'primary',
    tierWhy: 'A close match on the things that move price here.',
  },
  'pk1|ny|new york|66 leonard st|12A': {
    feedback: 'What holds up:\n- Similar floor and size in a full-service building.\nLook again:\n- Nothing on its condition or views: add what you know from the listing.',
    take: 'Similar floor and size, in a full-service building close by. A solid comparison, though the building’s design carries a premium some buyers pay for.',
    tier: 'primary',
    tierWhy: 'Matches the home on floor, size and service.',
  },
  'pk1|ny|new york|108 leonard st|7G': {
    feedback: 'What holds up:\n- Similar size and full service.\nLook again:\n- It’s an ask, not a sale: say what that means for how much weight it gets.',
    take: 'A full-service condo of a similar size, still on the market. Its ask shows where sellers are pricing today; the floor is lower than the home’s.',
    tier: 'primary',
    tierWhy: 'Current ask evidence of the same kind of home.',
  },
  'pk1|ny|new york|101 leonard st|5B': {
    feedback: 'What holds up:\n- With no floor in the export, you can’t compare it on floor.\nLook again:\n- An ask per foot far below the rest is usually a different product or condition: find out which before you keep it.',
    take: 'No floor in the export, and its ask per foot sits far below every other comp. Something about it is different, and nothing here says what.',
    tier: 'excluded',
    tierWhy: 'Until you know why it’s priced so far below the rest, it would only pull the range down.',
    weak: 'ask per foot far below the rest, with no floor to explain it',
  },
  'pk1|ny|new york|25 n moore st|9C': {
    feedback: 'What holds up:\n- Similar size and floor.\nLook again:\n- It’s an ask: and what kind of building is it? Service level matters against 100 Barclay.',
    take: 'Close in size and floor, still on the market. A fair read of current asks nearby, as long as the building’s service is comparable.',
    tier: 'primary',
    tierWhy: 'Current ask evidence close to the home in size and floor.',
  },
  'pk1|ny|new york|111 murray st|35A': {
    feedback: 'What holds up:\n- New development on a far higher floor is a different product.\nLook again:\n- Its ask above the sold band is worth naming to the client as the top of the market, not as a comp.',
    take: 'A new-development tower unit far higher up, asking well above what comparable homes have sold for. It shows the ceiling of the area, not the home’s value.',
    tier: 'secondary',
    tierWhy: 'Context for the top of the market.',
  },
  'pk1|ny|new york|100 barclay st|11F': {
    feedback: 'What holds up:\n- Same building and layout: the strongest kind of evidence.\nLook again:\n- With no size, it can’t give a price per square foot. Lean on its price and the floor difference instead.',
    take: 'Same building and layout, six floors lower. The most direct evidence there is for the home, even without a size to compare per foot.',
    tier: 'primary',
    tierWhy: 'Same building, same layout.',
  },
  'pk1|ny|new york|77 reade st|PHA': {
    feedback: 'What holds up:\n- A penthouse is a different product from a 17th-floor unit.\nLook again:\n- Say what makes it different besides the floor: size, outdoor space, views.',
    take: 'A penthouse, much bigger than the home. Buyers pay for different things up there, so it says little about the home’s value.',
    tier: 'secondary',
    tierWhy: 'Context only: a different product.',
    weak: 'a penthouse, much bigger than the home',
  },
};

/**
 * The client's paragraph for each sample comp (Dispatch 26 item 7), as an agent
 * would write it on Send's client step, so a demo shows a finished Designed
 * email end to end. Written by the sample sort, marked as the agent's, only
 * where the comp has none. No figures: the box above it shows them.
 */
export const SAMPLE_CLIENT_LINES: Record<string, string> = {
  'pk1|ny|new york|200 chambers st|10A': 'The closest match to your home: a full-service Tribeca condo of a similar size, with water views like yours. It sits a few floors lower, which works in your favour.',
  'pk1|ny|new york|79 laight st|1A': 'A ground-floor closing from public records, with no listing to say what condition it was in. I’ve left it out of the range.',
  'pk1|ny|new york|181 hudson st|1A': 'A ground-floor loft in a small building without a doorman. It sold well, which shows demand in the area, but it’s a different kind of home from yours.',
  'pk1|ny|new york|5 franklin pl|14A': 'A high-floor, full-service condo of a similar size that sold recently. Its square footage is approximate, so I read its price per square foot as a guide.',
  'pk1|ny|new york|66 leonard st|12A': 'Similar floor and size, in a full-service building close by. A solid comparison for your home.',
  'pk1|ny|new york|108 leonard st|7G': 'Still on the market: a full-service condo of a similar size on a lower floor. Its ask shows where sellers are pricing today.',
  'pk1|ny|new york|101 leonard st|5B': 'Asking far less per foot than everything else nearby, with nothing in the listing to explain why. I show it for context only.',
  'pk1|ny|new york|25 n moore st|9C': 'Close to your home in size and floor, and still on the market. A fair read of what nearby sellers are asking now.',
  'pk1|ny|new york|111 murray st|35A': 'A new-development tower unit far higher up, asking well above what comparable homes have sold for. It marks the top of the market, not your home’s value.',
  'pk1|ny|new york|100 barclay st|11F': 'In your building, with the same layout, six floors lower. The most direct evidence there is for your home.',
  'pk1|ny|new york|77 reade st|PHA': 'A penthouse, much bigger than your home. Buyers pay for different things up there, so it says little about your price.',
};
