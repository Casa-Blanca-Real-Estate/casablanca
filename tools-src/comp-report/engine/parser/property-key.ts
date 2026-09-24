// The stable property key (§12): normalised address and unit, so the same home
// matches across every import whatever the spelling — "200 Chambers Street
// #10A", "200 CHAMBERS ST., Apt 10-A" — plus the StreetEasy ids where present.
//
// The key is versioned ("pk1") because a change to these rules changes keys;
// a new rule set gets a new prefix rather than silently re-keying records.

import type { PropertyIdentity, StreetEasyRef } from '../types.ts';

export const PROPERTY_KEY_VERSION = 'pk1';

const DIRECTIONALS: Record<string, string> = {
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
};

const ORDINAL_WORDS: Record<string, string> = {
  first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7',
  eighth: '8', ninth: '9', tenth: '10', eleventh: '11', twelfth: '12',
};

const SUFFIXES: Record<string, string> = {
  street: 'st', str: 'st', avenue: 'ave', av: 'ave', aven: 'ave', place: 'pl', road: 'rd',
  drive: 'dr', lane: 'ln', boulevard: 'blvd', blv: 'blvd', terrace: 'ter', court: 'ct',
  square: 'sq', parkway: 'pkwy', pky: 'pkwy', plaza: 'plz', circle: 'cir', alley: 'aly',
  highway: 'hwy', expressway: 'expy', turnpike: 'tpke', saint: 'st',
};

// Official synonyms that StreetEasy and agents both use.
const STREET_ALIASES: Record<string, string> = {
  'avenue of the americas': '6 ave',
};

const CITY_ALIASES: Record<string, string> = {
  manhattan: 'new york', nyc: 'new york', 'new york city': 'new york', 'new york ny': 'new york',
};

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** "200 Chambers Street" → "200 chambers st"; "Fifth Avenue" and "5th Ave" → "5 ave". */
export function normalizeStreet(street: string): string {
  let s = street.toLowerCase().replace(/&/g, ' and ');
  s = s.replace(/[.,'’]/g, '');
  // Keep Queens-style hyphenated house numbers ("37-10"); other hyphens are spaces.
  s = s.replace(/(\d)-(\d)/g, '$1\u0000$2').replace(/-/g, ' ').replace(/\u0000/g, '-');
  s = collapse(s);
  for (const [alias, canonical] of Object.entries(STREET_ALIASES)) {
    s = s.replace(new RegExp(`\\b${alias}\\b`, 'g'), canonical);
  }
  const tokens = s.split(' ').map((token) => {
    if (DIRECTIONALS[token]) return DIRECTIONALS[token]!;
    if (ORDINAL_WORDS[token]) return ORDINAL_WORDS[token]!;
    const ordinal = /^(\d+)(st|nd|rd|th)$/.exec(token);
    if (ordinal) return ordinal[1]!;
    if (SUFFIXES[token]) return SUFFIXES[token]!;
    return token;
  });
  return tokens.join(' ');
}

/** "#10A", "Apt 10-A", "10a" → "10A"; "Penthouse A", "PH-A" → "PHA". Null when blank. */
export function normalizeUnit(unit: string | null | undefined): string | null {
  if (unit === null || unit === undefined) return null;
  let s = unit.trim().toUpperCase();
  s = s.replace(/^(#|APT\.?|APARTMENT|UNIT|SUITE)\s*/, '');
  s = s.replace(/^#/, '');
  s = s.replace(/PENTHOUSE/g, 'PH');
  s = s.replace(/[\s.\-#]/g, '');
  return s === '' ? null : s;
}

export function normalizeCity(city: string | null | undefined): string | null {
  if (!city) return null;
  const s = collapse(city.toLowerCase().replace(/[.,]/g, ''));
  if (s === '') return null;
  return CITY_ALIASES[s] ?? s;
}

export function normalizeState(state: string | null | undefined): string | null {
  if (!state) return null;
  const s = collapse(state.toLowerCase().replace(/\./g, ''));
  if (s === '') return null;
  if (s === 'new york') return 'ny';
  return s;
}

export interface AddressParts {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  /** A unit found inside the street line ("100 Barclay St #17L"). */
  unit_in_street: string | null;
}

/** "200 Chambers Street, New York, NY 10007" → its parts. */
export function parseAddressLine(line: string | null | undefined): AddressParts {
  const empty: AddressParts = { street: null, city: null, state: null, zip: null, unit_in_street: null };
  if (!line || line.trim() === '') return empty;
  const parts = line.split(',').map((p) => p.trim()).filter((p) => p !== '');
  if (parts.length === 0) return empty;
  let street = parts[0]!;
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;
  const rest = parts.slice(1);
  const last = rest[rest.length - 1];
  const stateZip = last ? /^([A-Za-z]{2}|New York)(?:\s+(\d{5})(?:-\d{4})?)?$/i.exec(last) : null;
  if (stateZip) {
    state = stateZip[1]!;
    zip = stateZip[2] ?? null;
    rest.pop();
  }
  if (rest.length > 0) city = rest.join(', ');
  let unit_in_street: string | null = null;
  const unitMatch = /\s+((?:#|apt\.?\s|apartment\s|unit\s)\s*[\w-]+)$/i.exec(street);
  if (unitMatch) {
    unit_in_street = unitMatch[1]!;
    street = street.slice(0, unitMatch.index).trim();
  }
  return { street, city, state, zip, unit_in_street };
}

/** A StreetEasy URL, canonicalised (no query or fragment) and classified. */
export function parseStreetEasyUrl(raw: string | null | undefined): StreetEasyRef | null {
  if (!raw || raw.trim() === '') return null;
  const match = /^(https?):\/\/([^/?#]+)([^?#]*)/i.exec(raw.trim());
  if (!match) return null;
  const host = match[2]!.toLowerCase();
  const path = match[3]!.replace(/\/+$/, '');
  const isStreetEasy = host === 'streeteasy.com' || host === 'www.streeteasy.com';
  const url = `https://${isStreetEasy ? 'streeteasy.com' : host}${path}`;
  const ref: StreetEasyRef = {
    url, kind: 'other', listing_id: null, closing_id: null, building_slug: null, unit_slug: null,
  };
  if (!isStreetEasy) return ref;
  const segments = path.split('/').filter((s) => s !== '');
  const [first, second, third] = segments;
  if (first === 'closing' && second && /^\d+$/.test(second)) {
    ref.kind = 'closing';
    ref.closing_id = second;
  } else if (first === 'sale' && second && /^\d+$/.test(second)) {
    ref.kind = 'sale';
    ref.listing_id = second;
  } else if (first === 'rental' && second) {
    ref.kind = 'rental';
  } else if (first === 'building' && second) {
    ref.building_slug = second.toLowerCase();
    if (third) {
      ref.kind = 'building_unit';
      ref.unit_slug = third.toLowerCase();
    } else {
      ref.kind = 'building';
    }
  }
  return ref;
}

export interface IdentityInput {
  /** The unit's address line, e.g. "200 Chambers Street, New York, NY". */
  address?: string | null;
  unit?: string | null;
  url?: string | null;
  /** The building's address line — the export's carries the ZIP. */
  building_address?: string | null;
}

/** Builds a property's identity and stable key from whatever address data there is. */
export function identify(input: IdentityInput): PropertyIdentity {
  const parts = parseAddressLine(input.address);
  const building = parseAddressLine(input.building_address);
  const street = parts.street ?? building.street;
  const city = parts.city ?? building.city;
  const state = parts.state ?? building.state;
  const normalizedStreet = street ? normalizeStreet(street) : null;
  // Only borrow the building's ZIP when it's the same street.
  const zip = parts.zip ??
    (building.zip && building.street && normalizedStreet && normalizeStreet(building.street) === normalizedStreet
      ? building.zip
      : null);
  const unitRaw = input.unit && input.unit.trim() !== '' ? input.unit.trim() : parts.unit_in_street;
  const unitNormalized = normalizeUnit(unitRaw);
  const cityKey = normalizeCity(city) ?? '';
  const stateKey = normalizeState(state) ?? '';
  const buildingKey = normalizedStreet
    ? [PROPERTY_KEY_VERSION, stateKey, cityKey, normalizedStreet].join('|')
    : null;
  return {
    key: buildingKey ? `${buildingKey}|${unitNormalized ?? ''}` : null,
    building_key: buildingKey,
    address: { street, city, state, zip, normalized_street: normalizedStreet },
    unit: { raw: unitRaw ?? null, normalized: unitNormalized },
    streeteasy: parseStreetEasyUrl(input.url),
  };
}

/**
 * Same building? Street must match; city and state must match where both
 * sides have them (a hand-typed subject often omits the city).
 */
export function sameBuilding(a: PropertyIdentity, b: PropertyIdentity): boolean {
  if (!a.address.normalized_street || a.address.normalized_street !== b.address.normalized_street) return false;
  const cityA = normalizeCity(a.address.city);
  const cityB = normalizeCity(b.address.city);
  if (cityA && cityB && cityA !== cityB) return false;
  const stateA = normalizeState(a.address.state);
  const stateB = normalizeState(b.address.state);
  if (stateA && stateB && stateA !== stateB) return false;
  return true;
}

export function sameUnit(a: PropertyIdentity, b: PropertyIdentity): boolean {
  return sameBuilding(a, b) && a.unit.normalized !== null && a.unit.normalized === b.unit.normalized;
}
