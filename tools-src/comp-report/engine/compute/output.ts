// What compute() returns. Every field is described in plain language in
// ../README.md; the comments here are the short version.

import type {
  CompRecord, Confidence, DealTerms, Degree, Direction, Dollars, EvidenceClass, FactField, IsoDate,
  LeadIndicator, NamedPrice, PriceBasis, PropertyIdentity, ReportPropertyType, Sourced, SquareFeet, Tier,
} from '../types.ts';

export type ResultKind = 'on_facts' | 'with_estimates';

export type FigureUnit =
  | 'usd' | 'usd_per_sqft' | 'percent' | 'days' | 'usd_per_month' | 'usd_per_sqft_per_month' | 'sqft';

/**
 * A figure the engine computed, with its provenance (§4.7): computed by the
 * engine as of the analysis date, as sure as its weakest input, and how.
 */
export interface Figure {
  value: number;
  unit: FigureUnit;
  source: 'engine';
  as_of: IsoDate;
  confidence: Confidence;
  derivation: string;
}

export interface StatSummary {
  n: number;
  comp_ids: string[];
  median: Figure;
  mean: Figure;
  min: Figure;
  max: Figure;
}

// ─── Comps ───────────────────────────────────────────────────────────────────

/** An input a comparison needs and doesn't have — the field to ask for. */
export interface MissingInput {
  side: 'subject' | 'comp' | 'both';
  /** A fact field ("floor", "area_sqft"…), or for building size "building_units". */
  field: string;
  label: string;
}

export interface ComparisonOut {
  line: string;
  factor: string;
  facet: string | null;
  name: string;
  /** compared — the difference is known; unknown — data missing on one side; pending — rests on an unconfirmed input. */
  status: 'compared' | 'unknown' | 'pending_confirmation';
  direction: Direction | null;
  degree: Degree | null;
  /**
   * The difference for numeric factors, signed so positive means the comp is worse: subject minus comp
   * for area, rooms and floors; comp minus subject for monthly carry; for recency, the comp's age in months.
   */
  units: number | null;
  unit_label: string | null;
  source: 'engine' | 'jev' | 'fallback' | 'agent' | null;
  confidence: Confidence | null;
  basis: string;
  missing: MissingInput[];
}

export interface AdjustmentOut {
  line: string;
  factor: string;
  facet: string | null;
  name: string;
  direction: Direction | null;
  degree: Degree | null;
  /**
   * calculated — a house-method value; agent_estimate — the agent's value ("with estimates" only);
   * considered_not_calculated — it applies, but no value is determined, so it moves no number.
   */
  status: 'calculated' | 'agent_estimate' | 'considered_not_calculated';
  /** Whole dollars, signed: + raises the comp toward the subject. Null when not calculated. */
  dollars: Dollars | null;
  percent_of_price: number | null;
  /** In the sum? False when a substitute took the larger adjustment instead. */
  applied: boolean;
  superseded_by: string | null;
  /** Interior size adjusts adjusted-price indicators only — unit rates already scale by area. */
  applies_to_unit_rate: boolean;
  source: 'house_method' | 'agent' | null;
  agent_adjustment_id: string | null;
  why_not_calculated: string | null;
  basis: string;
}

export interface CompResultOut {
  /** Counts toward this result's statistics: primary, a known evidence class, like-for-like, inside any recency window. */
  included: boolean;
  not_included_because: string[];
  /** The price its $/sqft divides — the sale price for sold, the ask otherwise. */
  price: Sourced<Dollars> | null;
  area_sqft: Sourced<SquareFeet> | null;
  price_per_sqft: Figure | null;
  no_unit_rate_because: string | null;
  comparisons: ComparisonOut[];
  /** Sold comps only. */
  adjustments: AdjustmentOut[];
  adjusted_price: Figure | null;
  adjusted_price_per_sqft: Figure | null;
  /** Adjusted $/sqft × the subject's area. */
  implied_value: Figure | null;
  monthly_carry: Figure | null;
  carry_per_sqft: Figure | null;
  /** In contract and active: where the ask sits against the sold band. */
  ask_vs_sold: { position: 'below' | 'within' | 'above'; versus_sold_median_percent: Figure } | null;
}

export interface CompOut {
  id: string;
  identity: PropertyIdentity;
  building_name: string | null;
  evidence_class: EvidenceClass | null;
  status_raw: string | null;
  basis: PriceBasis | null;
  tier: Tier;
  tier_reason: string | null;
  anchor: boolean;
  flags: {
    closing_record: boolean;
    approx_area: boolean;
    area_missing: boolean;
    price_missing: boolean;
    floor_missing: boolean;
    same_building_as_subject: boolean;
    same_unit_as_subject: boolean;
    property_type_mismatch: boolean;
    unrecognised_status: boolean;
    outside_recency_window: boolean;
  };
  status_date: IsoDate | null;
  /** Days from the status date to the analysis date. */
  age_days: number | null;
  days_on_market: number | null;
  /** Sold comps with a last ask: (sale ÷ last ask − 1) × 100. */
  sale_to_ask_percent: Figure | null;
  engagement: CompRecord['engagement'];
  per_result: Record<ResultKind, CompResultOut>;
}

// ─── Results ─────────────────────────────────────────────────────────────────

export interface ClassSummary {
  evidence_class: EvidenceClass;
  basis: PriceBasis;
  counts: { total: number; primary: number; secondary: number; excluded: number; included: number; with_unit_rate: number };
  price_per_sqft: StatSummary | null;
  price: StatSummary | null;
}

export interface Indicator {
  id: LeadIndicator;
  label: string;
  status: 'ok' | 'unavailable';
  reason: string | null;
  /** Unit-rate indicators: the adjusted $/sqft. */
  per_sqft: Figure | null;
  /** The subject value it implies. */
  implied_value: Figure | null;
  n: number;
  comp_ids: string[];
}

export interface IndicatorFamily {
  status: 'on' | 'off';
  reason: string | null;
  median: Indicator;
  mean: Indicator;
  anchor: Indicator;
}

export interface BridgeCompLine {
  comp_id: string;
  direction: Direction | null;
  degree: Degree | null;
  units: number | null;
  dollars: Dollars | null;
  applied: boolean;
  status: AdjustmentOut['status'];
  why_not_calculated: string | null;
}

export interface BridgeLine {
  kind: 'factor' | 'interaction';
  id: string;
  name: string;
  factor: string | null;
  facet: string | null;
  /** The strongest status across its comps: calculated, agent_estimate, else considered_not_calculated. */
  status: AdjustmentOut['status'];
  /** "value not yet determined", "agent's estimate", "house method". */
  label: string;
  /** School zone is analyst view only. */
  client_visible: boolean;
  comps: BridgeCompLine[];
  /** How far this line moves the base: the base, minus the base with this line removed. */
  effect_on_base: Figure | null;
  interaction: { relationship: string; why: string; members: string[] } | null;
}

export interface Bridge {
  family: 'unit_rate' | 'adjusted_price';
  /** The lead indicator before any adjustment. */
  start: Figure | null;
  lines: BridgeLine[];
  /** The lead indicator after adjustments — the base. */
  end: Figure | null;
  note: string;
}

export interface RangeOut {
  low: Figure;
  high: Figure;
  comp_ids: string[];
}

export interface EstimateUse {
  kind: 'stated_fact' | 'agent_adjustment' | 'narrowing' | 'assessment';
  id: string;
  target: string;
  what: string;
  note: string;
}

export interface CarrySummary {
  subject: Figure | null;
  subject_per_sqft: Figure | null;
  comp_median: Figure | null;
  comp_median_per_sqft: Figure | null;
  comp_ids: string[];
  subject_vs_median_percent: Figure | null;
}

export interface Result {
  kind: ResultKind;
  label: string;
  evidence: Record<EvidenceClass, ClassSummary>;
  indicators: { unit_rate: IndicatorFamily; adjusted_price: IndicatorFamily };
  lead: { indicator: LeadIndicator; chosen_by: 'default' | 'agent'; label: string; reason: string | null };
  base: Figure | null;
  /** Lowest to highest implied value among primary sold comps (§6.5). */
  bracket: RangeOut | null;
  /** The bracket, or the agent's narrowing of it ("with estimates" only). */
  range: (RangeOut & { narrowed: boolean; narrowing_reason: string | null }) | null;
  /** Why there's no range, when there isn't one. */
  range_unavailable_because: string | null;
  bridge: Bridge;
  sale_to_ask: StatSummary | null;
  days_on_market: Record<EvidenceClass, StatSummary | null>;
  asks_vs_sold: {
    sold_band: { low: Figure; median: Figure; high: Figure } | null;
    class_medians: Record<'in_contract' | 'active', { median: Figure; versus_sold_median_percent: Figure } | null>;
  };
  carry: CarrySummary;
  /** What in this result rests on the agent's estimates. Empty for "on the facts". */
  estimates_used: EstimateUse[];
}

export interface Divergence {
  /** True when the agent's estimates move neither the base nor the range. */
  same: boolean;
  base: { on_facts: Dollars | null; with_estimates: Dollars | null; difference: Dollars | null; difference_percent: number | null };
  range_low: { on_facts: Dollars | null; with_estimates: Dollars | null; difference: Dollars | null };
  range_high: { on_facts: Dollars | null; with_estimates: Dollars | null; difference: Dollars | null };
}

// ─── Prices, monthly cost, deal terms ────────────────────────────────────────

export interface PriceEvaluationResult {
  per_sqft: Figure | null;
  vs_range: { position: 'below' | 'within' | 'above'; through_percent: number | null; to_low: Dollars; to_high: Dollars } | null;
  vs_base: { difference: Dollars; percent: number } | null;
  vs_indicators: { indicator: LeadIndicator; implied_value: Dollars; difference: Dollars; percent: number }[];
  /** What the comps' typical sale-to-ask implies if this were the asking price. */
  negotiating_room: { median_sale_to_ask_percent: number; min_percent: number; max_percent: number; n: number; implied_sale_at_median: Dollars } | null;
}

export interface PriceEvaluation extends NamedPrice {
  per_result: Record<ResultKind, PriceEvaluationResult>;
}

export interface MonthlyCost {
  label: string;
  price: Dollars;
  down_payment: Dollars;
  loan: Dollars;
  annual_rate_percent: number;
  term_years: number;
  interest_only: boolean;
  /** Principal and interest (or interest only). */
  mortgage_payment: Dollars;
  interest_first_month: Dollars;
  /** Paid down in the first month — not an expense. */
  principal_first_month: Dollars;
  /** Common charges plus taxes (condo), maintenance (co-op). */
  monthly_carry: Dollars | null;
  insurance: Dollars | null;
  other_ownership_costs: Dollars | null;
  /** Everything actually paid in a month. */
  housing_cash_outflow: Dollars | null;
  /** Interest + carry + insurance + other ownership costs; principal excluded. */
  ownership_carrying_cost: Dollars | null;
  /** Cash outflow less principal. For a purchase with no rent, equal to ownership carrying cost. */
  economic_burn: Dollars | null;
  gaps: string[];
}

export interface DealTermsOut {
  template: DealTerms['template'];
  captured: DealTerms;
  deposit: Dollars | null;
  price_evaluations: PriceEvaluation[];
  monthly_cost: Record<ResultKind, MonthlyCost | null> | null;
  not_computed_in_v1: string[];
}

// ─── Gaps, warnings, pending ─────────────────────────────────────────────────

export interface Gap {
  code: string;
  message: string;
  target: string | null;
  field: string | null;
  results: ResultKind[];
}

export interface Warning {
  code: string;
  message: string;
  comp_ids: string[];
  results: ResultKind[];
}

export interface PendingItem {
  kind: 'fact' | 'assessment';
  id: string | null;
  target: string;
  what: string;
  value: unknown;
  source: string;
  note: string;
}

export interface EngineOutput {
  meta: {
    engine_version: string;
    house_method: { id: string; kind: 'production' | 'test'; version: string; hash: string; all_null: boolean };
    property_type: ReportPropertyType;
    as_of: IsoDate;
    mode: 'report' | 'what_if';
    parser_versions: string[];
    inputs_hash: string;
    output_hash: string;
  };
  subject: {
    identity: PropertyIdentity;
    facts: Record<ResultKind, Partial<Record<FactField, Sourced<unknown>>>>;
  };
  comps: CompOut[];
  results: Record<ResultKind, Result>;
  divergence: Divergence;
  prices: PriceEvaluation[];
  monthly_cost: Record<ResultKind, MonthlyCost | null> | null;
  deal_terms: DealTermsOut | null;
  gaps: Gap[];
  warnings: Warning[];
  pending_confirmation: PendingItem[];
}
