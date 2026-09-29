// Facts from a listing's tags — the export's three tag columns, or the lists
// on a StreetEasy listing page — derived the same way for both (§6.2).
//
// Each fact says whether it rests on a tag that is there (`listed`) or on none
// of its kind being listed. "None listed" is weak evidence, because a listing
// agent types the tags and may leave one out, so the caller records it as
// approximate.

import type { FactField, UnitTypeTag } from '../types.ts';
import { deriveFromAmenities, deriveFromFeatures, unitLabelSuggestsPenthouse } from './derive.ts';

export interface TagFact {
  field: FactField;
  value: unknown;
  /** False when the value says none of its kind was listed. */
  listed: boolean;
  note: string;
}

/** What the notes call each list: "the Home Features" in an export, "the listing's features" on a page. */
export interface TagListNames {
  features: string;
  amenities: string;
  policies: string;
  /** Said of private outdoor space, whose size neither source carries as a tag. */
  outdoor_size: string;
}

export const EXPORT_TAG_NAMES: TagListNames = {
  features: 'the Home Features',
  amenities: 'the Building Amenities',
  policies: 'the Building Policies',
  outdoor_size: 'the export carries no outdoor size',
};

export const LISTING_TAG_NAMES: TagListNames = {
  features: "the listing's features",
  amenities: "the building's amenities",
  policies: "the building's policies",
  outdoor_size: 'its outdoor size is not among them',
};

/** "the Home Features" → "Home Features"; "the listing's features" → "The listing's features". */
function bare(name: string): string {
  return name.startsWith('the Home') || name.startsWith('the Building') ? name.slice(4) : `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/**
 * Every fact the tags give. A blank list gives nothing — unknown, not "none
 * listed". Policies are kept as written, lowercased.
 */
export function tagFacts(
  tags: { features: readonly string[]; amenities: readonly string[]; policies: readonly string[] },
  names: TagListNames,
): TagFact[] {
  const out: TagFact[] = [];
  const add = (field: FactField, value: unknown, listed: boolean, note: string) => out.push({ field, value, listed, note });
  if (tags.features.length > 0) {
    const f = deriveFromFeatures(tags.features);
    const F = names.features;
    const none = (what: string) => `no ${what} listed among ${F}`;
    add('views', f.views, f.views.length > 0, f.views.length ? `from ${F} view tags` : none('view'));
    const outdoor = f.outdoor_kinds.length > 0;
    add('outdoor_private', outdoor, outdoor, outdoor ? `${bare(F)} list ${f.outdoor_kinds.join(', ')}` : none('private outdoor space'));
    add('outdoor_kinds', f.outdoor_kinds, outdoor, outdoor ? `from ${F}; ${names.outdoor_size}` : none('private outdoor space'));
    add('unit_type', f.unit_type, f.unit_type.length > 0, f.unit_type.length ? `from ${F}` : none('penthouse, duplex, triplex or loft'));
    add('central_air', f.central_air, f.central_air, f.central_air ? `from ${F}` : none('central air'));
    add('dishwasher', f.dishwasher, f.dishwasher, f.dishwasher ? `from ${F}` : none('dishwasher'));
    add('fireplace', f.fireplace, f.fireplace, f.fireplace ? `from ${F}` : none('fireplace'));
    add('laundry', f.laundry, f.laundry !== 'none_listed',
      f.laundry === 'installed' ? `a washer/dryer among ${F}`
        : f.laundry === 'permitted' ? `${F} say a washer/dryer is allowed`
          : `${none('washer/dryer')}; whether one is permitted isn't known`);
    add('finishes', f.finishes, f.finishes.length > 0, f.finishes.length
      ? `${bare(F)} other than views, outdoor space, unit type and the systems above`
      : `no other finishes listed among ${F}`);
  }
  if (tags.amenities.length > 0) {
    const a = deriveFromAmenities(tags.amenities);
    const A = names.amenities;
    // Door service and concierge are both read from the tags: a part not listed is "none listed".
    const serviceListed = a.service.doorman !== 'none_listed' && a.service.concierge;
    add('service', a.service, serviceListed, serviceListed ? `from ${A}`
      : `from ${A}; ${[a.service.doorman === 'none_listed' ? 'no doorman' : '', a.service.concierge ? '' : 'no concierge'].filter(Boolean).join(' and ')} listed`);
    add('parking', a.parking, a.parking.length > 0, a.parking.length ? `from ${A}; deeded or not can't be told` : `no parking listed among ${A}`);
    add('outdoor_shared', a.outdoor_shared, a.outdoor_shared, a.outdoor_shared ? `shared outdoor space listed among ${A}` : `no shared outdoor space listed among ${A}`);
    add('amenities', a.amenities, a.amenities.length > 0, a.amenities.length
      ? `${bare(A)} other than door service, parking and shared outdoor space`
      : `no other amenities listed among ${A}`);
  }
  if (tags.policies.length > 0) {
    add('policies', tags.policies.map((p) => p.toLowerCase()).sort(), true, `from ${names.policies}`);
  }
  return out;
}

/**
 * A penthouse guessed from a "PH" unit label, when the tags don't already say
 * so: the unit types to suggest, inferred, for the agent to confirm. Null when
 * there's nothing to suggest.
 */
export function penthouseSuggestion(unitLabel: string | null, unitTypes: readonly UnitTypeTag[] | undefined): UnitTypeTag[] | null {
  if (!unitLabelSuggestsPenthouse(unitLabel) || unitTypes?.includes('penthouse')) return null;
  return [...(unitTypes ?? []), 'penthouse'].sort() as UnitTypeTag[];
}
