// Comps from StreetEasy listing pages (§6.2, CR-2.2). Many agents add comps
// one link at a time. The server reads the page with Firecrawl, asking for
// LISTING_EXTRACT_SCHEMA, and this turns the extract into the same CompRecord
// the export parser makes.
//
// - Every value read from the page has source `listing` and input confidence
//   `inferred`: a model read the page, and it can misread it. The agent confirms
//   the row in one tap (confirmListingRecord), and each value becomes `exact`,
//   or `approx` where the page marks it so or lists none of a kind.
// - A value the page doesn't give is missing, never guessed.
// - The identity is the export's stable key (pk1|…), so the same home added by
//   link and by export is one property.
// - The extract asks for values as the page writes them ("$4,650,000",
//   "~1,840 ft²"), and the export's own readers turn them into numbers here, so
//   a figure is typed by rules, not by the model.

import { FACT_CHECKS, isObj } from '../facts-schema.ts';
import { isIsoDate, parseMonthNameDate, type IsoDate } from '../util/dates.ts';
import { compareStrings } from '../util/numbers.ts';
import { PARSER_VERSION } from '../version.ts';
import type {
  CompRecord, Confidence, EvidenceClass, FactField, ListingEvent, ListingStatus, PropertyFacts, Sourced,
} from '../types.ts';
import { ParseError, type ParseWarning } from './errors.ts';
import { identify, normalizeCity, parseAddressLine, parseStreetEasyUrl } from './property-key.ts';
import { LISTING_TAG_NAMES, penthouseSuggestion, tagFacts } from './tag-facts.ts';
import {
  isBlank, readArea, readCount, readDate, readFloor, readHalfCount, readMoney, readPropertyType, readTags, type Read,
} from './values.ts';

// ─── What Firecrawl is asked for ─────────────────────────────────────────────

const text = (description: string) => ({ type: 'string', description });
const tags = (description: string) => ({ type: 'array', items: { type: 'string' }, description });

/**
 * The JSON schema the server passes to Firecrawl's extract, with
 * LISTING_EXTRACT_PROMPT. Every value is text, copied as the page shows it,
 * and empty when the page doesn't show it; the engine does the reading.
 */
export const LISTING_EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    address: text('The street address without the unit, city or ZIP, e.g. "200 Chambers Street".'),
    unit: text('The unit, e.g. "#10A" or "PHA".'),
    city: text('The city in the listing\'s or building\'s full address, e.g. "New York" or "Brooklyn".'),
    state: text('The state, e.g. "NY".'),
    zip: text('The ZIP code, e.g. "10007".'),
    neighborhood: text('The neighborhood, e.g. "Tribeca".'),
    url: text('The listing\'s StreetEasy URL, if the page shows it.'),
    status: text('The status label, e.g. "Sold", "In contract", "For sale", "Off market", "No longer available".'),
    sale_price: text('The closing price, e.g. "$4,650,000". Only if the page says it sold.'),
    sale_date: text('The closing date.'),
    last_ask: text('The most recent asking price.'),
    original_ask: text('The first asking price, from the price history.'),
    list_date: text('The date it was listed.'),
    contract_date: text('The date it went into contract.'),
    days_on_market: text('Days on market, e.g. "72 days".'),
    floor: text('The unit\'s floor, e.g. "10", only where the page states it.'),
    interior_size: text('The interior size, e.g. "2,201 ft²" or "~1,840 ft²".'),
    interior_size_approximate: text('"yes" if the page marks the size approximate or estimated.'),
    beds: text('Bedrooms, e.g. "3" or "Studio".'),
    baths: text('Bathrooms, e.g. "2.5".'),
    rooms: text('Rooms, e.g. "5".'),
    common_charges: text('Monthly common charges, e.g. "$3,120".'),
    taxes: text('Monthly real estate taxes.'),
    maintenance: text('Monthly maintenance, for a co-op.'),
    property_type: text('The property type as labelled: Condo, Co-op, Condop or Townhouse.'),
    building_name: text('The building\'s name, if it has one.'),
    building_units: text('Units in the building.'),
    building_stories: text('Stories in the building.'),
    year_built: text('The year the building was built.'),
    new_development: text('"yes" if the page marks it new development.'),
    sponsor_unit: text('"yes" if the page marks it a sponsor unit.'),
    income_restricted: text('"yes" if the page marks it income-restricted or HDFC.'),
    features: tags('The home\'s features, one tag each, e.g. "Washer/dryer", "City view".'),
    amenities: tags('The building\'s amenities, one tag each, e.g. "Doorman", "Gym".'),
    policies: tags('The building\'s policies, one tag each, e.g. "Pets allowed".'),
    history: {
      type: 'array',
      description: 'The listing\'s price history, one row per event.',
      items: {
        type: 'object',
        properties: {
          date: text('The date as shown.'),
          event: text('The event as shown, e.g. "Listed", "Price decreased", "In contract", "Sold", "Delisted".'),
          price: text('The price as shown, if any.'),
        },
      },
    },
    description: text('The home\'s full description, every paragraph.'),
  },
} as const;

/** The instruction that goes with the schema. */
export const LISTING_EXTRACT_PROMPT =
  'Read this StreetEasy listing page. Copy each value exactly as the page shows it, keeping "$", commas, "~" ' +
  'and "ft²". Leave a field or list empty when the page doesn\'t show it. Never estimate, compute or infer a ' +
  'value: no floor from the unit number, no price per square foot, no size from rooms.';

/** The extract as Firecrawl returns it: every field optional, and none trusted until read. */
export type ListingExtract = { [K in keyof typeof LISTING_EXTRACT_SCHEMA.properties]?: unknown };

// ─── Reading the page's text ─────────────────────────────────────────────────

/** Trailing words a page puts after a number: "3 beds", "72 days", "27 stories". */
const UNIT_WORDS = /\s*(beds?|bd|br|bedrooms?|baths?|ba|bathrooms?|rooms?|rms?|days?( on market)?|stories|story|floors?|units?)\.?$/i;

function stripWords(s: string): string {
  return s.replace(UNIT_WORDS, '').trim();
}

/** A monthly amount: "$3,120", "$3,120/mo", "$3,120 per month", "$3,120 monthly". */
export function readMonthly(s: string): Read<number> {
  return readMoney(s.replace(/\s*(\/\s*(mo|month)\.?|per month|a month|monthly)$/i, ''));
}

/** "8/27/2026", "2026-08-27", "Aug 27, 2026", "Sold on Aug 27, 2026". */
export function readListingDate(s: string): Read<IsoDate> {
  const cleaned = s.replace(/^(sold|closed|listed|in contract|contract signed|delisted|off market)\s*(on)?:?\s+/i, '');
  const r = readDate(cleaned);
  if (r.value !== null || cleaned === '') return r;
  const named = parseMonthNameDate(cleaned);
  return named ? { value: named, approx: false, note: null } : r;
}

/** "3", "3 beds", "Studio", "27 stories", "Built in 2008". */
export function readListingCount(s: string): Read<number> {
  return readCount(stripWords(s.replace(/^built( in)?\s+/i, '')));
}

/** "2.5", "2.5 baths", "3.5 rooms". */
export function readListingHalfCount(s: string): Read<number> {
  return readHalfCount(stripWords(s));
}

/** "10", "10th floor", "Floor 10". */
export function readListingFloor(s: string): Read<number> {
  const floor = /^floor\s+(-?\d+)$/i.exec(s.trim());
  return readFloor(floor ? floor[1]! : s);
}

/** "2,201 ft²", "~1,840 ft²", "1,840 ft² (est.)", "approx. 1,840 sq ft". */
export function readListingArea(s: string): Read<number> {
  const marked = /\b(approx(imately)?|est(imated)?)\b\.?/i.test(s);
  const r = readArea(s.replace(/\(?\b(approx(imately)?|est(imated)?)\b\.?\)?/gi, '').trim());
  return marked && r.value !== null ? { ...r, approx: true } : r;
}

/** "yes" → true, "no" → false, blank → nothing; anything else can't be read. */
export function readYesNo(s: string): Read<boolean> {
  const t = s.trim().toLowerCase();
  if (t === '') return { value: null, approx: false, note: null };
  if (/^(yes|y|true)$/.test(t)) return { value: true, approx: false, note: null };
  if (/^(no|n|false)$/.test(t)) return { value: false, approx: false, note: null };
  return { value: null, approx: false, note: `"${s}" is not yes or no` };
}

/** "Condo", "Co-op", "Condo in Tribeca" → the type; the rest of the label isn't the type. */
function readListingPropertyType(s: string) {
  const lead = /^(condominium|condo|co-?op(erative)?|condop|townhouse|house|multi[- ]?family)\b/i.exec(s.trim());
  return readPropertyType(lead ? lead[1]! : s);
}

// ─── Status: the label, and the listing's history ────────────────────────────

type EventKind = ListingEvent['kind'];

/** What an event or a status label says, by its words. Order matters: "Listing removed" is off market, not listed. */
function eventKind(words: string): EventKind {
  const t = words.toLowerCase();
  if (/never sold|\bunsold\b|not sold|didn'?t sell/.test(t)) return 'off_market';
  if (/\bsold\b|\bclosed\b|\brecorded sale\b/.test(t)) return 'sold';
  if (/in contract|contract signed|under contract|\bpending\b|accepted offer/.test(t)) return 'in_contract';
  if (/delisted|off (the )?market|no longer available|listing removed|\bremoved\b|withdrawn|\bexpired\b|not available|unavailable/.test(t)) return 'off_market';
  if (/\bprice\b.*\b(decrease|increase|change|drop|cut|reduc)|\bnew price\b|\breduced\b|\bincreased\b|\bdecreased\b/.test(t)) return 'price_change';
  if (/relisted|re-listed|back on (the )?market/.test(t)) return 'relisted';
  // Only words that start a listing: a stray "listing" ("Listing updated") mustn't restart the period.
  if (/\blisted\b|\bnew listing\b|\bfor sale\b|\bactive\b|on (the )?market/.test(t)) return 'listed';
  return 'other';
}

/** A status label → the listing's status, or a rental page, or nothing readable. */
function readStatusLabel(label: string): ListingStatus | 'rental' | null {
  const t = label.toLowerCase();
  if (t === '') return null;
  if (/\bfor rent\b|\brental\b|\brented\b|\bno fee\b/.test(t)) return 'rental';
  const kind = eventKind(t);
  return kind === 'sold' || kind === 'in_contract' || kind === 'off_market' ? kind
    : kind === 'listed' || kind === 'relisted' || kind === 'price_change' || /^new\b/.test(t) ? 'active' : null;
}

/** The status the history's latest listing period ends in, or null when it has none. */
function statusFromHistory(history: readonly ListingEvent[]): ListingStatus | null {
  let start = -1;
  for (let i = history.length - 1; i >= 0 && start < 0; i--) if (history[i]!.kind === 'listed' || history[i]!.kind === 'relisted') start = i;
  const period = history.slice(Math.max(start, 0));
  let status: ListingStatus | null = start >= 0 ? 'active' : null;
  for (const e of period) {
    if (e.kind === 'sold') status = 'sold';
    else if (e.kind === 'in_contract' && status !== 'sold') status = 'in_contract';
    else if (e.kind === 'off_market' && status !== 'sold') status = 'off_market';
    else if ((e.kind === 'listed' || e.kind === 'relisted') && status !== 'sold') status = 'active';
  }
  return status;
}

const EVIDENCE: Record<ListingStatus, EvidenceClass | null> = {
  sold: 'sold', in_contract: 'in_contract', active: 'active',
  // "Didn't sell" isn't an evidence status yet (§6.3; CR-2.2 phase 2), so it enters no statistic.
  off_market: null,
};

const STATUS_WORDS: Record<ListingStatus, string> = {
  sold: 'sold', in_contract: 'in contract', active: 'active', off_market: 'off the market unsold',
};

// ─── The record ──────────────────────────────────────────────────────────────

export interface ListingReadOptions {
  /** The date the page was read — every value's as-of date. */
  as_of: IsoDate;
  /** The link the agent pasted. It wins over any URL in the extract. */
  url?: string | null;
}

export interface ListingRead {
  record: CompRecord;
  warnings: ParseWarning[];
}

/** A StreetEasy building slug's city: "200-chambers-street-new_york" → "New York". Only the boroughs StreetEasy names this way. */
const SLUG_CITIES: Record<string, string> = {
  new_york: 'New York', brooklyn: 'Brooklyn', bronx: 'Bronx', staten_island: 'Staten Island',
};

/** Turns a Firecrawl extract of a StreetEasy listing page into a comp record. */
export function compRecordFromListing(extract: unknown, options: ListingReadOptions): ListingRead {
  if (!isIsoDate(options?.as_of)) throw new ParseError('as_of must be the date the page was read, as YYYY-MM-DD');
  if (!isObj(extract)) throw new ParseError('a listing extract must be an object — what Firecrawl returned for LISTING_EXTRACT_SCHEMA');
  const asOf = options.as_of;
  const ex = extract as Record<string, unknown>;
  const warnings: ParseWarning[] = [];
  const str = (key: string): string => {
    const v = ex[key];
    return typeof v === 'string' ? v.trim()
      : typeof v === 'number' && Number.isFinite(v) ? String(v)
        : typeof v === 'boolean' ? (v ? 'yes' : 'no') : '';
  };
  const list = (key: string): string[] => {
    const v = ex[key];
    if (typeof v === 'string') return readTags(v);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter((x) => x !== '');
  };

  // ── Identity ──
  const url = options.url && options.url.trim() !== '' ? options.url.trim() : str('url') || null;
  const ref = parseStreetEasyUrl(url);
  let city = str('city');
  let state = str('state');
  const suffix = ref?.building_slug ? /-([a-z_]+)$/.exec(ref.building_slug)?.[1] : undefined;
  if (!city && suffix && SLUG_CITIES[suffix]) city = SLUG_CITIES[suffix]!;
  if (!state && city && ['new york', 'brooklyn', 'bronx', 'staten island', 'queens'].includes(normalizeCity(city) ?? '')) state = 'NY';
  const street = str('address');
  const zip = str('zip');
  // The address field may already be the full line ("200 Chambers Street, New York, NY 10007").
  const inline = parseAddressLine(street);
  const addressLine = inline.city || inline.state ? street
    : [street, city, state ? `${state}${zip ? ` ${zip}` : ''}` : ''].filter((p) => p !== '').join(', ');
  const identity = identify({ address: addressLine || null, unit: str('unit') || null, url });
  if (!identity.key) {
    warnings.push({ code: 'missing_address', message: 'the page gave no street address, so this comp has no property key and can\'t be matched or recorded' });
  } else if (!identity.address.city || !identity.address.state) {
    warnings.push({
      code: 'partial_address',
      message: `the page gave no ${!identity.address.city ? 'city' : 'state'}, so this comp won't match the same home from an export until one is added`,
    });
  }
  if (!ref || !['building_unit', 'sale', 'closing'].includes(ref.kind)) {
    warnings.push({
      code: 'not_a_listing', column: 'url',
      message: !url ? 'no listing link was given'
        : ref?.kind === 'rental' ? 'the link is a rental listing, not a sale'
          : 'the link isn\'t a StreetEasy sale listing — read for what the page gave',
    });
  }

  // ── History, oldest first ──
  const history: ListingEvent[] = [];
  const rawHistory = Array.isArray(ex['history']) ? ex['history'] : [];
  for (const row of rawHistory) {
    if (!isObj(row)) continue;
    const words = typeof row['event'] === 'string' ? row['event'].trim() : '';
    const dateText = typeof row['date'] === 'string' ? row['date'].trim() : '';
    const priceText = typeof row['price'] === 'string' ? row['price'].trim() : '';
    if (words === '' && dateText === '') continue;
    const price = priceText === '' || isBlank(priceText) ? null : readMoney(priceText).value;
    const date = dateText === '' ? null : readListingDate(dateText).value;
    if (dateText !== '' && date === null) {
      warnings.push({ code: 'unreadable_value', column: 'history', message: `history: "${dateText}" (${words || 'an event'}) is not a date — the event is kept without one` });
    }
    history.push({ date, event: words, kind: eventKind(words), price: price && price > 0 ? price : null });
  }
  const dated = history.filter((e) => e.date !== null);
  if (dated.length >= 2 && compareStrings(dated[0]!.date!, dated[dated.length - 1]!.date!) > 0) history.reverse();

  // ── Status ──
  const label = str('status');
  const fromLabel = readStatusLabel(label);
  const fromHistory = statusFromHistory(history);
  let status: ListingStatus | null = fromLabel === 'rental' ? null : fromLabel;
  if (fromLabel === 'rental') {
    warnings.push({ code: 'rental_listing', column: 'status', message: `the page's status "${label}" is a rental, not a sale — not a comp for a sale` });
  } else if (!status && fromHistory) {
    status = fromHistory;
  } else if (status && fromHistory && status !== fromHistory) {
    // A recorded sale is the stronger evidence; otherwise the label stands.
    if (fromHistory === 'sold') status = 'sold';
    warnings.push({
      code: 'status_conflict', column: 'status',
      message: `the page's label says ${STATUS_WORDS[fromLabel as ListingStatus]} but its history ends ${STATUS_WORDS[fromHistory]}; read as ${STATUS_WORDS[status]}`,
    });
  }
  if (!status && fromLabel !== 'rental') {
    warnings.push({ code: 'unrecognised_status', column: 'status', message: label ? `status "${label}" isn't sold, in contract, active or off the market` : 'the page gave no status, and its history doesn\'t settle one' });
  }
  if (status === 'off_market') {
    warnings.push({ code: 'off_market', message: 'it came off the market without selling: kept as a "didn\'t sell" comp, which enters no statistic yet' });
  }

  // ── Facts: inferred until the agent confirms ──
  const facts: PropertyFacts = {};
  const onConfirm: Partial<Record<FactField, 'exact' | 'approx'>> = {};
  const put = (field: FactField, value: unknown, approx: boolean, note: string | null, column: string) => {
    if (!FACT_CHECKS[field].check(value)) {
      const zero = (field === 'sale_price' || field === 'list_price' || field === 'original_list_price') && value === 0;
      warnings.push({
        code: zero ? 'zero_price' : 'unreadable_value', column,
        message: zero ? `${column}: a $0 price is no price — read as missing` : `${column}: ${JSON.stringify(value)} isn't ${FACT_CHECKS[field].expects} — read as missing`,
      });
      return;
    }
    (facts as Record<string, Sourced<unknown>>)[field] = {
      value, source: 'listing', as_of: asOf, confidence: 'inferred',
      note: note ? `read from the listing page; ${note}` : 'read from the listing page',
    };
    onConfirm[field] = approx ? 'approx' : 'exact';
  };
  const read = <T>(field: FactField, column: string, reader: (s: string) => Read<T>, forceApprox = false) => {
    const raw = str(column);
    if (raw === '' || isBlank(raw)) return; // "n/a", "—": the page shows nothing
    const r = reader(raw);
    if (r.value === null) {
      warnings.push({ code: 'unreadable_value', column, message: `${column}: ${r.note ?? `"${raw}" can't be read`} — read as missing` });
      return;
    }
    if (r.note) warnings.push({ code: 'value_adjusted', column, message: `${column}: ${r.note}` });
    put(field, r.value, r.approx || forceApprox, r.approx || forceApprox ? `"${raw}" is approximate` : null, column);
  };

  const sizeFlag = readYesNo(str('interior_size_approximate'));
  read('area_sqft', 'interior_size', readListingArea, sizeFlag.value === true);
  if (facts.area_sqft && onConfirm.area_sqft === 'approx') {
    warnings.push({ code: 'approx_area', column: 'interior_size', message: `the page marks the size ${str('interior_size')} approximate; its $/sqft will inherit that` });
  }
  read('beds', 'beds', readListingCount);
  read('baths', 'baths', readListingHalfCount);
  read('rooms', 'rooms', readListingHalfCount);
  read('floor', 'floor', readListingFloor);
  read('property_type', 'property_type', readListingPropertyType);
  read('common_charges_monthly', 'common_charges', readMonthly);
  read('taxes_monthly', 'taxes', readMonthly);
  read('maintenance_monthly', 'maintenance', readMonthly);
  read('building_units', 'building_units', readListingCount);
  read('building_stories', 'building_stories', readListingCount);
  read('year_built', 'year_built', readListingCount);
  read('new_development', 'new_development', readYesNo);
  read('sponsor_unit', 'sponsor_unit', readYesNo);
  read('income_restricted', 'income_restricted', readYesNo);
  read('days_on_market', 'days_on_market', readListingCount);
  read('list_price', 'last_ask', readMoney);
  read('original_list_price', 'original_ask', readMoney);
  read('list_date', 'list_date', readListingDate);
  read('contract_date', 'contract_date', readListingDate);
  // The sale belongs to a sold listing; on any other page it's an earlier sale.
  if (status === 'sold') {
    read('sale_price', 'sale_price', readMoney);
    read('status_date', 'sale_date', readListingDate);
  } else {
    for (const column of ['sale_price', 'sale_date']) {
      if (str(column) === '') continue;
      warnings.push({ code: 'value_adjusted', column, message: `${column}: the page shows ${str(column)} but the listing isn't sold — read as an earlier sale and left out` });
    }
  }

  // What the page's own history gives where a field didn't: still the page, still inferred.
  let periodStart = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.kind === 'listed' || history[i]!.kind === 'relisted') { periodStart = i; break; }
  }
  const lastOf = (kind: EventKind) => {
    for (let i = history.length - 1; i >= periodStart; i--) if (history[i]!.kind === kind) return history[i]!;
    return undefined;
  };
  const fromHistoryFact = (field: FactField, value: unknown) => {
    if (value === null || value === undefined || facts[field as keyof PropertyFacts]) return;
    put(field, value, false, 'from the listing\'s history', 'history');
  };
  const opening = history[periodStart];
  const opened = opening && (opening.kind === 'listed' || opening.kind === 'relisted') ? opening : undefined;
  fromHistoryFact('original_list_price', opened?.price);
  fromHistoryFact('list_date', opened?.date);
  fromHistoryFact('contract_date', lastOf('in_contract')?.date);
  // The last ask: the latest price in this listing period that isn't the sale.
  let lastAsk: ListingEvent | undefined;
  for (let i = history.length - 1; i >= periodStart && !lastAsk; i--) if (history[i]!.price !== null && history[i]!.kind !== 'sold') lastAsk = history[i];
  fromHistoryFact('list_price', lastAsk?.price);
  if (status === 'sold') {
    fromHistoryFact('sale_price', lastOf('sold')?.price);
    fromHistoryFact('status_date', lastOf('sold')?.date);
  }
  // Status Date means what it means in the export: the closing date (sold), the contract date (in
  // contract), the listing date (active) — and, off the market, the date it came off.
  const copy = (from: FactField) => {
    const v = facts[from as keyof PropertyFacts];
    if (v && !facts.status_date) {
      facts.status_date = v as Sourced<IsoDate>;
      onConfirm.status_date = onConfirm[from];
    }
  };
  if (status === 'in_contract') copy('contract_date');
  if (status === 'active') copy('list_date');
  if (status === 'off_market') fromHistoryFact('status_date', lastOf('off_market')?.date);

  // Tags — "none listed" becomes approximate on confirmation, as in the export.
  const tagLists = { features: list('features'), amenities: list('amenities'), policies: list('policies') };
  for (const t of tagFacts(tagLists, LISTING_TAG_NAMES)) put(t.field, t.value, !t.listed, t.note, t.field);

  const closing = ref?.kind === 'closing';
  if (closing) {
    warnings.push({ code: 'closing_record', message: 'a public-record closing: no asking price, days on market, features or amenities' });
  }
  const suggestions: CompRecord['suggestions'] = [];
  const penthouse = penthouseSuggestion(identity.unit.raw, facts.unit_type?.value);
  if (penthouse) {
    suggestions.push({
      field: 'unit_type',
      value: { value: penthouse, source: 'listing', as_of: asOf, confidence: 'inferred', note: `the unit label ${identity.unit.raw} suggests a penthouse — confirm` },
    });
  }

  const description = typeof ex['description'] === 'string' ? ex['description'].trim() : '';
  const record: CompRecord = {
    identity,
    status: {
      raw: label || (status ? `(from the listing's history) ${STATUS_WORDS[status]}` : null),
      evidence_class: status ? EVIDENCE[status] : null,
      listing_status: status,
    },
    facts,
    engagement: null,
    building_name: str('building_name') || null,
    neighborhood: str('neighborhood') || null,
    agent_commentary: null,
    tags: tagLists,
    ignored_export_price_per_sqft: null,
    flags: { closing_record: closing, approx_area: onConfirm.area_sqft === 'approx' },
    origin: { parser_version: PARSER_VERSION, row: 1, as_of: asOf, via: 'listing' },
    listing: {
      url: ref?.url ?? url,
      confirmed: false,
      on_confirm: onConfirm,
      history,
      description: description || null,
    },
  };
  if (suggestions.length > 0) record.suggestions = suggestions;
  return { record, warnings };
}

/**
 * The agent's one-tap confirm of a row read from a listing page: every value
 * the page gave becomes `exact`, or `approx` where the page marks it so or
 * lists none of a kind. Suggestions — guesses beyond the page — stay pending.
 * Returns a new record; a record that isn't an unconfirmed listing comes back
 * unchanged.
 */
export function confirmListingRecord(record: CompRecord): CompRecord {
  if (!record.listing || record.listing.confirmed) return record;
  const facts: PropertyFacts = {};
  for (const [field, value] of Object.entries(record.facts) as [FactField, Sourced<unknown>][]) {
    const promote = value.source === 'listing' && value.confidence === 'inferred';
    const confidence: Confidence = promote ? record.listing.on_confirm[field] ?? 'exact' : value.confidence;
    (facts as Record<string, Sourced<unknown>>)[field] = promote ? { ...value, confidence } : value;
  }
  return { ...record, facts, listing: { ...record.listing, confirmed: true } };
}
