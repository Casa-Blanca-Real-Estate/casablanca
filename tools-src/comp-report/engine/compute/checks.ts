// The mentors' comparability checks (§6.10): Kara's rules for what makes a
// comp, run as flags on each comp. A flag says what it saw, the tier the rule
// suggests — Primary, Secondary or Excluded (D-20) — and the facts it read. It
// never changes a tier: the agent decides (§4). It never moves a number.
//
// Checks read the best value there is for each fact, confirmed or not, so a
// flag shows as a row lands. A flag that rests on a value awaiting the agent's
// confirmation is `inferred` and carries that value's note ("from the unit
// label #1A — confirm the floor"). One that rests on a side not saying — no
// new-development mark, no terrace among the tags — is `approx` at best.
//
// The thresholds are the house method's (`check_thresholds`): configuration,
// with the mentors' defaults, pending Noble.

import type { CheckThresholds } from '../house-method/load.ts';
import { sameBuilding, sameUnit } from '../parser/property-key.ts';
import { addMonths, type IsoDate } from '../util/dates.ts';
import type {
  Confidence, EvidenceClass, PropertyFacts, PropertyIdentity, PropertyType, ReportPropertyType, Source, Sourced,
} from '../types.ts';
import { weakest } from './facts.ts';
import { describeMarketDate, marketDate, wholeMonthsBetween } from './market-date.ts';
import type { CheckEvidence, CompCheck } from './output.ts';

type Facts = Partial<PropertyFacts>;

export interface CheckSide {
  identity: PropertyIdentity;
  /** The best value of each fact, whatever its confidence (bestFacts). */
  facts: Facts;
}

export interface CheckContext {
  reportType: ReportPropertyType;
  asOf: IsoDate;
  thresholds: CheckThresholds;
  evidenceClass: EvidenceClass | null;
}

/** Sources whose lists are tags a listing agent typed — where an absent tag is weak evidence. */
const TAG_SOURCES: ReadonlySet<Source> = new Set<Source>(['se_export', 'se_pdf', 'listing']);

/** How a fact reads in a flag's message. */
const FIELD_WORDS: Record<string, string> = {
  area_sqft: 'size', status_date: 'date', contract_date: 'contract date', outdoor_private: 'private outdoor space',
  new_development: 'new-development mark', income_restricted: 'HDFC mark', sponsor_unit: 'sponsor mark', property_type: 'type', coordinates: 'location',
};

const TYPE_WORDS: Record<PropertyType, string> = {
  condo: 'condo', coop: 'co-op', condop: 'condop', townhouse: 'townhouse', multi_family: 'multi-family building', other: 'property of another type',
};

/** π / 180, written out: the purity scan admits only the Math functions IEEE 754 pins, so the constant is spelled here. */
const RADIANS_PER_DEGREE = 0.017453292519943295;
const EARTH_RADIUS_MILES = 3958.8;

/** cos x by its Taylor series — exact operations only, so every runtime agrees. Accurate far past any latitude's needs. */
function cosine(x: number): number {
  const x2 = x * x;
  let term = 1;
  let sum = 1;
  for (let k = 1; k <= 10; k++) {
    term = (-term * x2) / ((2 * k - 1) * (2 * k));
    sum += term;
  }
  return sum;
}

/** Miles between two points, flat-earth — within a hair of the great circle at comp distances. */
export function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * RADIANS_PER_DEGREE;
  const dLng = (b.lng - a.lng) * RADIANS_PER_DEGREE * cosine(((a.lat + b.lat) / 2) * RADIANS_PER_DEGREE);
  return Math.sqrt(dLat * dLat + dLng * dLng) * EARTH_RADIUS_MILES;
}

function evidence(side: 'subject' | 'comp', field: string, fact: Sourced<unknown> | undefined): CheckEvidence {
  return fact
    ? { side, field, value: fact.value, source: fact.source, confidence: fact.confidence, note: fact.note ?? null }
    : { side, field, value: null, source: null, confidence: null, note: "doesn't say" };
}

/** Lacking something, as a listing's tags say it, is weak evidence (§6.2). */
function lacks(fact: Sourced<unknown>): Confidence {
  return TAG_SOURCES.has(fact.source) ? weakest(fact.confidence, 'approx') : fact.confidence;
}

function flagged(check: Omit<CompCheck, 'status' | 'threshold' | 'measured'> & Partial<Pick<CompCheck, 'threshold' | 'measured'>>): CompCheck {
  return { status: 'flagged', threshold: null, measured: null, ...check };
}

/**
 * A yes-or-no mark on one side and not the other — new development, HDFC. The
 * flags are "yes" or unknown on a listing, never "no" by omission, so an
 * unmarked side reads as "not marked", and the flag is approximate at best.
 */
function oneSided(
  subject: Sourced<boolean> | undefined, comp: Sourced<boolean> | undefined,
): { compHas: boolean; unmarked: boolean; confidence: Confidence } | null {
  const s = subject?.value === true;
  const c = comp?.value === true;
  if (s === c) return null;
  const other = c ? subject : comp;
  return { compHas: c, unmarked: !other, confidence: weakest(subject?.confidence, comp?.confidence, other ? null : 'approx') };
}

/** Every check that applies to one comp, in the order of the design's table. */
export function compChecks(subject: CheckSide, comp: CheckSide, ctx: CheckContext): CompCheck[] {
  const out: CompCheck[] = [];
  const s = subject.facts;
  const c = comp.facts;
  const t = ctx.thresholds;

  // Same building: the best comps are here.
  if (sameBuilding(subject.identity, comp.identity)) {
    const itself = sameUnit(subject.identity, comp.identity);
    out.push(flagged({
      code: 'same_building',
      label: itself ? 'The home itself' : 'Same building',
      message: itself ? "An earlier sale of the home itself — in the home's building, where the best comps are" : "In the home's building: the best comps are here",
      suggested_tier: 'primary',
      suggestion: 'Primary — and a candidate for the closest comp',
      evidence: [
        { side: 'subject', field: 'building', value: subject.identity.building_key, source: null, confidence: null, note: null },
        { side: 'comp', field: 'building', value: comp.identity.building_key, source: null, confidence: null, note: null },
      ],
      confidence: 'exact',
    }));
  }

  // First floor, when the home isn't: a different product.
  const sf = s.floor as Sourced<number> | undefined;
  const cf = c.floor as Sourced<number> | undefined;
  const firstFloor = Boolean(cf && cf.value <= 1 && !(sf && sf.value <= 1));
  if (firstFloor) {
    const what = cf!.value === 1 ? 'First floor' : 'Below the first floor';
    out.push(flagged({
      code: 'first_floor',
      label: what,
      message: `${what}: a different product — ${sf ? `the home is on floor ${sf.value}` : "the home's floor isn't known yet"}`,
      suggested_tier: 'excluded',
      suggestion: 'Excluded, unless nothing else',
      evidence: [evidence('comp', 'floor', cf), evidence('subject', 'floor', sf)],
      confidence: weakest(cf!.confidence, sf?.confidence),
    }));
  }

  // Private outdoor space on one side only: never compare.
  const so = s.outdoor_private as Sourced<boolean> | undefined;
  const co = c.outdoor_private as Sourced<boolean> | undefined;
  if (so && co && so.value !== co.value) {
    const lacking = co.value ? so : co;
    const weak = TAG_SOURCES.has(lacking.source) ? ` (none is listed for ${co.value ? 'the home' : 'it'} — weak evidence)` : '';
    out.push(flagged({
      code: 'private_outdoor_one_side',
      label: co.value ? 'Has private outdoor space' : 'No private outdoor space',
      message: `${co.value ? "Has private outdoor space; the home doesn't" : 'No private outdoor space; the home has it'}${weak}`,
      suggested_tier: 'excluded',
      suggestion: 'Excluded — never compare (Kara)',
      evidence: [evidence('comp', 'outdoor_private', co), evidence('subject', 'outdoor_private', so)],
      confidence: weakest(so.confidence, co.confidence, lacks(lacking)),
    }));
  }

  // New development against resale.
  const nd = oneSided(s.new_development as Sourced<boolean> | undefined, c.new_development as Sourced<boolean> | undefined);
  if (nd) {
    out.push(flagged({
      code: 'new_development_vs_resale',
      label: nd.compHas ? 'New development' : nd.unmarked ? 'Not marked new development' : 'Resale',
      message: nd.compHas
        ? `New development; ${nd.unmarked ? "the home isn't marked as one" : 'the home is a resale'}`
        : nd.unmarked ? 'Not marked as a new development; the home is one' : 'A resale; the home is a new development',
      suggested_tier: 'excluded',
      suggestion: 'Excluded — never compare new development with resale (Kara)',
      evidence: [evidence('comp', 'new_development', c.new_development), evidence('subject', 'new_development', s.new_development)],
      confidence: nd.confidence,
    }));
  }

  // Co-op against condo — like for like only.
  const ct = c.property_type as Sourced<PropertyType> | undefined;
  if (ct && ct.value !== ctx.reportType) {
    const word = TYPE_WORDS[ct.value];
    out.push(flagged({
      code: 'property_type_differs',
      label: `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
      message: `A ${word}; the home is a ${TYPE_WORDS[ctx.reportType]} — like for like only`,
      suggested_tier: 'excluded',
      suggestion: "Excluded — never compare a co-op with a condo (Kara); it's kept out of every statistic anyway",
      evidence: [
        evidence('comp', 'property_type', ct),
        { side: 'subject', field: 'property_type', value: ctx.reportType, source: null, confidence: null, note: "the report's property type" },
      ],
      confidence: ct.confidence,
    }));
  }

  // HDFC against a building that isn't.
  const hd = oneSided(s.income_restricted as Sourced<boolean> | undefined, c.income_restricted as Sourced<boolean> | undefined);
  if (hd) {
    out.push(flagged({
      code: 'income_restricted',
      label: hd.compHas ? 'HDFC or income-restricted' : hd.unmarked ? 'Not marked HDFC' : 'Not HDFC',
      message: hd.compHas
        ? `HDFC or income-restricted; ${hd.unmarked ? "the home isn't marked as one" : "the home isn't"}`
        : `${hd.unmarked ? 'Not marked HDFC or income-restricted' : 'Not HDFC or income-restricted'}; the home is`,
      suggested_tier: 'excluded',
      suggestion: "Excluded — never compare HDFC with a building that isn't (Kara)",
      evidence: [evidence('comp', 'income_restricted', c.income_restricted), evidence('subject', 'income_restricted', s.income_restricted)],
      confidence: hd.confidence,
    }));
  }

  // A sponsor sale.
  const sp = c.sponsor_unit as Sourced<boolean> | undefined;
  if (sp?.value === true && (s.sponsor_unit as Sourced<boolean> | undefined)?.value !== true) {
    out.push(flagged({
      code: 'sponsor_unit',
      label: 'Sponsor sale',
      message: 'Sponsor sale: often sells higher (no board package)',
      suggested_tier: 'secondary',
      suggestion: 'Secondary — context, with the note (Kara)',
      evidence: [evidence('comp', 'sponsor_unit', sp), evidence('subject', 'sponsor_unit', s.sponsor_unit)],
      confidence: sp.confidence,
    }));
  }

  // The sale's age, from the date its price speaks for. An ask on the market now is current evidence.
  const cls = ctx.evidenceClass;
  const md = cls === 'sold' || cls === 'in_contract' || cls === 'off_market' ? marketDate(c, cls) : null;
  if (md) {
    const age = t.sale_age_months;
    const level = md.date < addMonths(ctx.asOf, -age.market_moved) ? 'market_moved'
      : md.date < addMonths(ctx.asOf, -age.old) ? 'old'
        : md.date < addMonths(ctx.asOf, -age.noted) ? 'noted' : null;
    if (level) {
      const months = age[level];
      const verdict = level === 'market_moved' ? 'the market has moved' : level === 'old' ? 'old for a comp' : 'noted';
      const what = describeMarketDate(md);
      // A sale dated by its contract (§6.5) is labelled by that date, not by the closing it isn't measured from.
      const short = cls === 'sold' ? (md.basis === 'contract_date' ? 'Contract signed' : 'Sold') : cls === 'in_contract' ? 'In contract' : 'Off the market';
      out.push(flagged({
        code: 'sale_age',
        label: `${short} over ${months} months ago`,
        message: `${what.charAt(0).toUpperCase()}${what.slice(1)}, over ${months} months ago: ${verdict}`,
        suggested_tier: level === 'noted' ? null : 'secondary',
        suggestion: level === 'noted' ? null : `Secondary — context past ${age.old} months (Kara)`,
        evidence: [evidence('comp', md.field, c[md.field] as Sourced<unknown>)],
        confidence: md.confidence,
        threshold: { name: `sale_age_months.${level}`, value: months, unit: 'months', basis: age.basis },
        measured: { value: wholeMonthsBetween(md.date, ctx.asOf), unit: 'months' },
      }));
    }
  }

  // Size far off: more than about a quarter bigger or smaller.
  const sa = s.area_sqft as Sourced<number> | undefined;
  const ca = c.area_sqft as Sourced<number> | undefined;
  if (sa && ca) {
    const limit = t.size_percent.value;
    const diff = ca.value - sa.value;
    if (Math.abs(diff) * 100 > limit * sa.value) {
      const pct = (diff / sa.value) * 100;
      const words = `${Math.round(Math.abs(pct))}% ${diff > 0 ? 'bigger' : 'smaller'}`;
      out.push(flagged({
        code: 'size_far_off',
        label: words,
        message: `${words} than the home (${ca.value} sq ft against ${sa.value}): more than about ${limit}% either way${ctx.reportType === 'coop' ? " — though a co-op's size is often unreliable" : ''}`,
        suggested_tier: 'secondary',
        suggestion: 'Secondary — context (Kara)',
        evidence: [evidence('comp', 'area_sqft', ca), evidence('subject', 'area_sqft', sa)],
        confidence: weakest(sa.confidence, ca.confidence),
        threshold: { name: 'size_percent', value: limit, unit: 'percent', basis: t.size_percent.basis },
        measured: { value: pct, unit: 'percent' },
      }));
    }
  }

  // Floor far off: beyond the home's floor band. A first floor is flagged as that already.
  if (sf && cf && !firstFloor) {
    const band = t.floor_band_floors.value;
    const diff = cf.value - sf.value;
    if (Math.abs(diff) > band) {
      const words = `${Math.abs(diff)} floors ${diff > 0 ? 'higher' : 'lower'}`;
      out.push(flagged({
        code: 'floor_far_off',
        label: words,
        message: `${words} than the home (floor ${cf.value} against ${sf.value}): beyond its floor band of ${band} floors either way`,
        suggested_tier: 'secondary',
        suggestion: 'Secondary — context, with the note',
        evidence: [evidence('comp', 'floor', cf), evidence('subject', 'floor', sf)],
        confidence: weakest(sf.confidence, cf.confidence),
        threshold: { name: 'floor_band_floors', value: band, unit: 'floors', basis: t.floor_band_floors.basis },
        measured: { value: diff, unit: 'floors' },
      }));
    }
  }

  // Distance, only with coordinates on both sides — and saying so without them.
  const sc = s.coordinates as Sourced<{ lat: number; lng: number }> | undefined;
  const cc = c.coordinates as Sourced<{ lat: number; lng: number }> | undefined;
  const d = t.distance_miles;
  if (!sc || !cc) {
    const lacking = !sc && !cc ? 'the home and the comp' : !sc ? 'the home' : 'the comp';
    out.push({
      code: 'distance', status: 'unknown',
      label: 'Distance not known',
      message: `Distance can't be checked yet: it needs coordinates for ${lacking}, which neither the export nor a listing page gives`,
      suggested_tier: null, suggestion: null,
      evidence: [evidence('comp', 'coordinates', cc), evidence('subject', 'coordinates', sc)],
      confidence: null, threshold: null, measured: null,
    });
  } else {
    const miles = distanceMiles(sc.value, cc.value);
    const level = miles > d.far ? 'far' : miles > d.noted ? 'noted' : null;
    if (level) {
      out.push(flagged({
        code: 'distance',
        label: `${miles.toFixed(2)} miles away`,
        message: level === 'far' ? `Over ${d.far} miles away (${miles.toFixed(2)}): far for Manhattan` : `Over ${d.noted} miles away (${miles.toFixed(2)}): noted`,
        suggested_tier: level === 'far' ? 'secondary' : null,
        suggestion: level === 'far' ? 'Secondary — context (Kara)' : null,
        evidence: [evidence('comp', 'coordinates', cc), evidence('subject', 'coordinates', sc)],
        confidence: weakest(sc.confidence, cc.confidence),
        threshold: { name: `distance_miles.${level}`, value: d[level], unit: 'miles', basis: d.basis },
        measured: { value: miles, unit: 'miles' },
      }));
    }
  }
  // A flag resting on a value that awaits the agent's confirm says so, with that value's own note.
  for (const k of out) {
    if (k.status !== 'flagged') continue;
    const pending = k.evidence.filter((e) => e.confidence === 'inferred');
    if (pending.length === 0) continue;
    k.message += ` (${pending.map((e) => {
      const whose = e.side === 'comp' ? 'its' : "the home's";
      return `${whose} ${FIELD_WORDS[e.field] ?? e.field.replace(/_/g, ' ')} is inferred: ${e.note ?? "it waits for the agent's confirm"}`;
    }).join('; ')})`;
  }
  return out;
}
