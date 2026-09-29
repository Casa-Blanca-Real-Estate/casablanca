// The engine's vocabulary — design §6.1.
//
// Money is whole dollars and area whole square feet; floats appear only in
// ratios ($/sqft, percentages). Every input is a *sourced value*: the number
// (or fact) plus where it came from, when, and how sure we are of it.

import type { IsoDate } from './util/dates.ts';

export type { IsoDate };

/** Whole US dollars. */
export type Dollars = number;
/** Whole square feet. */
export type SquareFeet = number;

/** Where a value came from (§6.1). */
export const SOURCES = ['se_export', 'se_pdf', 'listing', 'agent', 'hypothetical', 'engine'] as const;
export type Source = (typeof SOURCES)[number];

/**
 * How sure we are of it (§6.1):
 * - `exact` — as stated by its source
 * - `approx` — marked approximate at its source (StreetEasy's "~1,840 ft²")
 * - `inferred` — derived from listing text or a Jev judgment; needs the agent's
 *   confirmation, and until then it's in neither result
 * - `guesstimate` — the agent's estimate; used in "with estimates" only
 */
export const CONFIDENCES = ['exact', 'approx', 'inferred', 'guesstimate'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export interface Sourced<T> {
  value: T;
  source: Source;
  /** When the value was true or observed — the export date, the date the agent said it. */
  as_of: IsoDate;
  confidence: Confidence;
  note?: string;
}

// ─── Evidence ────────────────────────────────────────────────────────────────

/** Sold, in contract and active are different evidence; they never share a statistic (§4.3). */
export const EVIDENCE_CLASSES = ['sold', 'in_contract', 'active'] as const;
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

/** What a price per square foot divides: the sale price (sold) or the asking price. */
export type PriceBasis = 'sale' | 'ask';

export type PropertyType = 'condo' | 'coop' | 'condop' | 'townhouse' | 'multi_family' | 'other';
/** Report types: condos in v1; co-ops are the same engine with unit rates switched off (§6.3). */
export type ReportPropertyType = 'condo' | 'coop';

export type Tier = 'primary' | 'secondary' | 'excluded';

// ─── Identity ────────────────────────────────────────────────────────────────

export interface StreetEasyRef {
  /** The listing URL without its query string or fragment. */
  url: string;
  kind: 'building_unit' | 'sale' | 'closing' | 'rental' | 'building' | 'other';
  /** From a /sale/<id> URL. */
  listing_id: string | null;
  /** From a /closing/<id> URL — a public-record closing without listing data. */
  closing_id: string | null;
  building_slug: string | null;
  unit_slug: string | null;
}

export interface PropertyIdentity {
  /**
   * The stable property key: normalised address and unit, so the same home
   * matches across every import (§12). Null only when there's no address.
   */
  key: string | null;
  /** The key without the unit — the building. */
  building_key: string | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    normalized_street: string | null;
  };
  unit: { raw: string | null; normalized: string | null };
  streeteasy: StreetEasyRef | null;
}

// ─── Facts ───────────────────────────────────────────────────────────────────

export type OutdoorKind = 'balcony' | 'terrace' | 'roof_deck' | 'garden' | 'patio' | 'outdoor_space';

export interface ServiceFacts {
  doorman: 'full_time' | 'part_time' | 'virtual' | 'hours_unspecified' | 'none_listed';
  concierge: boolean;
}

export type UnitTypeTag = 'penthouse' | 'duplex' | 'triplex' | 'loft';

/**
 * In-unit laundry (factor 9). Co-ops need all three states, because a board
 * must approve a washer/dryer (CR-R):
 * - `installed` — one is in the unit
 * - `permitted` — the building allows one; none is installed
 * - `prohibited` — the building doesn't allow one
 * - `none_listed` — the listing names none; whether one is permitted isn't known
 */
export const LAUNDRY_STATES = ['installed', 'permitted', 'prohibited', 'none_listed'] as const;
export type LaundryState = (typeof LAUNDRY_STATES)[number];

/**
 * A property's facts. Every field is optional and sourced. For comps they come
 * from the parser; for the subject, from the listing lookup or the agent. An
 * empty list, a `false` or a `none_listed` from listing tags means "none
 * listed": the source had tags and named none of that kind. It carries
 * confidence `approx`, because a listing agent types the tags and may leave one
 * out (§6.2). A missing field means unknown.
 */
export interface PropertyFacts {
  property_type?: Sourced<PropertyType>;
  area_sqft?: Sourced<SquareFeet>;
  beds?: Sourced<number>;
  baths?: Sourced<number>;
  floor?: Sourced<number>;
  /** Sold comps: the price paid. */
  sale_price?: Sourced<Dollars>;
  /** The asking price — for a sold comp, the last ask. */
  list_price?: Sourced<Dollars>;
  /** Sold: the closing date. In contract: the contract date. Active: the listing date. */
  status_date?: Sourced<IsoDate>;
  days_on_market?: Sourced<number>;
  common_charges_monthly?: Sourced<Dollars>;
  taxes_monthly?: Sourced<Dollars>;
  /** Co-op maintenance — blank in a condo export by design. */
  maintenance_monthly?: Sourced<Dollars>;
  building_units?: Sourced<number>;
  building_stories?: Sourced<number>;
  year_built?: Sourced<number>;
  /** Private outdoor space (balcony, terrace, private roof…). */
  outdoor_private?: Sourced<boolean>;
  outdoor_kinds?: Sourced<OutdoorKind[]>;
  /** Private outdoor area — never in the export; the listing or the agent. */
  outdoor_area_sqft?: Sourced<SquareFeet>;
  /** A shared roof deck, garden or outdoor space in the building. */
  outdoor_shared?: Sourced<boolean>;
  /** Outlooks — "city", "skyline", "water" … (not page views). */
  views?: Sourced<string[]>;
  parking?: Sourced<string[]>;
  service?: Sourced<ServiceFacts>;
  unit_type?: Sourced<UnitTypeTag[]>;
  /** Central air conditioning. */
  central_air?: Sourced<boolean>;
  dishwasher?: Sourced<boolean>;
  /** A working fireplace, wood-burning or gas; a decorative one doesn't count. */
  fireplace?: Sourced<boolean>;
  laundry?: Sourced<LaundryState>;
  /**
   * The other Home Features — hardwood floors, walk-in closets … Context for a
   * judgment of kitchen, bath and finish quality; not compared by the engine.
   */
  finishes?: Sourced<string[]>;
  /** Building amenities other than door service, parking and shared outdoor space. */
  amenities?: Sourced<string[]>;
  policies?: Sourced<string[]>;
}

export type FactField = keyof PropertyFacts;

// ─── Records ─────────────────────────────────────────────────────────────────

/** A comparable as the parser produced it — the property's facts as of an import. */
export interface CompRecord {
  identity: PropertyIdentity;
  status: {
    /** "SOLD", "IN CONTRACT", "ACTIVE" — as written. */
    raw: string | null;
    evidence_class: EvidenceClass | null;
  };
  facts: PropertyFacts;
  /** StreetEasy engagement — shown for context, never a valuation input. Null for closings. */
  engagement: { page_views: number | null; saves: number | null; shares: number | null } | null;
  building_name: string | null;
  neighborhood: string | null;
  agent_commentary: string | null;
  tags: { features: string[]; amenities: string[]; policies: string[] };
  /** The export's own $/sqft, kept for audit and never used (§6.2). */
  ignored_export_price_per_sqft: { raw: string; value: number | null } | null;
  flags: {
    /** A /closing/ URL: a public-record closing without listing data. */
    closing_record: boolean;
    approx_area: boolean;
  };
  /** Where it came from: the import and the row. */
  origin: { parser_version: string; row: number; as_of: IsoDate } | null;
  /** Columns the parser didn't recognise, kept as written: header → value. */
  extra_columns?: Record<string, string>;
  /**
   * Values the parser only guessed — a penthouse from a "PH" unit label.
   * Inferred, so pending until the agent confirms; the record's own facts stand meanwhile.
   */
  suggestions?: { field: FactField; value: Sourced<unknown> }[];
}

export interface SubjectInput {
  identity: PropertyIdentity;
  facts: PropertyFacts;
}

export interface CompInput {
  /** Unique within the report — the property key is a natural choice. */
  id: string;
  record: CompRecord;
  tier: Tier;
  tier_reason?: string;
  /** The single most comparable sold comp (§6.3). At most one. */
  anchor?: boolean;
}

// ─── What the agent (or Jev) adds ────────────────────────────────────────────

/**
 * A stated fact (§2): a value for one field of the subject or a comp, which
 * takes precedence over the export. `exact`/`approx` land in both results,
 * `guesstimate` in "with estimates" only, `inferred` in neither until confirmed.
 */
export interface StatedFact {
  id: string;
  target: 'subject' | { comp_id: string };
  field: FactField;
  value: Sourced<unknown>;
}

export type Degree = 'small' | 'moderate' | 'large';

/** How a comp compares with the subject on one factor, from the comp's side. */
export type Direction = 'comp_superior' | 'comp_inferior' | 'similar' | 'differs';

/**
 * A judgment that a comp differs from the subject on a factor, and which way
 * and how much — from Jev, its fallback, or the agent. It carries no number:
 * the house method turns a direction and degree into one, once one exists.
 */
export interface FactorAssessment {
  id: string;
  comp_id: string;
  factor: string;
  facet?: string;
  direction: Direction;
  degree?: Degree;
  source: 'jev' | 'fallback' | 'agent';
  /** Jev and fallback judgments are `inferred` until the agent confirms. */
  confidence: Confidence;
  /** Jev's calibrated probability, recorded as given. */
  probability?: number;
  as_of: IsoDate;
  note?: string;
}

/**
 * The agent's value for a factor — "add 5% for the terrace". It is the agent's
 * estimate: it lands in "with estimates" only, labelled as theirs.
 *
 * `percent` and `dollars` apply per comp that differs, signed by the
 * comparison (a comp without the terrace moves up, a comp with a better one
 * moves down). The other forms follow the factor's own magnitude shape.
 */
export type AgentValue =
  | { percent: number }
  | { dollars: number }
  | { percent_per_unit: number }
  | { dollars_per_unit: number }
  | { elasticity: number }
  | { multiplier: number }
  | { weights: Partial<Record<OutdoorKind | 'other', number>> };

export interface AgentAdjustment {
  id: string;
  factor: string;
  facet?: string;
  value: AgentValue;
  /** Limit it to these comps; by default it applies to every comp that differs. */
  comp_ids?: string[];
  reason?: string;
  as_of: IsoDate;
}

export type LeadIndicator =
  | 'unit_rate.median'
  | 'unit_rate.mean'
  | 'unit_rate.anchor'
  | 'adjusted_price.median'
  | 'adjusted_price.mean'
  | 'adjusted_price.anchor';

export interface MethodSettings {
  /** Which indicator leads. Default: the median (unit rate for condos) — labelled as the default. */
  lead?: { indicator: LeadIndicator; reason?: string };
  /**
   * A recency window (§6.5): sold comps count only if they closed inside it, in-contract comps
   * only if they went into contract inside it. Active listings are exempt. A method setting, so
   * it applies to both results.
   */
  recency?: { months: number; reason?: string } | { since: IsoDate; reason?: string };
  /**
   * The agent narrowing the range, with a reason (§6.5). It carries a number,
   * so it is the agent's estimate: "with estimates" only, inside the computed
   * bracket.
   */
  narrowing?: { low?: Dollars; high?: Dollars; reason: string; as_of: IsoDate };
}

/** A price the agent names — a list price, an offer, the client's target, a what-if (§6.7). */
export interface NamedPrice {
  id: string;
  label: string;
  kind: 'list' | 'offer' | 'target' | 'call' | 'what_if' | 'other';
  price: Dollars;
}

/** Inputs for the optional monthly cost estimate (§6.7). */
export interface FinancingInput {
  /** The price financed: a named price's id, or the base of each result. */
  price: { named_price_id: string } | 'base';
  down_payment: { percent: number } | { dollars: Dollars };
  /** Annual interest rate in percent — 6.25 means 6.25%. */
  annual_rate_percent: number;
  term_years: number;
  interest_only?: boolean;
  insurance_monthly?: Dollars;
  other_ownership_costs_monthly?: Dollars;
}

/**
 * Deal terms (§6.7) — an intake module built from scenario templates. v1
 * captures and displays them and runs carry, monthly cost and price
 * evaluation on them; rent-credit and closing-timeline arithmetic comes with
 * full offer modelling.
 */
export interface DealTerms {
  template: 'buyer_traditional' | 'buyer_rent_to_own' | 'seller_pricing';
  price?: Dollars;
  deposit?: { percent: number } | { dollars: Dollars };
  financing?: Omit<FinancingInput, 'price'>;
  target_closing?: IsoDate;
  interim_rent?: { monthly: Dollars; credit_percent?: number };
  seller_target?: Dollars;
  timing?: string;
  flexibility?: string;
}

// ─── The engine's input ──────────────────────────────────────────────────────

export interface EngineInput {
  /** The analysis date. Ages and recency are measured to it — the engine has no clock. */
  as_of: IsoDate;
  property_type: ReportPropertyType;
  subject: SubjectInput;
  comps: CompInput[];
  method?: MethodSettings;
  stated_facts?: StatedFact[];
  assessments?: FactorAssessment[];
  agent_adjustments?: AgentAdjustment[];
  /** Evaluated against the results; never an input to them. */
  prices?: NamedPrice[];
  financing?: FinancingInput;
  deal_terms?: DealTerms;
}
