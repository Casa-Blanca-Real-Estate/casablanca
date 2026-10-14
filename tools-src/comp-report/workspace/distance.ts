// Distance on Sort (Dispatch 11, §6.10): how far each comp's building is from
// the home's, from each building's mapped location. The engine flags a comp
// past a quarter mile (noted) and half a mile (far); this words the distance
// for every row, flagged or not, from the engine's own `distance_miles`, the
// number its flag measures, so the row and the flag never disagree. Without a
// distance, it says why.
import { sameBuilding, type PropertyIdentity } from '../engine/index.ts';
import type { Location } from './engine-input.ts';

/** What the screens know of a building's lookup. */
export interface Lookup {
  buildingKey: string;
  status: 'pending' | 'matched' | 'refused' | 'failed';
  reason: string | null;
  /** A failure that's tried again when the report next opens. */
  retry: boolean;
}

export type Distance =
  | { kind: 'same_building' }
  /** `home` and `comp`: the geocoder's own address for each building. */
  | { kind: 'miles'; miles: number; label: string; home: string | null; comp: string | null }
  /** `waiting`: a lookup not made or not back yet, so the row waits rather than shows a dash. */
  | { kind: 'unknown'; why: string; waiting: boolean };

/** "0.3 mi"; "under 0.1 mi" next door. */
export function milesLabel(miles: number): string {
  return miles < 0.1 ? 'under 0.1 mi' : `${miles.toFixed(1)} mi`;
}

function whyNot(lookup: Lookup | undefined, whose: 'The home' | 'This building'): Distance {
  if (!lookup) return { kind: 'unknown', why: `${whose} hasn’t been looked up yet.`, waiting: true };
  if (lookup.status === 'pending') return { kind: 'unknown', why: `${whose} is being looked up.`, waiting: true };
  if (lookup.status === 'refused') return { kind: 'unknown', why: `${whose} isn’t mapped: ${lookup.reason ?? 'no match'}.`, waiting: false };
  const again = lookup.retry ? ' It’s tried again when the report next opens.' : '';
  return { kind: 'unknown', why: `${whose} isn’t mapped yet: ${lookup.reason ?? 'the lookup failed'}.${again}`, waiting: false };
}

/**
 * A comp's distance from the home, or why there's none. `miles` is the engine's
 * `distance_miles` for the comp: null when it has none, or no output yet.
 */
export function compDistance(
  home: PropertyIdentity, comp: PropertyIdentity, miles: number | null, locations: ReadonlyMap<string, Location>, lookups: readonly Lookup[],
): Distance {
  if (home.building_key && comp.building_key && sameBuilding(home, comp)) return { kind: 'same_building' };
  const h = home.building_key ? locations.get(home.building_key) : undefined;
  const c = comp.building_key ? locations.get(comp.building_key) : undefined;
  if (miles !== null) return { kind: 'miles', miles, label: milesLabel(miles), home: h?.matched ?? null, comp: c?.matched ?? null };
  if (h && c) return { kind: 'unknown', why: 'The distance isn’t worked out yet.', waiting: true };
  const byKey = new Map(lookups.map((l) => [l.buildingKey, l]));
  if (!home.building_key) return { kind: 'unknown', why: 'The home has no address to map yet.', waiting: false };
  if (!h) return whyNot(byKey.get(home.building_key), 'The home');
  if (!comp.building_key) return { kind: 'unknown', why: 'This comp has no street address to map.', waiting: false };
  return whyNot(byKey.get(comp.building_key), 'This building');
}
