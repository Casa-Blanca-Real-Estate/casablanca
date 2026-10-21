// Facts derived from the export's tag columns (§6.2): views, private and
// shared outdoor space (presence only — the export has no outdoor size),
// service level, parking, unit type, the finishes and systems of factor 9,
// and amenities.
//
// A tag column that's blank tells us nothing, so nothing is derived from it
// (unknown). A column with tags but none of a kind — no view listed, no
// parking listed — is "none listed": an empty list, `false` or `none_listed`.
// The parser records it as approximate, because a listing agent types these
// tags and may leave one out, and the agent can correct it.

import type { LaundryState, OutdoorKind, PetsPolicy, ServiceFacts, UnitTypeTag } from '../types.ts';

export function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/\s+/g, ' ').trim();
}

const VIEW = /^(.+?) views?$/;

const PRIVATE_OUTDOOR: [RegExp, OutdoorKind][] = [
  [/\bbalcon(y|ies)\b/, 'balcony'],
  [/\broof ?(deck|top|terrace)\b|\bprivate roof\b/, 'roof_deck'],
  [/\bterrace\b/, 'terrace'],
  [/\bgarden\b/, 'garden'],
  [/\bpatio\b/, 'patio'],
  [/\b(private )?outdoor space\b|\bdeck\b|\bloggia\b/, 'outdoor_space'],
];

const UNIT_TYPE_FEATURES: [RegExp, UnitTypeTag][] = [
  [/^penthouse$/, 'penthouse'],
  [/^duplex$/, 'duplex'],
  [/^triplex$/, 'triplex'],
  [/^loft$/, 'loft'],
];

// Factor 9's yes-or-no systems, as StreetEasy and listings tag them.
const CENTRAL_AIR = /\bcentral (air|a\/?c)\b/;
const DISHWASHER = /\bdish ?washer\b/;
const FIREPLACE = /\bfire ?places?\b/;
/** A decorative fireplace doesn't work: it stays among the other finishes. */
const DECORATIVE = /\bdecorative\b|\bnon[- ]?working\b/;
const WASHER_DRYER = /\bwasher\b|\bw\/d\b|\bin[- ]unit laundry\b|\blaundry in (the )?unit\b/;
/** Laundry in the building or shared isn't in-unit laundry. */
const NOT_IN_UNIT = /\bbuilding\b|\bshared\b|\bcommon\b/;
const ALLOWED = /\b(allowed|permitted)\b/;

export interface FeatureFacts {
  views: string[];
  outdoor_kinds: OutdoorKind[];
  unit_type: UnitTypeTag[];
  central_air: boolean;
  dishwasher: boolean;
  fireplace: boolean;
  /** `installed` for a washer/dryer, `permitted` for "washer/dryer allowed", else `none_listed`. */
  laundry: LaundryState;
  /** The Home Features none of the above claimed — hardwood floors, walk-in closets … */
  finishes: string[];
}

/** Home Features → views, private outdoor kinds, unit type, factor 9's systems and the remaining finishes. */
export function deriveFromFeatures(features: readonly string[]): FeatureFacts {
  const views = new Set<string>();
  const outdoor = new Set<OutdoorKind>();
  const unitType = new Set<UnitTypeTag>();
  const finishes = new Set<string>();
  let centralAir = false;
  let dishwasher = false;
  let fireplace = false;
  let laundry: LaundryState = 'none_listed';
  for (const raw of features) {
    const tag = normalizeTag(raw);
    const view = VIEW.exec(tag);
    if (view) { views.add(view[1]!); continue; }
    const type = UNIT_TYPE_FEATURES.find(([re]) => re.test(tag));
    if (type) { unitType.add(type[1]); continue; }
    const kind = PRIVATE_OUTDOOR.find(([re]) => re.test(tag));
    if (kind) { outdoor.add(kind[1]); continue; }
    if (CENTRAL_AIR.test(tag)) { centralAir = true; continue; }
    if (DISHWASHER.test(tag)) { dishwasher = true; continue; }
    if (FIREPLACE.test(tag) && !DECORATIVE.test(tag)) { fireplace = true; continue; }
    if (WASHER_DRYER.test(tag) && !NOT_IN_UNIT.test(tag)) {
      // Installed outranks allowed, whichever tag comes first.
      if (!ALLOWED.test(tag)) laundry = 'installed';
      else if (laundry !== 'installed') laundry = 'permitted';
      continue;
    }
    finishes.add(tag);
  }
  return {
    views: [...views].sort(),
    outdoor_kinds: [...outdoor].sort(),
    unit_type: [...unitType].sort(),
    central_air: centralAir,
    dishwasher,
    fireplace,
    laundry,
    finishes: [...finishes].sort(),
  };
}

const SHARED_OUTDOOR = /\bshared outdoor space\b|\broof ?(deck|top|terrace)\b|\bgarden\b|\bcourtyard\b|\bterrace\b|\boutdoor space\b|\bsun ?deck\b/;
const PARKING = /\bparking\b|\bgarage\b/;

/** A parking tag's kind — "Valet parking" → valet — or null if it isn't about parking. */
export function parkingKind(tag: string): string | null {
  const t = normalizeTag(tag);
  if (!PARKING.test(t)) return null;
  return /\bvalet\b/.test(t) ? 'valet' : /\bdeeded\b/.test(t) ? 'deeded' : /\bgarage\b/.test(t) ? 'garage' : 'parking';
}

/** "City view", "city views", "City" → "city". */
export function viewKind(tag: string): string {
  const t = normalizeTag(tag);
  return VIEW.exec(t)?.[1] ?? t;
}

export interface AmenityFacts {
  service: ServiceFacts;
  parking: string[];
  outdoor_shared: boolean;
  /** Amenities not claimed by service level, parking or shared outdoor space. */
  amenities: string[];
}

/** Building Amenities → service level, parking, shared outdoor space and the other amenities. */
export function deriveFromAmenities(amenities: readonly string[]): AmenityFacts {
  let doorman: ServiceFacts['doorman'] = 'none_listed';
  let concierge = false;
  const parking = new Set<string>();
  let outdoorShared = false;
  const rest = new Set<string>();
  const rank: Record<ServiceFacts['doorman'], number> = {
    none_listed: 0, virtual: 1, part_time: 2, hours_unspecified: 3, full_time: 4,
  };
  const setDoorman = (level: ServiceFacts['doorman']) => {
    if (rank[level] > rank[doorman]) doorman = level;
  };
  for (const raw of amenities) {
    const tag = normalizeTag(raw);
    if (/\bconcierge\b/.test(tag)) { concierge = true; continue; }
    if (/\bdoor ?(man|men|person|attendant)\b/.test(tag)) {
      if (/\bfull[- ]time\b|\b24[- /]?(hour|hr|7)\b/.test(tag)) setDoorman('full_time');
      else if (/\bpart[- ]time\b/.test(tag)) setDoorman('part_time');
      else if (/\bvirtual\b/.test(tag)) setDoorman('virtual');
      else setDoorman('hours_unspecified');
      continue;
    }
    if (/\bvirtual doorman\b|\bintercom\b/.test(tag) && /virtual/.test(tag)) { setDoorman('virtual'); continue; }
    const kind = parkingKind(tag);
    if (kind) { parking.add(kind); continue; }
    if (SHARED_OUTDOOR.test(tag)) { outdoorShared = true; continue; }
    rest.add(tag);
  }
  return {
    service: { doorman, concierge },
    parking: [...parking].sort(),
    outdoor_shared: outdoorShared,
    amenities: [...rest].sort(),
  };
}

export interface PolicyFacts {
  /** `allowed` when a tag says pets (or cats, or dogs) are allowed; otherwise `not_listed`, never "no pets". */
  pets: PetsPolicy;
  /** True when a tag says smoke-free; false means none says so. */
  smoke_free: boolean;
}

const PETS_ALLOWED = /\bpets?\b.*\b(allowed|ok|okay|welcome|permitted|friendly)\b|\bpet[- ]friendly\b|\b(cats?|dogs?)\b.*\b(allowed|ok|okay|welcome|permitted)\b/;
const NOT = /\bno\b|\bnot\b/;
const SMOKE_FREE = /\bsmoke[- ]?free\b|\bno smoking\b|\bnon[- ]?smoking\b/;

/** Building Policies → pets and smoke-free. Policies say what's allowed; a missing tag only says nothing. */
export function deriveFromPolicies(policies: readonly string[]): PolicyFacts {
  let pets: PetsPolicy = 'not_listed';
  let smokeFree = false;
  for (const raw of policies) {
    const tag = normalizeTag(raw);
    if (PETS_ALLOWED.test(tag) && !NOT.test(tag)) pets = 'allowed';
    if (SMOKE_FREE.test(tag)) smokeFree = true;
  }
  return { pets, smoke_free: smokeFree };
}

/** "PHA", "PH-2" → looks like a penthouse. Inferred, so the agent confirms it. */
export function unitLabelSuggestsPenthouse(unit: string | null): boolean {
  return unit !== null && /^PH/i.test(unit.replace(/^#/, '').trim());
}

/**
 * The floor a unit label reads as, where it reads cleanly: "10A" → 10,
 * "10-B" → 10, "1004" → 10, "504" → 5. Null for anything else — "G", "R1",
 * "PHA", a bare letter or a bare one- or two-digit number, which could be a
 * floor or a door. A guess, so the caller records it as inferred.
 */
export function floorFromUnitLabel(unit: string | null): number | null {
  if (unit === null) return null;
  const label = unit.trim().replace(/^#\s*/, '').replace(/^(apt|apartment|unit)\.?\s*#?\s*/i, '').toUpperCase();
  const lettered = /^([1-9]\d?)[-\s]?[A-Z]{1,2}$/.exec(label);
  if (lettered) return Number(lettered[1]);
  const numbered = /^([1-9]\d?)\d{2}$/.exec(label);
  if (numbered) return Number(numbered[1]);
  return null;
}
