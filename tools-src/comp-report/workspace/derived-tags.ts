// The tags the data settles (NW-059 a, Dispatch 16): from a comp, the home and
// the engine's checks, the tags the facts support and the tags they
// contradict. Kimani's NB-9 answer is C: for a full agent the supported tags
// are pre-filled; for a practice agent they're one-click suggestions marked
// "from the data"; contradicted tags clear for both (withDerivedTags). Mason
// shows it in Dispatch 20. Lower and Higher floor stay manual (Kimani: they
// depend on the building's height).
//
// The size scale's edges are the house method's, not code: within
// `size_tag_percent` a comp is Similar size; out to `size_percent` (the same 25
// the engine's size_far_off check reads), Smaller or Bigger; past it, Much.
import {
  productionHouseMethod, type CheckThresholds, type CompOut, type CompRecord, type EngineOutput, type PropertyFacts, type Sourced,
} from '../engine/index.ts';
import { tagGroupOf, type Features, type Tag } from './features.ts';

export interface DerivedTag {
  tag: Tag;
  /** Why, in a few words, for the chip's title: "8% smaller than the home". */
  because: string;
}

export interface DerivedTags {
  /** Tags the data supports: suggestions, never applied for the agent. */
  supported: DerivedTag[];
  /** Tags the facts contradict: cleared when the agent has them. */
  contradicted: DerivedTag[];
}

export interface DerivedTagsInput {
  comp: CompOut;
  record: CompRecord;
  subject: EngineOutput['subject'];
  /** The comp's features as the agent set them (report_comps.features), when they have. */
  features?: Features | null;
  /** The house method's check thresholds; production's by default. */
  thresholds?: CheckThresholds;
}

/** A comp at least this many months old is "6+ months", whatever the house method calls old. */
const SIX_MONTHS = 6;

function homeFact<T>(subject: EngineOutput['subject'], field: keyof PropertyFacts): T | null {
  const f = (subject.facts.on_facts[field] ?? subject.facts.with_estimates[field]) as Sourced<T> | undefined;
  return f ? f.value : null;
}

/** The size tag for a comp of `comp` sq ft against a home of `home`: the scale, one choice. */
export function sizeTag(home: number, comp: number, t: Pick<CheckThresholds, 'size_percent' | 'size_tag_percent'>): DerivedTag | null {
  if (!(home > 0) || !(comp > 0)) return null;
  const diff = comp - home;
  const pct = Math.round((Math.abs(diff) / home) * 100);
  const words = diff === 0 ? 'the same size as the home' : `${pct}% ${diff > 0 ? 'bigger' : 'smaller'} than the home`;
  // The engine's own test for size_far_off, so the two never disagree at the edge.
  if (Math.abs(diff) * 100 > t.size_percent.value * home) return { tag: diff > 0 ? 'Much bigger' : 'Much smaller', because: words };
  if (Math.abs(diff) * 100 > t.size_tag_percent.value * home) return { tag: diff > 0 ? 'Bigger' : 'Smaller', because: words };
  return { tag: 'Similar size', because: words };
}

/** The tags a comp's data supports, and the tags its facts contradict. */
export function derivedTags(input: DerivedTagsInput): DerivedTags {
  const { comp, record, subject } = input;
  const t = input.thresholds ?? productionHouseMethod().check_thresholds;
  const cf = record.facts;
  const supported: DerivedTag[] = [];
  const contradicted: DerivedTag[] = [];

  if (comp.flags.same_building_as_subject) supported.push({ tag: 'Same building', because: 'the same building as the home' });

  const homeArea = homeFact<number>(subject, 'area_sqft');
  if (homeArea !== null && cf.area_sqft) {
    const size = sizeTag(homeArea, cf.area_sqft.value, t);
    if (size) supported.push(size);
  }

  const homeFloor = homeFact<number>(subject, 'floor');
  const floor = cf.floor?.value ?? null;
  if (floor !== null && homeFloor !== null && (floor !== 1 || homeFloor === 1) && Math.abs(floor - homeFloor) <= t.floor_band_floors.value) {
    supported.push({
      tag: 'Similar floor',
      because: floor === homeFloor ? 'the same floor as the home' : `floor ${floor} against the home's ${homeFloor}: within ${t.floor_band_floors.value} floors`,
    });
  }
  if (floor === 1) supported.push({ tag: 'First floor', because: 'on the first floor' });
  else if (floor !== null) contradicted.push({ tag: 'First floor', because: `on floor ${floor}` });

  const age = comp.checks.find((k) => k.code === 'sale_age' && k.status === 'flagged');
  if (age?.measured && age.measured.value >= SIX_MONTHS) supported.push({ tag: '6+ months', because: age.label });

  if (cf.new_development?.value === true) supported.push({ tag: 'New development', because: 'the listing marks it new development' });

  // An outdoor pick other than None — the agent's, else the source's — says it has outdoor space.
  const outdoor = input.features?.outdoor ?? null;
  const hasOutdoor = outdoor ? outdoor.some((o) => o !== 'None') : cf.outdoor_private?.value === true;
  if (hasOutdoor) {
    contradicted.push({ tag: 'No outdoor space', because: outdoor ? `${outdoor.filter((o) => o !== 'None').join(', ')} picked` : 'the listing names private outdoor space' });
  }

  return { supported, contradicted };
}

/**
 * A comp's tags with what the data settles applied, by the agent's level
 * (NB-9 C): contradicted tags come off for everyone; a full agent gets the
 * supported tags added (a one-choice group's other tag gives way), a practice
 * agent gets them back as suggestions instead. A tag already there is never
 * suggested again. Apply it when the data first settles a comp (Dispatch 20
 * decides when), so a tag the agent removed isn't put back on every render.
 */
export function withDerivedTags(
  tags: readonly string[], derived: DerivedTags, level: 'practice' | 'full',
): { tags: string[]; suggested: DerivedTag[] } {
  const off = new Set<string>(derived.contradicted.map((d) => d.tag));
  let next = tags.filter((t) => !off.has(t));
  const fresh = derived.supported.filter((d) => !next.includes(d.tag) && !off.has(d.tag));
  if (level === 'practice') return { tags: next, suggested: fresh };
  for (const d of fresh) {
    const g = tagGroupOf(d.tag);
    if (g.single) next = next.filter((t) => !(g.tags as readonly string[]).includes(t));
    next = [...next, d.tag];
  }
  return { tags: next, suggested: [] };
}
