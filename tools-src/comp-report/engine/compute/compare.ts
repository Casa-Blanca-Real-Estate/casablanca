// How each comp compares with the subject, factor by factor (§6.6, Appendix A).
//
// Where the facts allow, the engine compares them itself — floors, areas,
// bedroom counts, the export's tags. Where only a judgment can say (condition,
// layout, micro-location …), the comparison comes from an assessment by Jev
// or the agent. An assessment also overrides the engine's direction and
// supplies a degree. A comparison carries no dollar figure: turning it into
// one is the house method's job (adjust.ts).
//
// Directions are rules, not opinions: more area, bedrooms or floors, or having
// a feature the other lacks, reads as better. Where the facts don't settle a
// direction — two different sets of views, a loft against a duplex — the
// comparison is "differs" and needs a judgment.
//
// A listing agent types the tags, so a tag that isn't there is weak evidence:
// a difference that rests on one side not listing something is approximate at
// best (§6.2).

import { FACTORS, lineId, type FactorDefinition, type FactorLine } from '../catalog/factors.ts';
import { DAYS_PER_MONTH, daysBetween } from '../util/dates.ts';
import type {
  Confidence, Direction, EvidenceClass, FactField, FactorAssessment, IsoDate, LaundryState, PropertyFacts, ReportPropertyType, ServiceFacts, Source, Sourced,
} from '../types.ts';
import { normalizeTag, parkingKind, viewKind } from '../parser/derive.ts';
import { usableIn, weakest, type FactContext } from './facts.ts';
import { describeMarketDate, marketDate } from './market-date.ts';
import type { ComparisonOut, EstimateUse, MissingInput, PendingItem } from './output.ts';

type Facts = Partial<PropertyFacts>;

export interface CompareContext extends FactContext {
  reportType: ReportPropertyType;
  asOf: IsoDate;
  /** What each basis calls the two sides: "subject" and "comp", or two comps' names when a pair is compared (§6.6). */
  names?: { subject: string; comp: string };
}

/** The two sides' names, as the basis text uses them. */
interface Sides { s: string; c: string }
const DEFAULT_SIDES: Sides = { s: 'subject', c: 'comp' };

/** "the subject's", "the comp's", or a named property's. */
function poss(name: string): string {
  return name === 'subject' || name === 'comp' ? `the ${name}'s` : `${name}'s`;
}

/** A property's monthly carrying cost: common charges + taxes (condo), maintenance (co-op). */
export function monthlyCarry(facts: Facts, reportType: ReportPropertyType): { value: number; confidence: Confidence; basis: string } | null {
  if (reportType === 'coop') {
    const m = facts.maintenance_monthly;
    return m ? { value: m.value, confidence: m.confidence, basis: 'maintenance' } : null;
  }
  const cc = facts.common_charges_monthly;
  const tx = facts.taxes_monthly;
  if (!cc || !tx) return null;
  return { value: cc.value + tx.value, confidence: weakest(cc.confidence, tx.confidence), basis: 'common charges + taxes' };
}

function directionFromUnits(units: number): Direction {
  return units > 0 ? 'comp_inferior' : units < 0 ? 'comp_superior' : 'similar';
}

/** More of a set of positive features reads as better; overlapping but different sets need a judgment. */
function directionFromSets(subject: readonly string[], comp: readonly string[]): Direction {
  const s = new Set(subject);
  const c = new Set(comp);
  const subjectOnly = [...s].filter((x) => !c.has(x));
  const compOnly = [...c].filter((x) => !s.has(x));
  if (subjectOnly.length === 0 && compOnly.length === 0) return 'similar';
  if (compOnly.length === 0) return 'comp_inferior';
  if (subjectOnly.length === 0) return 'comp_superior';
  return 'differs';
}

const list = (xs: readonly string[]) => (xs.length ? xs.join(', ') : 'none listed');

/** Sources whose lists are tags a listing agent typed — where an absent tag is weak evidence. */
const TAG_SOURCES: ReadonlySet<Source> = new Set<Source>(['se_export', 'se_pdf', 'listing']);

/** How sure "this side lacks it" is: approximate at best when the side's facts are listing tags. */
function lacking(fact: Sourced<unknown>): Confidence {
  return TAG_SOURCES.has(fact.source) ? weakest(fact.confidence, 'approx') : fact.confidence;
}

/** A direction's confidence: both facts, and the side that lacks something if the direction rests on it. */
function directedConfidence(s: Sourced<unknown>, c: Sourced<unknown>, direction: Direction): Confidence {
  return weakest(s.confidence, c.confidence,
    direction === 'comp_inferior' ? lacking(c) : direction === 'comp_superior' ? lacking(s) : null);
}

const DOORMAN_RANK: Record<ServiceFacts['doorman'], number | null> = {
  none_listed: 0, virtual: 1, part_time: 2, full_time: 4, hours_unspecified: null,
};

function serviceDirection(s: ServiceFacts, c: ServiceFacts): Direction {
  let doorman: Direction;
  if (s.doorman === c.doorman) doorman = 'similar';
  else {
    const rs = DOORMAN_RANK[s.doorman];
    const rc = DOORMAN_RANK[c.doorman];
    if (rs !== null && rc !== null) doorman = directionFromUnits(rs - rc);
    // A doorman of unstated hours outranks none or virtual, but not a known part- or full-time one.
    else if (rs === null) doorman = (rc as number) <= 1 ? 'comp_inferior' : 'differs';
    else doorman = rs <= 1 ? 'comp_superior' : 'differs';
  }
  if (doorman !== 'similar') return doorman;
  if (s.concierge === c.concierge) return 'similar';
  return s.concierge ? 'comp_inferior' : 'comp_superior';
}

function describeService(s: ServiceFacts): string {
  const d = { full_time: 'full-time doorman', part_time: 'part-time doorman', virtual: 'virtual doorman', hours_unspecified: 'doorman (hours not stated)', none_listed: 'no doorman listed' }[s.doorman];
  return s.concierge ? `${d}, concierge` : d;
}

interface Derived {
  status: ComparisonOut['status'];
  direction: Direction | null;
  units: number | null;
  unit_label: string | null;
  confidence: Confidence | null;
  basis: string;
  missing: MissingInput[];
}

function unknown(missing: MissingInput[], basis = ''): Derived {
  return { status: 'unknown', direction: null, units: null, unit_label: null, confidence: null, basis: basis || `needs ${missing.map((m) => m.label).join(' and ')}`, missing };
}

function needBoth<T>(s: Sourced<T> | undefined, c: Sourced<T> | undefined, field: FactField, what: string, sides: Sides): MissingInput[] {
  const missing: MissingInput[] = [];
  if (!s) missing.push({ side: 'subject', field, label: `${poss(sides.s)} ${what}` });
  if (!c) missing.push({ side: 'comp', field, label: `${poss(sides.c)} ${what}` });
  return missing;
}

function numeric(
  s: Sourced<number> | undefined, c: Sourced<number> | undefined, field: FactField, what: string, unitLabel: string,
  describe: (s: number, c: number) => string, sides: Sides,
): Derived {
  const missing = needBoth(s, c, field, what, sides);
  if (missing.length) return unknown(missing);
  const units = s!.value - c!.value;
  return {
    status: 'compared', direction: directionFromUnits(units), units, unit_label: unitLabel,
    confidence: weakest(s!.confidence, c!.confidence), basis: describe(s!.value, c!.value), missing: [],
  };
}

/** Tags compare without regard to case or spacing — the export's and a listing's spellings differ. */
const tags = (xs: readonly string[], norm: (t: string) => string = normalizeTag): string[] => [...new Set(xs.map(norm))].sort();

function setCompare(s: Sourced<string[]> | undefined, c: Sourced<string[]> | undefined, field: FactField, what: string, sides: Sides, orderless = false): Derived {
  const missing = needBoth(s, c, field, what, sides);
  if (missing.length) return unknown(missing);
  const sv = tags(s!.value);
  const cv = tags(c!.value);
  const direction = orderless ? (directionFromSets(sv, cv) === 'similar' ? 'similar' : 'differs') : directionFromSets(sv, cv);
  return {
    status: 'compared', direction, units: null, unit_label: null, confidence: directedConfidence(s!, c!, direction),
    basis: `${sides.s}: ${list(sv)}; ${sides.c}: ${list(cv)}`, missing: [],
  };
}

/** Has it or not. `article` reads "has a dishwasher"; a tag that isn't there reads "lists no dishwasher". */
function presence(s: Sourced<boolean> | undefined, c: Sourced<boolean> | undefined, field: FactField, what: string, sides: Sides, article = ''): Derived {
  const missing = needBoth(s, c, field, what, sides);
  if (missing.length) return unknown(missing);
  const units = (s!.value ? 1 : 0) - (c!.value ? 1 : 0);
  const direction = directionFromUnits(units);
  const says = (f: Sourced<boolean>) => (f.value ? `has ${article}${what}` : TAG_SOURCES.has(f.source) ? `lists no ${what}` : `has no ${what}`);
  return {
    status: 'compared', direction, units: null, unit_label: null,
    confidence: directedConfidence(s!, c!, direction),
    basis: `${sides.s} ${says(s!)}; ${sides.c} ${says(c!)}`, missing: [],
  };
}

const LAUNDRY_RANK: Record<Exclude<LaundryState, 'none_listed'>, number> = { installed: 2, permitted: 1, prohibited: 0 };
const LAUNDRY_WORDS: Record<LaundryState, string> = {
  installed: 'washer/dryer installed', permitted: 'washer/dryer permitted, none installed',
  prohibited: 'washer/dryer prohibited', none_listed: 'no washer/dryer listed',
};

/**
 * Laundry's three states rank installed > permitted > prohibited. "None listed"
 * means not installed, with permitted or prohibited unknown: it loses to
 * installed, and against permitted or prohibited it can't be ranked until the
 * agent says which.
 */
function laundryCompare(s: Sourced<LaundryState> | undefined, c: Sourced<LaundryState> | undefined, sides: Sides): Derived {
  const missing = needBoth(s, c, 'laundry', 'in-unit laundry', sides);
  if (missing.length) return unknown(missing);
  const sv = s!.value;
  const cv = c!.value;
  const basis = `${sides.s}: ${LAUNDRY_WORDS[sv]}; ${sides.c}: ${LAUNDRY_WORDS[cv]}`;
  let direction: Direction;
  if (sv === cv) direction = 'similar';
  else if (sv !== 'none_listed' && cv !== 'none_listed') direction = directionFromUnits(LAUNDRY_RANK[sv] - LAUNDRY_RANK[cv]);
  else if (sv === 'installed') direction = 'comp_inferior';
  else if (cv === 'installed') direction = 'comp_superior';
  else {
    const side = sv === 'none_listed' ? 'subject' : 'comp';
    return unknown([{ side, field: 'laundry', label: `whether ${poss(side === 'subject' ? sides.s : sides.c)} building permits a washer/dryer` }], basis);
  }
  return { status: 'compared', direction, units: null, unit_label: null, confidence: weakest(s!.confidence, c!.confidence), basis, missing: [] };
}

function deriveLine(
  factor: FactorDefinition, line: FactorLine, s: Facts, c: Facts, evidenceClass: EvidenceClass | null, ctx: CompareContext,
): Derived | null {
  const sides: Sides = ctx.names ? { s: ctx.names.subject, c: ctx.names.comp } : DEFAULT_SIDES;
  const { s: S, c: C } = sides;
  switch (lineId(factor.id, line.facet)) {
    case 'interior_size':
      return numeric(s.area_sqft, c.area_sqft, 'area_sqft', 'interior area', 'sqft', (a, b) => `${S} ${a} sqft, ${C} ${b} sqft`, sides);
    case 'beds_baths.bedrooms':
      return numeric(s.beds, c.beds, 'beds', 'bedrooms', 'bedrooms', (a, b) => `${S} ${a} bedrooms, ${C} ${b}`, sides);
    case 'beds_baths.bathrooms':
      return numeric(s.baths, c.baths, 'baths', 'bathrooms', 'bathrooms', (a, b) => `${S} ${a} bathrooms, ${C} ${b}`, sides);
    case 'floor':
      return numeric(s.floor, c.floor, 'floor', 'floor', 'floors', (a, b) => {
        const of = (f: number, st: Sourced<number> | undefined) => (st ? `${f} of ${st.value} stories` : `${f}`);
        return `${S} floor ${of(a, s.building_stories)}, ${C} floor ${of(b, c.building_stories)}`;
      }, sides);
    case 'views': {
      const missing = needBoth(s.views, c.views, 'views', 'views', sides);
      if (missing.length) return unknown(missing);
      const sv = tags(s.views!.value as string[], viewKind);
      const cv = tags(c.views!.value as string[], viewKind);
      // Having a view against none listed is a direction; two different sets of views need a judgment.
      const direction: Direction = sv.length === 0 && cv.length === 0 ? 'similar'
        : sv.length > 0 && cv.length === 0 ? 'comp_inferior'
          : sv.length === 0 && cv.length > 0 ? 'comp_superior'
            : directionFromSets(sv, cv) === 'similar' ? 'similar' : 'differs';
      return { status: 'compared', direction, units: null, unit_label: null, confidence: directedConfidence(s.views!, c.views!, direction), basis: `${S}: ${list(sv)}; ${C}: ${list(cv)}`, missing: [] };
    }
    case 'outdoor_space': {
      const base = presence(s.outdoor_private, c.outdoor_private, 'outdoor_private', 'private outdoor space', sides);
      if (base.status !== 'compared' || !(s.outdoor_private!.value && c.outdoor_private!.value)) return base;
      // Both have outdoor space: sizes settle it only when both are known and the kinds match.
      const sa = s.outdoor_area_sqft;
      const ca = c.outdoor_area_sqft;
      const sk = s.outdoor_kinds?.value ?? [];
      const ck = c.outdoor_kinds?.value ?? [];
      const kindsMatch = sk.length > 0 && ck.length > 0 && directionFromSets(sk, ck) === 'similar';
      if (sa && ca && kindsMatch) {
        const units = sa.value - ca.value;
        return {
          status: 'compared', direction: directionFromUnits(units), units, unit_label: 'outdoor sqft',
          confidence: weakest(base.confidence, sa.confidence, ca.confidence),
          basis: `both have ${list(sk)}: ${S} ${sa.value} sqft, ${C} ${ca.value} sqft`, missing: [],
        };
      }
      return { ...base, direction: 'differs', basis: `both have private outdoor space (${S}: ${list(sk)}; ${C}: ${list(ck)}) — size or a judgment settles which is better` };
    }
    // Kitchen and bath quality and en-suite bathrooms take a judgment: no case here.
    case 'finishes_systems.central_air':
      return presence(s.central_air, c.central_air, 'central_air', 'central air', sides);
    case 'finishes_systems.dishwasher':
      return presence(s.dishwasher, c.dishwasher, 'dishwasher', 'dishwasher', sides, 'a ');
    case 'finishes_systems.fireplace':
      return presence(s.fireplace, c.fireplace, 'fireplace', 'fireplace', sides, 'a ');
    case 'finishes_systems.laundry':
      return laundryCompare(s.laundry, c.laundry, sides);
    case 'unit_type': {
      const missing = needBoth(s.unit_type, c.unit_type, 'unit_type', 'unit type', sides);
      // A unit with no type tags is a standard unit — but only where tags were available to say so.
      if (missing.length) return unknown(missing);
      const st = tags(s.unit_type!.value as string[]);
      const cvt = tags(c.unit_type!.value as string[]);
      let direction = directionFromSets(st, cvt);
      if (direction !== 'similar') {
        const sp = st.includes('penthouse');
        const cp = cvt.includes('penthouse');
        direction = sp && !cp ? 'comp_inferior' : cp && !sp ? 'comp_superior' : 'differs';
      }
      return { status: 'compared', direction, units: null, unit_label: null, confidence: directedConfidence(s.unit_type!, c.unit_type!, direction), basis: `${S}: ${st.join(', ') || 'standard'}; ${C}: ${cvt.join(', ') || 'standard'}`, missing: [] };
    }
    case 'service_level': {
      const missing = needBoth(s.service, c.service, 'service', 'service level', sides);
      if (missing.length) return unknown(missing);
      const sv = s.service!.value;
      const cv = c.service!.value;
      return { status: 'compared', direction: serviceDirection(sv, cv), units: null, unit_label: null, confidence: weakest(s.service!.confidence, c.service!.confidence), basis: `${S}: ${describeService(sv)}; ${C}: ${describeService(cv)}`, missing: [] };
    }
    case 'amenities.general':
      return setCompare(s.amenities, c.amenities, 'amenities', 'amenities', sides);
    case 'amenities.shared_outdoor':
      return presence(s.outdoor_shared, c.outdoor_shared, 'outdoor_shared', 'shared outdoor space', sides);
    case 'building_era': {
      const missing = needBoth(s.year_built, c.year_built, 'year_built', 'year built', sides);
      if (missing.length) return unknown(missing);
      const d = s.year_built!.value - c.year_built!.value;
      return { status: 'compared', direction: d === 0 ? 'similar' : 'differs', units: d, unit_label: 'years', confidence: weakest(s.year_built!.confidence, c.year_built!.confidence), basis: `${S} built ${s.year_built!.value}, ${C} ${c.year_built!.value}`, missing: [] };
    }
    case 'building_size': {
      const pairs: [Sourced<number> | undefined, Sourced<number> | undefined, string][] = [
        [s.building_units, c.building_units, 'units'], [s.building_stories, c.building_stories, 'stories'],
      ];
      const known = pairs.filter(([a, b]) => a && b);
      if (known.length === 0) return unknown([{ side: 'both', field: 'building_units', label: 'units or stories for both buildings' }]);
      const differs = known.some(([a, b]) => a!.value !== b!.value);
      return {
        status: 'compared', direction: differs ? 'differs' : 'similar', units: null, unit_label: null,
        confidence: weakest(...known.flatMap(([a, b]) => [a!.confidence, b!.confidence])),
        basis: known.map(([a, b, what]) => `${what}: ${S} ${a!.value}, ${C} ${b!.value}`).join('; '), missing: [],
      };
    }
    case 'carrying_costs': {
      const sc = monthlyCarry(s, ctx.reportType);
      const cc = monthlyCarry(c, ctx.reportType);
      const what = ctx.reportType === 'coop' ? 'maintenance' : 'common charges and taxes';
      const field = ctx.reportType === 'coop' ? 'maintenance_monthly' : 'common_charges_monthly';
      const missing: MissingInput[] = [
        ...(sc ? [] : [{ side: 'subject' as const, field, label: `${poss(S)} ${what}` }]),
        ...(cc ? [] : [{ side: 'comp' as const, field, label: `${poss(C)} ${what}` }]),
      ];
      if (missing.length) return unknown(missing);
      // Higher carry is the worse side: units are comp minus subject, so a pricier comp adjusts up.
      const units = cc!.value - sc!.value;
      return { status: 'compared', direction: directionFromUnits(units), units, unit_label: 'usd_per_month', confidence: weakest(sc!.confidence, cc!.confidence), basis: `monthly carry: ${S} $${sc!.value}, ${C} $${cc!.value}`, missing: [] };
    }
    case 'policies':
      return setCompare(s.policies, c.policies, 'policies', 'policies', sides, true);
    case 'parking': {
      const missing = needBoth(s.parking, c.parking, 'parking', 'parking', sides);
      if (missing.length) return unknown(missing);
      const sp = tags(s.parking!.value as string[], (t) => parkingKind(t) ?? normalizeTag(t));
      const cp = tags(c.parking!.value as string[], (t) => parkingKind(t) ?? normalizeTag(t));
      const direction: Direction = sp.length > 0 && cp.length === 0 ? 'comp_inferior'
        : sp.length === 0 && cp.length > 0 ? 'comp_superior'
          : directionFromSets(sp, cp) === 'similar' ? 'similar' : 'differs';
      return { status: 'compared', direction, units: null, unit_label: null, confidence: directedConfidence(s.parking!, c.parking!, direction), basis: `${S}: ${list(sp)}; ${C}: ${list(cp)} (deeded or not can't be told)`, missing: [] };
    }
    case 'recency_market': {
      // From the contract date where a listing's history gives one — when the price was agreed — else closing (§6.5).
      if (evidenceClass !== 'sold') return null;
      const d = marketDate(c, 'sold');
      if (!d) return unknown([{ side: 'comp', field: 'status_date', label: `${poss(C)} sale date` }]);
      const days = Math.max(0, daysBetween(d.date, ctx.asOf));
      const months = days / DAYS_PER_MONTH;
      return { status: 'compared', direction: days === 0 ? 'similar' : 'differs', units: months, unit_label: 'months', confidence: d.confidence, basis: `${describeMarketDate(d)}, ${days} days before ${ctx.asOf}`, missing: [] };
    }
    default:
      return null;
  }
}

/** Every comparison for one comp in one result. */
export function compareComp(
  compId: string, subject: Facts, comp: Facts, evidenceClass: EvidenceClass | null,
  assessments: readonly FactorAssessment[], ctx: CompareContext,
): { comparisons: ComparisonOut[]; pending: PendingItem[]; estimates: EstimateUse[] } {
  const comparisons: ComparisonOut[] = [];
  const pending: PendingItem[] = [];
  const estimates: EstimateUse[] = [];
  for (const factor of FACTORS) {
    if (factor.role !== 'adjustment') continue;
    if (!factor.property_types.includes(ctx.reportType)) continue;
    for (const line of factor.lines) {
      const id = lineId(factor.id, line.facet);
      const derived = factor.comparison === 'engine' ? deriveLine(factor, line, subject, comp, evidenceClass, ctx) : null;
      // The latest assessment for this line wins; on the same date, the later one in the list.
      const forLine = assessments
        .map((a, index) => ({ a, index }))
        .filter(({ a }) => a.comp_id === compId && a.factor === factor.id && (a.facet ?? null) === line.facet)
        .sort((x, y) => (x.a.as_of < y.a.as_of ? -1 : x.a.as_of > y.a.as_of ? 1 : x.index - y.index))
        .map(({ a }) => a);
      const newest = forLine[forLine.length - 1];
      if (newest && newest.confidence === 'inferred') {
        pending.push({
          kind: 'assessment', id: newest.id, target: compId, what: id,
          value: { direction: newest.direction, degree: newest.degree ?? null }, source: newest.source,
          note: newest.note ?? `${newest.source} judgment${newest.probability !== undefined ? ` (p=${newest.probability})` : ''} — needs the agent to confirm before it enters either result`,
        });
      }
      let usable: FactorAssessment | undefined;
      for (let i = forLine.length - 1; i >= 0 && !usable; i--) if (usableIn({ source: 'agent', confidence: forLine[i]!.confidence }, ctx)) usable = forLine[i];

      if (!derived && !usable) continue;
      const base: ComparisonOut = {
        line: id, factor: factor.id, facet: line.facet, name: line.name,
        status: derived?.status ?? 'compared',
        direction: derived?.direction ?? null,
        degree: null,
        units: derived?.units ?? null,
        unit_label: derived?.unit_label ?? null,
        source: derived && derived.status === 'compared' ? 'engine' : null,
        confidence: derived?.confidence ?? null,
        basis: derived?.basis ?? '',
        missing: derived?.missing ?? [],
      };
      if (usable) {
        base.status = 'compared';
        base.direction = usable.direction;
        base.degree = usable.degree ?? null;
        base.source = usable.source;
        // A judgment that agrees with the facts, or settles a "differs" they left open, rests on them
        // too — so a confirmed judgment can't make a "none listed" exact. One that overrides them
        // stands alone.
        const buildsOnFacts = derived?.status === 'compared' && derived.confidence !== null &&
          (derived.direction === usable.direction || derived.direction === 'differs');
        base.confidence = buildsOnFacts ? weakest(derived!.confidence, usable.confidence) : usable.confidence;
        base.missing = [];
        base.basis = [derived?.status === 'compared' ? derived.basis : '', `${usable.source} judgment: ${usable.direction.replace('_', ' ')}${usable.degree ? `, ${usable.degree}` : ''}${usable.note ? ` — ${usable.note}` : ''}`].filter(Boolean).join('; ');
        if (ctx.kind === 'with_estimates' && usable.confidence === 'guesstimate') {
          estimates.push({ kind: 'assessment', id: usable.id, target: compId, what: id, note: `the agent's rough judgment of ${line.name.toLowerCase()}` });
        }
      }
      comparisons.push(base);
    }
  }
  return { comparisons, pending, estimates };
}
