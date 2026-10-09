// The question registry — the source of truth for every judgment the decision
// layer asks (Dispatch 10, CR-D; design §7.1). Jev and the Haiku fallback both
// render from it, so their wording can't drift apart.
//
// Rules (handoff §4, Dispatch 10 phase 1 step 1):
// - Question and option text is fixed here, in code. Only `state` carries the
//   listing's text, so nothing a page says can become an instruction. A test
//   reads this file and asserts that no question or option text is built from
//   a variable.
// - Every option says what it is and what it isn't. Every choice has a real
//   abstain option. Lists are short and don't overlap.
// - Code compares; Jev reads. Jev is asked what one listing's text says about
//   that one home — never to compare two listings, never about a number.
//   Code turns the classes into the §6.10 checks, the pairs' differing factors
//   and the note chips.
// - A yes/no answer of "false" means "the text doesn't say so", never "no".
//   Nothing may conclude a home is not a sponsor unit from a false.
//
// Any change to any text here changes what is measured: bump the question's
// version and REGISTRY_VERSION, and the calibration for it starts over.

import { FACTOR_BY_ID } from '../../engine/catalog/factors.ts';
import { CHECK_CODES, type CheckCode } from '../../engine/compute/output.ts';
import type { PropertyFacts } from '../../engine/types.ts';

export const REGISTRY_VERSION = 'listing-2026-09-29.1';

export type Lane = 'listing';

/**
 * What a lane's state carries (Dispatch 10, "Where Casa differs" 3): `public`
 * text — a listing's own words — or `private` text, anything an agent or a
 * client wrote. A private lane is sent only with zero retention on
 * (CR_JEV_ZDR); with it off, its requests are refused before they're sent.
 */
export type LaneText = 'public' | 'private';
export const LANE_TEXT: Readonly<Record<Lane, LaneText>> = Object.freeze({ listing: 'public' });

export interface Feeds {
  /** Appendix A factor ids (engine/catalog/factors.ts). */
  factors: string[];
  /** §6.10 checks, by the engine's own codes (engine/compute/checks.ts). */
  checks: CheckCode[];
}

export interface OptionDef {
  key: string;
  text: string;
}

interface QuestionBase {
  id: string;
  /** Bumped whenever this question's wording changes. */
  version: number;
  lane: Lane;
  instructions: string;
  feeds: Feeds;
  /**
   * Whether to ask it for this listing: only where the tags and the extract
   * leave the answer open. Reads the record's facts only, never the text.
   */
  askWhen: (facts: PropertyFacts) => boolean;
}

export interface ChoiceQuestion extends QuestionBase {
  type: 'choice';
  /** In the declared order. Asked in this order and reversed (handoff §5.1). */
  options: OptionDef[];
  /** The key of the real abstain option. */
  abstain: string;
}

export interface BooleanQuestion extends QuestionBase {
  type: 'boolean';
  criteria: { true: string; false: string };
}

export interface ScoreQuestion extends QuestionBase {
  type: 'score';
  /** Ordered, lowest first. Jev answers 0-based (handoff §4.4); verdict.ts converts once. */
  levels: string[];
  /** The level that means "can't tell", when there is one (1-based), else null. */
  abstainLevel: number | null;
}

export type Question = ChoiceQuestion | BooleanQuestion | ScoreQuestion;

const always = () => true;

// ─── The listing lane ────────────────────────────────────────────────────────
// Per listing: what its text says that its tags and extract don't. The state is
// { listing: "[listing] <the scrubbed description>" } and nothing else.

const LISTING_ONLY =
  'state.listing is the public description of one home for sale, as its listing page words it. ' +
  'Judge ONLY by what state.listing says about this home. Do not guess from the price, the building, ' +
  'the neighborhood or anything the text does not say.';

export const CONDITION: ChoiceQuestion = {
  id: 'condition',
  version: 1,
  lane: 'listing',
  type: 'choice',
  instructions:
    `${LISTING_ONLY} What condition does state.listing say the home's interior is in? ` +
    'Praise alone ("beautiful", "stunning", "sun-filled") is not a statement of condition.',
  options: [
    {
      key: 'renovated',
      text:
        'Renovated: the text says the home itself was renovated, redone or newly built, or calls it mint or ' +
        'brand-new. Not a renovation of the building\'s lobby or amenities only, and not new appliances or ' +
        'fresh paint alone.',
    },
    {
      key: 'good',
      text:
        'Good: the text says the home is well kept, move-in ready or in good condition, without saying it was ' +
        'renovated. Not a home the text calls renovated, and not one it says needs work.',
    },
    {
      key: 'needs_work',
      text:
        'Needs work: the text says the home needs updating or renovation, is original or dated, or invites the ' +
        'buyer to renovate ("bring your architect", "TLC", "estate condition"). Not a home that is only offered ' +
        'with the option to customize.',
    },
    {
      key: 'not_stated',
      text:
        'Not stated: the text says nothing about the home\'s condition, or too little to tell which of the ' +
        'others it is.',
    },
  ],
  abstain: 'not_stated',
  feeds: { factors: ['condition'], checks: [] },
  askWhen: always,
};

/** The tags gave no view: none listed, or no tags at all. */
function viewsOpen(facts: PropertyFacts): boolean {
  return !facts.views || facts.views.value.length === 0;
}

export const VIEW: ChoiceQuestion = {
  id: 'view',
  version: 1,
  lane: 'listing',
  type: 'choice',
  instructions:
    `${LISTING_ONLY} What does state.listing say the home's own windows look out on? ` +
    'Count only views from inside this home, not from a shared roof deck or other common space.',
  options: [
    {
      key: 'notable',
      text:
        'A notable view: the text says the home looks out on a park, the water, the skyline or a landmark, or has ' +
        'open, unobstructed views over the rooftops. Not a view from a shared or common space, and not a park or ' +
        'river the text only says is nearby.',
    },
    {
      key: 'ordinary',
      text:
        'An ordinary outlook: the text says the windows face the street, a courtyard or a neighbouring building, ' +
        'or that the view is partial or obstructed. Not a park, water, skyline or landmark view from the home.',
    },
    {
      key: 'not_stated',
      text: 'Not stated: the text says nothing about what the home\'s windows look out on.',
    },
  ],
  abstain: 'not_stated',
  feeds: { factors: ['views'], checks: [] },
  askWhen: viewsOpen,
};

/** The tags gave no private outdoor space: none listed, or no tags at all. */
function outdoorOpen(facts: PropertyFacts): boolean {
  return !facts.outdoor_private || facts.outdoor_private.value === false;
}

export const OUTDOOR: ChoiceQuestion = {
  id: 'outdoor',
  version: 1,
  lane: 'listing',
  type: 'choice',
  instructions:
    `${LISTING_ONLY} Does state.listing say the home has outdoor space of its own?`,
  options: [
    {
      key: 'private',
      text:
        'Private: the text says this home has its own balcony, terrace, private roof deck, garden or patio, for ' +
        'this home\'s use only. Not a shared roof deck, courtyard or garden other residents use, and not a Juliet ' +
        'balcony or a window box.',
    },
    {
      key: 'shared_only',
      text:
        'Shared only: the text mentions outdoor space only as the building\'s shared or common space. Not space ' +
        'that belongs to this home alone.',
    },
    {
      key: 'not_stated',
      text: 'Not stated: the text mentions no outdoor space, for the home or for the building.',
    },
  ],
  abstain: 'not_stated',
  feeds: { factors: ['outdoor_space'], checks: ['private_outdoor_one_side'] },
  askWhen: outdoorOpen,
};

export const SPONSOR_UNIT: BooleanQuestion = {
  id: 'sponsor_unit',
  version: 1,
  lane: 'listing',
  type: 'boolean',
  instructions: `${LISTING_ONLY} Does state.listing say this home is a sponsor sale?`,
  criteria: {
    true:
      'The text says the home is sold by the building\'s sponsor, its developer or a holder of unsold shares: a ' +
      '"sponsor unit", "sponsor sale", "no board approval" because it is a sponsor sale, or a new development\'s ' +
      'first sale by its developer.',
    false:
      'The text doesn\'t say so. A resale by an owner who bought it earlier is false, and so is a text that ' +
      'doesn\'t say who is selling.',
  },
  feeds: { factors: ['sponsor_sales'], checks: ['sponsor_unit'] },
  // The page's own "sponsor unit" marker already said yes: nothing to ask.
  askWhen: (facts) => facts.sponsor_unit?.value !== true,
};

export const ESTATE_OR_AS_IS: BooleanQuestion = {
  id: 'estate_or_as_is',
  version: 1,
  lane: 'listing',
  type: 'boolean',
  instructions: `${LISTING_ONLY} Does state.listing say this is an estate sale or an as-is sale?`,
  criteria: {
    true:
      'The text says the home is sold by an estate or an executor, or is sold as-is ("estate sale", "sold as-is", ' +
      '"being sold in its current condition").',
    false:
      'The text doesn\'t say so. A home that needs work, without the text saying it is sold as-is or by an ' +
      'estate, is false.',
  },
  feeds: { factors: ['sale_conditions'], checks: [] },
  askWhen: always,
};

export const TENANT_IN_PLACE: BooleanQuestion = {
  id: 'tenant_in_place',
  version: 1,
  lane: 'listing',
  type: 'boolean',
  instructions: `${LISTING_ONLY} Does state.listing say the home is sold with a tenant in place?`,
  criteria: {
    true:
      'The text says the home is sold occupied, with a tenant living in it or a lease the buyer takes over ' +
      '("tenant in place", "investor unit, leased through …", "sold with a tenant").',
    false:
      'The text doesn\'t say so. "Great investment" or "sublets allowed" alone is false, and so is a home the ' +
      'text says will be delivered vacant.',
  },
  feeds: { factors: ['tenant_in_place'], checks: [] },
  askWhen: always,
};

export const PARKING_OR_STORAGE_INCLUDED: BooleanQuestion = {
  id: 'parking_or_storage_included',
  version: 1,
  lane: 'listing',
  type: 'boolean',
  instructions:
    `${LISTING_ONLY} Does state.listing say a parking space or a storage unit is included in the price?`,
  criteria: {
    true:
      'The text says a parking space or a private storage unit comes with the home at this price ("deeded ' +
      'parking included", "storage unit conveys", "includes a storage cage").',
    false:
      'The text doesn\'t say so. Parking or storage the building offers for rent, or for sale separately, is ' +
      'false, and so is a garage in the building with no space said to be included.',
  },
  feeds: { factors: ['parking', 'private_storage'], checks: [] },
  askWhen: always,
};

/** Every question, in the order it's asked. */
export const QUESTIONS: readonly Question[] = [
  CONDITION, VIEW, OUTDOOR, SPONSOR_UNIT, ESTATE_OR_AS_IS, TENANT_IN_PLACE, PARKING_OR_STORAGE_INCLUDED,
];

export const QUESTION_BY_ID: ReadonlyMap<string, Question> = new Map(QUESTIONS.map((q) => [q.id, q]));

/** The listing lane's questions for one record: only those its tags and extract leave open. */
export function listingQuestionsFor(facts: PropertyFacts): Question[] {
  return QUESTIONS.filter((q) => q.lane === 'listing' && q.askWhen(facts));
}

/** A registry problem, or none. Asserted by the tests; nothing ships with one. */
export function registryProblems(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const q of QUESTIONS) {
    if (ids.has(q.id)) problems.push(`${q.id}: duplicate id`);
    ids.add(q.id);
    if (!/^[a-z][a-z_]*$/.test(q.id) || q.id.includes('__')) problems.push(`${q.id}: ids are lower_snake_case, without "__"`);
    for (const f of q.feeds.factors) if (!FACTOR_BY_ID.has(f)) problems.push(`${q.id}: feeds unknown factor ${f}`);
    for (const c of q.feeds.checks) if (!(CHECK_CODES as readonly string[]).includes(c)) problems.push(`${q.id}: feeds unknown check ${c}`);
    if (q.feeds.factors.length + q.feeds.checks.length === 0) problems.push(`${q.id}: feeds nothing`);
    if (q.type === 'choice') {
      const keys = q.options.map((o) => o.key);
      if (new Set(keys).size !== keys.length) problems.push(`${q.id}: duplicate option`);
      if (!keys.includes(q.abstain)) problems.push(`${q.id}: its abstain option isn't one of its options`);
      if (keys.length < 2 || keys.length > 6) problems.push(`${q.id}: keep a choice between 2 and 6 options`);
      for (const o of q.options) if (o.text.length < 40) problems.push(`${q.id}.${o.key}: say what it is and what it isn't`);
    }
    if (q.type === 'boolean' && (q.criteria.true.length < 40 || q.criteria.false.length < 20)) {
      problems.push(`${q.id}: name exactly what true and false mean`);
    }
    if (q.type === 'score') {
      if (q.levels.length < 2 || q.levels.length > 10) problems.push(`${q.id}: 2–10 levels`);
      if (q.abstainLevel !== null && (q.abstainLevel < 1 || q.abstainLevel > q.levels.length)) problems.push(`${q.id}: abstain level out of range`);
    }
  }
  return problems;
}
