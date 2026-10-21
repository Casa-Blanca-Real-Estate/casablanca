// What each fact field must hold — one definition shared by the parser (which
// never emits a value that fails it) and compute()'s input validation (which
// refuses one). Money is whole dollars; areas whole square feet.

import { isIsoDate } from './util/dates.ts';
import { LAUNDRY_STATES, SALE_KINDS, type FactField } from './types.ts';

export type Check = (v: unknown) => boolean;

export const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
export const nonNegInt: Check = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const posInt: Check = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
export const int: Check = (v) => typeof v === 'number' && Number.isSafeInteger(v);
export const bool: Check = (v) => typeof v === 'boolean';
const strings: Check = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');
export const oneOf = (...xs: string[]): Check => (v) => typeof v === 'string' && xs.includes(v);
const listOf = (...xs: string[]): Check => (v) => Array.isArray(v) && v.every((s) => typeof s === 'string' && xs.includes(s));
const latLng = (v: unknown, limit: number) => typeof v === 'number' && Number.isFinite(v) && v >= -limit && v <= limit;

/** What each fact field must hold. Money is whole dollars; areas whole square feet. */
export const FACT_CHECKS: Record<FactField, { check: Check; expects: string }> = {
  property_type: { check: oneOf('condo', 'coop', 'condop', 'townhouse', 'multi_family', 'other'), expects: 'a property type' },
  area_sqft: { check: posInt, expects: 'whole square feet above zero' },
  beds: { check: nonNegInt, expects: 'a whole number of bedrooms' },
  baths: { check: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0, expects: 'a number of bathrooms' },
  rooms: { check: (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && Number.isInteger(v * 2), expects: 'a number of rooms (halves allowed)' },
  floor: { check: int, expects: 'a whole floor number' },
  sale_price: { check: posInt, expects: 'whole dollars above zero' },
  list_price: { check: posInt, expects: 'whole dollars above zero' },
  original_list_price: { check: posInt, expects: 'whole dollars above zero' },
  status_date: { check: isIsoDate, expects: 'a YYYY-MM-DD date' },
  list_date: { check: isIsoDate, expects: 'a YYYY-MM-DD date' },
  contract_date: { check: isIsoDate, expects: 'a YYYY-MM-DD date' },
  days_on_market: { check: nonNegInt, expects: 'whole days' },
  common_charges_monthly: { check: nonNegInt, expects: 'whole dollars a month' },
  taxes_monthly: { check: nonNegInt, expects: 'whole dollars a month' },
  maintenance_monthly: { check: nonNegInt, expects: 'whole dollars a month' },
  building_units: { check: posInt, expects: 'a whole number of units' },
  building_stories: { check: posInt, expects: 'a whole number of stories' },
  year_built: { check: (v) => int(v) && (v as number) >= 1600 && (v as number) <= 2100, expects: 'a year' },
  new_development: { check: bool, expects: 'true or false' },
  sponsor_unit: { check: bool, expects: 'true or false' },
  income_restricted: { check: bool, expects: 'true or false' },
  sale_kind: { check: oneOf(...SALE_KINDS), expects: 'a sale kind' },
  sale_kind_label: { check: (v) => typeof v === 'string' && v.trim() !== '', expects: 'the label as shown' },
  coordinates: {
    check: (v) => isObj(v) && Object.keys(v).length === 2 && latLng(v['lat'], 90) && latLng(v['lng'], 180),
    expects: '{ lat, lng } in degrees',
  },
  outdoor_private: { check: bool, expects: 'true or false' },
  outdoor_kinds: { check: listOf('balcony', 'terrace', 'roof_deck', 'garden', 'patio', 'outdoor_space'), expects: 'outdoor kinds' },
  outdoor_area_sqft: { check: nonNegInt, expects: 'whole square feet' },
  outdoor_shared: { check: bool, expects: 'true or false' },
  views: { check: strings, expects: 'a list of view kinds' },
  parking: { check: strings, expects: 'a list of parking kinds' },
  service: {
    check: (v) => isObj(v) && oneOf('full_time', 'part_time', 'virtual', 'hours_unspecified', 'none_listed')(v['doorman']) && bool(v['concierge']),
    expects: '{ doorman, concierge }',
  },
  unit_type: { check: listOf('penthouse', 'duplex', 'triplex', 'loft'), expects: 'unit type tags' },
  central_air: { check: bool, expects: 'true or false' },
  dishwasher: { check: bool, expects: 'true or false' },
  fireplace: { check: bool, expects: 'true or false' },
  laundry: { check: oneOf(...LAUNDRY_STATES), expects: 'installed, permitted, prohibited or none_listed' },
  finishes: { check: strings, expects: 'a list of tags' },
  amenities: { check: strings, expects: 'a list of tags' },
  policies: { check: strings, expects: 'a list of tags' },
  pets: { check: oneOf('allowed', 'not_listed'), expects: 'allowed or not_listed' },
  smoke_free: { check: bool, expects: 'true or false' },
};
