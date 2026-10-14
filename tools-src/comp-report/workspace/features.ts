// The handoff's tags and feature pickers (docs/comp-report/design-port/, Dispatch
// 14): shared by the home (New report 2 of 3, Edit details) and every comp (the
// add form, Sort's card). Plain data, like the engine, for the browser and the
// server alike.
//
// The home's features live in its intake, where the engine already reads the
// ones it compares (outdoor space, views); a comp's live on the comp
// (report_comps.features). Tags are the agent's: Hubert never picks them.
import type { CompRecord } from '../engine/index.ts';
import type { Condition, Intake, OutdoorChoice } from './state.ts';

/** The handoff's tag list, in its order (the prototype's TAGS). */
export const TAGS = [
  'Same building', 'Same area', 'Same layout', 'Similar size', 'Similar floor', 'Full service', 'Smaller', 'Bigger',
  'Much smaller', 'Much bigger', 'Lower floor', 'Higher floor', 'First floor', 'No outdoor space', 'Renovated',
  'Water views', 'New development', '6+ months',
] as const;
export type Tag = (typeof TAGS)[number];

export function isTag(t: unknown): t is Tag {
  return typeof t === 'string' && (TAGS as readonly string[]).includes(t);
}

export type FeatureKey = 'outdoor' | 'views' | 'exposure' | 'condition' | 'building';

export interface FeatureGroup {
  key: FeatureKey;
  label: string;
  options: readonly string[];
  /** One choice (Outdoor space, Unit condition) or several. */
  single: boolean;
}

/** The pickers, in the handoff's order (the prototype's FEAT). */
export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  { key: 'outdoor', label: 'Outdoor space', options: ['None', 'Balcony', 'Terrace', 'Private roof'], single: true },
  { key: 'views', label: 'Views', options: ['Water', 'City', 'Open', 'Partial', 'Courtyard'], single: false },
  { key: 'exposure', label: 'Exposure', options: ['North', 'South', 'East', 'West'], single: false },
  { key: 'condition', label: 'Unit condition', options: ['Original', 'Updated', 'Renovated', 'Mint'], single: true },
  { key: 'building', label: 'Building', options: ['Doorman', 'Gym', 'Pool', 'Storage', 'Parking', 'Roof deck'], single: false },
];

/** A home's or a comp's features: each group's chosen options, by label. A group not given is unknown. */
export type Features = Partial<Record<FeatureKey, string[]>>;

/** Only known groups and options, each once, single groups at most one: what's stored. */
export function cleanFeatures(raw: unknown): Features {
  const out: Features = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const g of FEATURE_GROUPS) {
    const v = (raw as Record<string, unknown>)[g.key];
    if (!Array.isArray(v)) continue;
    const picked = g.options.filter((o) => v.includes(o));
    out[g.key] = g.single ? picked.slice(0, 1) : picked;
  }
  return out;
}

/** Toggles one option: a single group switches to it (or clears it), a multi group adds or removes it. */
export function toggleFeature(f: Features, key: FeatureKey, option: string): Features {
  const g = FEATURE_GROUPS.find((x) => x.key === key)!;
  const cur = f[key] ?? [];
  const on = cur.includes(option);
  const next = g.single ? (on ? [] : [option]) : on ? cur.filter((o) => o !== option) : [...cur, option];
  return { ...f, [key]: next };
}

/** How many of a comp's features the home has too: "8 shared with 17L". */
export function sharedCount(home: Features, comp: Features): number {
  return FEATURE_GROUPS.reduce((n, g) => n + (comp[g.key] ?? []).filter((o) => (home[g.key] ?? []).includes(o)).length, 0);
}

// ─── The home's features, in its intake ─────────────────────────────────────

const OUTDOOR_TO_LABEL: Record<string, string> = { none: 'None', balcony: 'Balcony', terrace: 'Terrace', roof_deck: 'Private roof' };
const LABEL_TO_OUTDOOR: Record<string, OutdoorChoice> = { None: 'none', Balcony: 'balcony', Terrace: 'terrace', 'Private roof': 'roof_deck' };
const CONDITION_TO_LABEL: Record<string, string> = { original: 'Original', updated: 'Updated', renovated: 'Renovated', mint: 'Mint', good: 'Updated', needs_work: 'Original' };
const LABEL_TO_CONDITION: Record<string, Condition> = { Original: 'original', Updated: 'updated', Renovated: 'renovated', Mint: 'mint' };

/** The home's features from its intake (older reports' exposure was one line of text). */
export function homeFeatures(intake: Intake | undefined): Features {
  const i = intake ?? {};
  const out: Features = {};
  if (i.outdoorKind) out.outdoor = OUTDOOR_TO_LABEL[i.outdoorKind.value] ? [OUTDOOR_TO_LABEL[i.outdoorKind.value]!] : [];
  if (i.views) out.views = FEATURE_GROUPS[1]!.options.filter((o) => i.views!.value.some((v) => v.toLowerCase() === o.toLowerCase()));
  if (i.exposures) out.exposure = i.exposures.value.filter((v) => FEATURE_GROUPS[2]!.options.includes(v));
  else if (i.exposure) out.exposure = FEATURE_GROUPS[2]!.options.filter((o) => new RegExp(`\\b${o}\\b`, 'i').test(i.exposure!.value));
  if (i.condition) out.condition = CONDITION_TO_LABEL[i.condition.value] ? [CONDITION_TO_LABEL[i.condition.value]!] : [];
  if (i.building) out.building = i.building.value.filter((v) => FEATURE_GROUPS[4]!.options.includes(v));
  return out;
}

/** The intake with the home's features set from the pickers: the engine reads outdoor space and views from it. */
export function withHomeFeatures(intake: Intake, f: Features, asOf: string): Intake {
  const next: Intake = { ...intake };
  const set = <K extends keyof Intake>(k: K, v: Intake[K] | undefined) => {
    if (v === undefined) delete next[k];
    else next[k] = v;
  };
  const entry = <T,>(value: T) => ({ value, asOf });
  if (f.outdoor !== undefined) set('outdoorKind', f.outdoor[0] ? entry(LABEL_TO_OUTDOOR[f.outdoor[0]]!) : undefined);
  if (f.views !== undefined) set('views', f.views.length ? entry(f.views) : undefined);
  if (f.exposure !== undefined) {
    set('exposures', f.exposure.length ? entry(f.exposure) : undefined);
    delete next.exposure;
  }
  if (f.condition !== undefined) set('condition', f.condition[0] ? entry(LABEL_TO_CONDITION[f.condition[0]]!) : undefined);
  if (f.building !== undefined) set('building', f.building.length ? entry(f.building) : undefined);
  return next;
}

/**
 * A comp's features as its source gives them, before the agent says otherwise:
 * outdoor space, views and a doorman, from the export or the listing page.
 */
export function featuresFromRecord(record: CompRecord): Features {
  const f = record.facts;
  const out: Features = {};
  if (f.outdoor_private?.value === false) out.outdoor = ['None'];
  else if (f.outdoor_kinds?.value.length) {
    const k = f.outdoor_kinds.value[0]!;
    out.outdoor = [OUTDOOR_TO_LABEL[k] ?? (k === 'roof_deck' ? 'Private roof' : 'Terrace')];
  }
  if (f.views?.value.length) {
    const views = FEATURE_GROUPS[1]!.options.filter((o) => f.views!.value.some((v) => v.toLowerCase().includes(o.toLowerCase())));
    if (views.length) out.views = views;
  }
  const doorman = f.service?.value.doorman;
  if (doorman && doorman !== 'none_listed') out.building = ['Doorman'];
  return out;
}
