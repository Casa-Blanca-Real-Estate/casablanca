// The handoff's tags and feature pickers (docs/comp-report/design-port/, Dispatch
// 14): shared by the home (New report 2 of 3, Edit details) and every comp (the
// add form, Sort's card). Plain data, like the engine, for the browser and the
// server alike.
//
// The home's features live in its intake, where the engine already reads the
// ones it compares (outdoor space, views); a comp's live on the comp
// (report_comps.features). Tags are the agent's: Hubert never picks them.
//
// Dispatch 16 (NW-008 a, NW-009 a, NW-010, NW-011, NW-012, NW-039 a, NW-045)
// gave the pickers StreetEasy's vocabulary: the building's amenities in its
// categories, policies, each group marked unit or building with the types it
// applies to, and the tags in groups. Additive only: every option label and
// tag string stored before stays valid, because cleanFeatures drops unknown
// labels and the server refuses unknown tags.
import type { CompRecord, PropertyType, ReportPropertyType } from '../engine/index.ts';
import { deriveFromPolicies, normalizeTag, parkingKind } from '../engine/index.ts';
import type { Condition, Intake, OutdoorChoice } from './state.ts';

// ─── Tags ───────────────────────────────────────────────────────────────────

/** The handoff's tag list, in its order (the prototype's TAGS), then the ones NW-045 added. */
export const TAGS = [
  'Same building', 'Same area', 'Same layout', 'Similar size', 'Similar floor', 'Full service', 'Smaller', 'Bigger',
  'Much smaller', 'Much bigger', 'Lower floor', 'Higher floor', 'First floor', 'No outdoor space', 'Renovated',
  'Water views', 'New development', '6+ months',
  'Penthouse', 'One floor', 'Two floors', 'Three floors',
] as const;
export type Tag = (typeof TAGS)[number];

export function isTag(t: unknown): t is Tag {
  return typeof t === 'string' && (TAGS as readonly string[]).includes(t);
}

export interface TagGroup {
  key: 'similarities' | 'size' | 'floor' | 'multi_floor' | 'differences';
  label: string;
  tags: readonly Tag[];
  /** One choice (Size, Multi-floor) or several. */
  single: boolean;
  /** The tags are a scale, low to high (Size): show them in this order. */
  ordered: boolean;
}

/**
 * The tags by kind (NW-045): Kimani's four groups, with the six tags they left
 * out placed per the recommendation (Full service, Renovated, Water views and
 * New development under Similarities; No outdoor space and 6+ months under
 * Differences). Every tag is in exactly one group.
 */
export const TAG_GROUPS: readonly TagGroup[] = [
  {
    key: 'similarities', label: 'Similarities', single: false, ordered: false,
    tags: ['Same building', 'Same area', 'Same layout', 'Full service', 'Renovated', 'Water views', 'New development'],
  },
  { key: 'size', label: 'Size', single: true, ordered: true, tags: ['Much smaller', 'Smaller', 'Similar size', 'Bigger', 'Much bigger'] },
  { key: 'floor', label: 'Floor', single: false, ordered: false, tags: ['Lower floor', 'Similar floor', 'Higher floor', 'First floor', 'Penthouse'] },
  { key: 'multi_floor', label: 'Multi-floor', single: true, ordered: true, tags: ['One floor', 'Two floors', 'Three floors'] },
  { key: 'differences', label: 'Differences', single: false, ordered: false, tags: ['No outdoor space', '6+ months'] },
];

/** The group a tag is in. */
export function tagGroupOf(tag: Tag): TagGroup {
  return TAG_GROUPS.find((g) => g.tags.includes(tag))!;
}

/** Toggles one tag: in a one-choice group (Size, Multi-floor) it replaces the group's other tag. */
export function toggleTag(tags: readonly string[], tag: Tag): string[] {
  if (tags.includes(tag)) return tags.filter((t) => t !== tag);
  const g = tagGroupOf(tag);
  const kept = g.single ? tags.filter((t) => !(g.tags as readonly string[]).includes(t)) : [...tags];
  return [...kept, tag];
}

// ─── Feature groups ─────────────────────────────────────────────────────────

export type FeatureKey =
  | 'outdoor' | 'views' | 'exposure' | 'condition' | 'corner'
  | 'building' | 'wellness' | 'shared_outdoor' | 'policies';

/** Apartments: the types with a building around the unit. A townhouse or a house has no concierge. */
const APARTMENT: readonly PropertyType[] = ['condo', 'coop', 'condop'];

export interface FeatureGroup {
  key: FeatureKey;
  label: string;
  options: readonly string[];
  /** One choice (Private outdoor space, Unit condition) or several. */
  single: boolean;
  /** The home itself, or the building it's in (NW-039 a). */
  scope: 'unit' | 'building';
  /** The property types it applies to; absent, every type. */
  types?: readonly PropertyType[];
  /** Options that apply to fewer types than their group. */
  optionTypes?: Readonly<Record<string, readonly PropertyType[]>>;
}

/**
 * The pickers: the home's groups, then the building's in StreetEasy's
 * categories (07-streeteasy-taxonomy.md), then policies. The building's lists
 * are provisional until Dispatch 17 confirms StreetEasy's own; adding to them
 * is safe, renaming is not.
 */
export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  { key: 'outdoor', label: 'Private outdoor space', options: ['None', 'Balcony', 'Terrace', 'Private roof', 'Garden', 'Patio'], single: true, scope: 'unit' },
  { key: 'views', label: 'Views', options: ['Water', 'City', 'Open', 'Partial', 'Courtyard'], single: false, scope: 'unit' },
  { key: 'exposure', label: 'Exposure', options: ['North', 'South', 'East', 'West'], single: false, scope: 'unit' },
  { key: 'condition', label: 'Unit condition', options: ['Needs work', 'Original', 'Good', 'Updated', 'Renovated', 'Mint'], single: true, scope: 'unit' },
  { key: 'corner', label: 'Corner', options: ['Corner unit'], single: false, scope: 'unit', types: APARTMENT },
  {
    key: 'building', label: 'Services and facilities', single: false, scope: 'building',
    options: ['Doorman', 'Concierge', 'Elevator', 'Live-in super', 'Package room', 'Laundry in building', 'Bike room', 'Storage', 'Parking', 'Wheelchair access'],
    optionTypes: Object.fromEntries(
      ['Doorman', 'Concierge', 'Live-in super', 'Package room', 'Laundry in building', 'Bike room'].map((o) => [o, APARTMENT]),
    ),
  },
  { key: 'wellness', label: 'Wellness and recreation', options: ['Gym', 'Pool', 'Hot tub', "Children's playroom", 'Media room'], single: false, scope: 'building', types: APARTMENT },
  { key: 'shared_outdoor', label: 'Shared outdoor space', options: ['Roof deck', 'Courtyard', 'Garden', 'Terrace', 'Patio', 'Deck', 'Other'], single: false, scope: 'building', types: APARTMENT },
  {
    key: 'policies', label: 'Policies', single: false, scope: 'building', types: APARTMENT,
    options: ['Pets allowed', 'Smoke-free', 'Pied-à-terre allowed', 'Sublets allowed', 'Guarantors accepted', 'Co-purchasing allowed', 'Gifting allowed', 'Parents buying allowed'],
  },
];

const GROUP = Object.fromEntries(FEATURE_GROUPS.map((g) => [g.key, g])) as Record<FeatureKey, FeatureGroup>;

/** The groups the home's intake keeps in `building`: their labels don't repeat across them. */
const BUILDING_KEYS = ['building', 'wellness', 'shared_outdoor'] as const;

/**
 * The groups and options for a property type (NW-039 a): no concierge, gym or
 * policies for a townhouse or a house. An unknown type, or `other`, sees them all.
 */
export function groupsFor(type: PropertyType | null | undefined): FeatureGroup[] {
  if (!type || type === 'other') return [...FEATURE_GROUPS];
  return FEATURE_GROUPS.filter((g) => !g.types || g.types.includes(type)).map((g) => {
    if (!g.optionTypes) return g;
    const options = g.options.filter((o) => !g.optionTypes![o] || g.optionTypes![o]!.includes(type));
    return { ...g, options };
  });
}

/** A home's or a comp's features: each group's chosen options, by label. A group not given is unknown. */
export type Features = Partial<Record<FeatureKey, string[]>>;

/**
 * Options the handoff kept under Building that now sit in their own category.
 * A comp stored before Dispatch 16 with `building: ['Gym']` reads as Wellness.
 */
const MOVED_FROM_BUILDING: Readonly<Record<string, FeatureKey>> = { Gym: 'wellness', Pool: 'wellness', 'Roof deck': 'shared_outdoor' };

/** Only known groups and options, each once, single groups at most one: what's stored. */
export function cleanFeatures(raw: unknown): Features {
  const out: Features = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const given = (key: FeatureKey): unknown[] | undefined => {
    const v = (raw as Record<string, unknown>)[key];
    return Array.isArray(v) ? v : undefined;
  };
  const moved = (given('building') ?? []).filter((o): o is string => typeof o === 'string' && o in MOVED_FROM_BUILDING);
  for (const g of FEATURE_GROUPS) {
    const v = given(g.key);
    const extra = moved.filter((o) => MOVED_FROM_BUILDING[o] === g.key);
    if (!v && extra.length === 0) continue;
    const picked = g.options.filter((o) => (v ?? []).includes(o) || extra.includes(o));
    out[g.key] = g.single ? picked.slice(0, 1) : picked;
  }
  return out;
}

/** Toggles one option: a single group switches to it (or clears it), a multi group adds or removes it. */
export function toggleFeature(f: Features, key: FeatureKey, option: string): Features {
  const g = GROUP[key];
  const cur = f[key] ?? [];
  const on = cur.includes(option);
  const next = g.single ? (on ? [] : [option]) : on ? cur.filter((o) => o !== option) : [...cur, option];
  return { ...f, [key]: next };
}

/** How many of a comp's features the home has too: "8 shared with 17L". */
export function sharedCount(home: Features, comp: Features): number {
  return FEATURE_GROUPS.reduce((n, g) => n + (comp[g.key] ?? []).filter((o) => (home[g.key] ?? []).includes(o)).length, 0);
}

// ─── Condition (NW-012) ─────────────────────────────────────────────────────

/** The ⓘ beside the condition scale. "Good" is NB-4's recommended word (not "Well kept"). */
export const CONDITION_INFO = 'Original: never redone, as built. Good: well kept, not redone. Needs work: dated or worn, a fixer-upper or gut.';

const CONDITION_TO_LABEL: Record<Condition, string> = {
  needs_work: 'Needs work', original: 'Original', good: 'Good', updated: 'Updated', renovated: 'Renovated', mint: 'Mint',
};
const LABEL_TO_CONDITION = Object.fromEntries(Object.entries(CONDITION_TO_LABEL).map(([k, v]) => [v, k])) as Record<string, Condition>;

// ─── What the tags say ──────────────────────────────────────────────────────

/** Not a claim that something is there: "No sublets", "Not allowed". */
const NEGATED = /\bno\b|\bnot\b|\bnone\b/;

/** Each building option from StreetEasy's amenity tags, first match wins (07-streeteasy-taxonomy.md). */
const AMENITY_OPTIONS: readonly [FeatureKey, string, RegExp][] = [
  ['building', 'Doorman', /\bdoor ?(man|men|person|attendant)\b/],
  ['building', 'Concierge', /\bconcierge\b/],
  ['building', 'Elevator', /\belevators?\b/],
  ['building', 'Live-in super', /\blive[- ]?in super/],
  ['building', 'Package room', /\bpackage\b/],
  ['building', 'Laundry in building', /\blaundry\b/],
  ['building', 'Bike room', /\b(bike|bicycle)\b/],
  ['building', 'Storage', /\bstorage\b|\blocker\b|\bcage\b/],
  ['building', 'Wheelchair access', /\bwheelchair\b|\baccessib/],
  ['wellness', 'Gym', /\bgym\b|\bfitness\b/],
  ['wellness', 'Pool', /\bpool\b/],
  ['wellness', 'Hot tub', /\bhot tub\b|\bjacuzzi\b/],
  ['wellness', "Children's playroom", /\bplay ?room\b|\bchildren'?s? (room|play)/],
  ['wellness', 'Media room', /\bmedia room\b|\bscreening room\b|\btheat(er|re)\b/],
  ['shared_outdoor', 'Roof deck', /\broof ?(deck|top|terrace|garden)?\b/],
  ['shared_outdoor', 'Courtyard', /\bcourtyard\b/],
  ['shared_outdoor', 'Garden', /\bgarden\b/],
  ['shared_outdoor', 'Terrace', /\bterrace\b/],
  ['shared_outdoor', 'Patio', /\bpatio\b/],
  ['shared_outdoor', 'Deck', /\bdeck\b/],
  ['shared_outdoor', 'Other', /\boutdoor\b/],
];

/** The co-op and condo policies StreetEasy tags, beyond pets and smoking (NW-010). */
const POLICY_OPTIONS: readonly [string, RegExp][] = [
  ['Pied-à-terre allowed', /\bpied[- ]?(a|à)[- ]?terre\b/],
  ['Sublets allowed', /\bsublet/],
  ['Guarantors accepted', /\bguarantors?\b/],
  ['Co-purchasing allowed', /\bco-?purchas/],
  ['Gifting allowed', /\bgift/],
  ['Parents buying allowed', /\bparents?\b/],
];

/** The building groups and policies a listing's raw tags fill. A group the tags don't touch is left out. */
function featuresFromTags(tags: CompRecord['tags']): Features {
  const out: Features = {};
  const add = (key: FeatureKey, option: string) => {
    const cur = out[key] ?? [];
    if (!cur.includes(option)) out[key] = [...cur, option];
  };
  for (const raw of tags.amenities) {
    const tag = normalizeTag(raw);
    if (parkingKind(tag)) { add('building', 'Parking'); continue; }
    if (NEGATED.test(tag)) continue;
    const hit = AMENITY_OPTIONS.find(([, , re]) => re.test(tag));
    if (hit) add(hit[0], hit[1]);
  }
  if (tags.policies.length > 0) {
    const p = deriveFromPolicies(tags.policies);
    if (p.pets === 'allowed') add('policies', 'Pets allowed');
    if (p.smoke_free) add('policies', 'Smoke-free');
    for (const raw of tags.policies) {
      const tag = normalizeTag(raw);
      if (NEGATED.test(tag)) continue;
      const hit = POLICY_OPTIONS.find(([, re]) => re.test(tag));
      if (hit) add('policies', hit[0]);
    }
  }
  if (tags.features.some((t) => /\bcorner\b/.test(normalizeTag(t)) && !NEGATED.test(normalizeTag(t)))) add('corner', 'Corner unit');
  // In each group's own order, so a filled picker reads like a picked one.
  for (const key of Object.keys(out) as FeatureKey[]) out[key] = GROUP[key].options.filter((o) => out[key]!.includes(o));
  return out;
}

// ─── The home's features, in its intake ─────────────────────────────────────

const OUTDOOR_TO_LABEL: Record<string, string> = {
  none: 'None', balcony: 'Balcony', terrace: 'Terrace', roof_deck: 'Private roof', garden: 'Garden', patio: 'Patio',
};
const LABEL_TO_OUTDOOR: Record<string, OutdoorChoice> = {
  None: 'none', Balcony: 'balcony', Terrace: 'terrace', 'Private roof': 'roof_deck', Garden: 'garden', Patio: 'patio',
};

/** The home's features from its intake (older reports' exposure was one line of text). */
export function homeFeatures(intake: Intake | undefined): Features {
  const i = intake ?? {};
  const out: Features = {};
  if (i.outdoorKind) out.outdoor = OUTDOOR_TO_LABEL[i.outdoorKind.value] ? [OUTDOOR_TO_LABEL[i.outdoorKind.value]!] : [];
  if (i.views) out.views = GROUP.views.options.filter((o) => i.views!.value.some((v) => v.toLowerCase() === o.toLowerCase()));
  if (i.exposures) out.exposure = i.exposures.value.filter((v) => GROUP.exposure.options.includes(v));
  else if (i.exposure) out.exposure = GROUP.exposure.options.filter((o) => new RegExp(`\\b${o}\\b`, 'i').test(i.exposure!.value));
  if (i.condition) out.condition = CONDITION_TO_LABEL[i.condition.value] ? [CONDITION_TO_LABEL[i.condition.value]] : [];
  if (i.corner) out.corner = i.corner.value ? ['Corner unit'] : [];
  if (i.building) {
    const picked = i.building.value;
    for (const key of BUILDING_KEYS) out[key] = GROUP[key].options.filter((o) => picked.includes(o));
  }
  if (i.policies) out.policies = GROUP.policies.options.filter((o) => i.policies!.value.includes(o));
  return out;
}

/**
 * The intake with the home's features set from the pickers: the engine reads
 * outdoor space and views from it. Only the groups the agent changed are
 * written, so what the pickers can't show (a river view read from the listing)
 * stays as it was; a changed Views group keeps the views the pickers don't
 * offer.
 */
export function withHomeFeatures(intake: Intake, f: Features, asOf: string): Intake {
  const was = homeFeatures(intake);
  const changed = (k: FeatureKey) => {
    const a = f[k];
    if (a === undefined) return false;
    const b = was[k] ?? [];
    return a.length !== b.length || a.some((x) => !b.includes(x));
  };
  const next: Intake = { ...intake };
  const set = <K extends keyof Intake>(k: K, v: Intake[K] | undefined) => {
    if (v === undefined) delete next[k];
    else next[k] = v;
  };
  const entry = <T,>(value: T) => ({ value, asOf });
  if (changed('outdoor')) set('outdoorKind', f.outdoor![0] ? entry(LABEL_TO_OUTDOOR[f.outdoor![0]]!) : undefined);
  if (changed('views')) {
    const offered = GROUP.views.options.map((o) => o.toLowerCase());
    const others = (intake.views?.value ?? []).filter((v) => !offered.includes(v.toLowerCase()));
    const views = [...others, ...f.views!];
    set('views', views.length ? entry(views) : undefined);
  }
  if (changed('exposure')) {
    set('exposures', f.exposure!.length ? entry(f.exposure!) : undefined);
    delete next.exposure;
  }
  if (changed('condition')) set('condition', f.condition![0] ? entry(LABEL_TO_CONDITION[f.condition![0]]!) : undefined);
  if (changed('corner')) set('corner', f.corner!.length ? entry(true) : undefined);
  if (BUILDING_KEYS.some(changed)) {
    const all = BUILDING_KEYS.flatMap((k) => f[k] ?? was[k] ?? []);
    set('building', all.length ? entry(all) : undefined);
  }
  if (changed('policies')) set('policies', f.policies!.length ? entry(f.policies!) : undefined);
  return next;
}

/**
 * The building's features and policies a listing's tags give the home's
 * intake (`building`, `policies`) and whether it's a corner unit, by label.
 * Only what a tag says: nothing is set from a tag that isn't there.
 */
export function intakeFeaturesFromRecord(record: CompRecord): { building: string[]; policies: string[]; corner: boolean } {
  const f = featuresFromRecord(record);
  return {
    building: BUILDING_KEYS.flatMap((k) => f[k] ?? []),
    policies: f.policies ?? [],
    corner: Boolean(f.corner?.length),
  };
}

/**
 * A comp's features as its source gives them, before the agent says otherwise
 * (NW-011): private outdoor space and views from its facts, the building's
 * services, wellness, shared outdoor space and policies, and a corner unit,
 * from its raw tags — on every record, so stored comps fill without a re-read.
 * Condition and exposure aren't tags: they stay the agent's.
 */
export function featuresFromRecord(record: CompRecord): Features {
  const f = record.facts;
  const out: Features = featuresFromTags(record.tags ?? { features: [], amenities: [], policies: [] });
  if (f.outdoor_private?.value === false) out.outdoor = ['None'];
  else if (f.outdoor_kinds?.value.length) {
    const k = f.outdoor_kinds.value[0]!;
    out.outdoor = [OUTDOOR_TO_LABEL[k] ?? 'Terrace'];
  }
  if (f.views?.value.length) {
    const views = GROUP.views.options.filter((o) => f.views!.value.some((v) => v.toLowerCase().includes(o.toLowerCase())));
    if (views.length) out.views = views;
  }
  // The engine's reading of door service — "virtual doorman" included — where the tags give one.
  const doorman = f.service?.value.doorman;
  if (doorman && doorman !== 'none_listed' && !out.building?.includes('Doorman')) {
    out.building = GROUP.building.options.filter((o) => o === 'Doorman' || out.building?.includes(o));
  }
  return out;
}

// ─── The page's type (NW-011) ───────────────────────────────────────────────

export interface PageType {
  /** The type as the page reads. */
  value: PropertyType;
  /** The label as shown: "Co-op", "Condop". */
  label: string | null;
  /** The report type it would switch to, where it's one (condo or co-op); else null. */
  asReportType: ReportPropertyType | null;
}

/**
 * The page's type, as data: the read never overwrites the report's type, which
 * the agent picked before the read (and whose default can't be told from a
 * choice). Mason's notice offers a one-tap switch when this differs.
 */
export function typeFromListing(record: CompRecord): PageType | null {
  const t = record.facts.property_type;
  if (!t) return null;
  const label = record.listing?.grey_line?.type ?? null;
  return { value: t.value, label, asReportType: t.value === 'condo' || t.value === 'coop' ? t.value : null };
}
