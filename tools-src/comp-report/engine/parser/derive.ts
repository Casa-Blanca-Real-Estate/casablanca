// Facts derived from the export's tag columns (§6.2): views, private and
// shared outdoor space (presence only — the export has no outdoor size),
// service level, parking, unit type, finishes and amenities.
//
// A tag column that's blank tells us nothing, so nothing is derived from it
// (unknown). A column with tags but none of a kind — no view listed, no
// parking listed — is recorded as "none listed": an empty list or `false`,
// noted as such, which the agent can correct.

import type { OutdoorKind, ServiceFacts, UnitTypeTag } from '../types.ts';

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

export interface FeatureFacts {
  views: string[];
  outdoor_kinds: OutdoorKind[];
  unit_type: UnitTypeTag[];
  finishes: string[];
}

/** Home Features → views, private outdoor kinds, unit type and the remaining finishes. */
export function deriveFromFeatures(features: readonly string[]): FeatureFacts {
  const views = new Set<string>();
  const outdoor = new Set<OutdoorKind>();
  const unitType = new Set<UnitTypeTag>();
  const finishes = new Set<string>();
  for (const raw of features) {
    const tag = normalizeTag(raw);
    const view = VIEW.exec(tag);
    if (view) { views.add(view[1]!); continue; }
    const type = UNIT_TYPE_FEATURES.find(([re]) => re.test(tag));
    if (type) { unitType.add(type[1]); continue; }
    const kind = PRIVATE_OUTDOOR.find(([re]) => re.test(tag));
    if (kind) { outdoor.add(kind[1]); continue; }
    finishes.add(tag);
  }
  return {
    views: [...views].sort(),
    outdoor_kinds: [...outdoor].sort(),
    unit_type: [...unitType].sort(),
    finishes: [...finishes].sort(),
  };
}

const SHARED_OUTDOOR = /\bshared outdoor space\b|\broof ?(deck|top|terrace)\b|\bgarden\b|\bcourtyard\b|\bterrace\b|\boutdoor space\b|\bsun ?deck\b/;
const PARKING = /\bparking\b|\bgarage\b/;

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
    if (PARKING.test(tag)) {
      if (/\bvalet\b/.test(tag)) parking.add('valet');
      else if (/\bdeeded\b/.test(tag)) parking.add('deeded');
      else if (/\bgarage\b/.test(tag)) parking.add('garage');
      else parking.add('parking');
      continue;
    }
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

/** "PHA", "PH-2" → looks like a penthouse. Inferred, so the agent confirms it. */
export function unitLabelSuggestsPenthouse(unit: string | null): boolean {
  return unit !== null && /^PH/i.test(unit.replace(/^#/, '').trim());
}
