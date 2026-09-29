// A comp the agent types in (§6.2, CR-2.2): address, status, price, size,
// floor, date — for a comp without a link. It's the agent's record: every value
// has source `agent`, `exact` unless the agent marks it as an estimate, which
// makes it `guesstimate` and lands it in "with estimates" only.

import { FACT_CHECKS, isObj } from '../facts-schema.ts';
import { isIsoDate, type IsoDate } from '../util/dates.ts';
import { PARSER_VERSION } from '../version.ts';
import { LISTING_STATUSES, type CompRecord, type EvidenceClass, type FactField, type ListingStatus, type PropertyFacts, type Sourced } from '../types.ts';
import { ParseError, type ParseWarning } from './errors.ts';
import { readListingArea, readListingCount, readListingDate, readListingFloor, readListingHalfCount, readMonthly } from './listing.ts';
import { identify } from './property-key.ts';
import { isBlank, readMoney, readPropertyType, type Read } from './values.ts';

/** A value as typed, or marked as the agent's estimate. */
export type ManualValue<T> = T | { value: T; estimate: boolean };

export interface ManualCompFields {
  /** The address line: "200 Chambers Street, New York, NY". The unit can be in it or given separately. */
  address: string;
  unit?: string;
  /** A link to the listing, if there is one. */
  url?: string;
  status: ListingStatus;
  /** The sale price for a sold comp; otherwise the asking price (the last ask). */
  price?: ManualValue<number | string>;
  /** The closing date (sold), the contract date (in contract), the listing date (active), or the date it came off the market. */
  date?: ManualValue<string>;
  area_sqft?: ManualValue<number | string>;
  floor?: ManualValue<number | string>;
  beds?: ManualValue<number | string>;
  baths?: ManualValue<number | string>;
  property_type?: ManualValue<string>;
  common_charges_monthly?: ManualValue<number | string>;
  taxes_monthly?: ManualValue<number | string>;
  maintenance_monthly?: ManualValue<number | string>;
}

export interface ManualReadOptions {
  /** The date the agent entered it — every value's as-of date. */
  as_of: IsoDate;
}

const EVIDENCE: Record<ListingStatus, EvidenceClass | null> = {
  sold: 'sold', in_contract: 'in_contract', active: 'active',
  // "Didn't sell" isn't an evidence status yet (§6.3; CR-2.2 phase 2), so it enters no statistic.
  off_market: null,
};

/** A typed-in comp as a comp record, the same shape the export and links make. */
export function compRecordFromManual(fields: ManualCompFields, options: ManualReadOptions): { record: CompRecord; warnings: ParseWarning[] } {
  if (!isIsoDate(options?.as_of)) throw new ParseError('as_of must be the date the agent entered the comp, as YYYY-MM-DD');
  if (!isObj(fields)) throw new ParseError('a typed-in comp must be an object');
  if (!(LISTING_STATUSES as readonly string[]).includes(fields.status)) {
    throw new ParseError(`status must be one of ${LISTING_STATUSES.join(', ')}`);
  }
  const asOf = options.as_of;
  const status = fields.status;
  const warnings: ParseWarning[] = [];
  const facts: PropertyFacts = {};

  const put = (field: FactField, column: string, raw: ManualValue<number | string> | undefined, reader: (s: string) => Read<unknown>): void => {
    if (raw === undefined || raw === null) return;
    const estimate = isObj(raw) && 'value' in raw ? Boolean((raw as { estimate?: unknown }).estimate) : false;
    const value = isObj(raw) && 'value' in raw ? (raw as { value: unknown }).value : raw;
    if (typeof value !== 'string' && typeof value !== 'number') {
      warnings.push({ code: 'unreadable_value', column, message: `${column}: ${JSON.stringify(value)} can't be read — left out` });
      return;
    }
    const text = String(value).trim();
    if (text === '' || isBlank(text)) return;
    const r = reader(text);
    if (r.value === null) {
      warnings.push({ code: 'unreadable_value', column, message: `${column}: ${r.note ?? `"${text}" can't be read`} — left out` });
      return;
    }
    if (!FACT_CHECKS[field].check(r.value)) {
      const zero = (field === 'sale_price' || field === 'list_price') && r.value === 0;
      warnings.push({
        code: zero ? 'zero_price' : 'unreadable_value', column,
        message: zero ? `${column}: a $0 price is no price — left out` : `${column}: ${JSON.stringify(r.value)} isn't ${FACT_CHECKS[field].expects} — left out`,
      });
      return;
    }
    if (r.note) warnings.push({ code: 'value_adjusted', column, message: `${column}: ${r.note}` });
    const confidence = estimate ? 'guesstimate' : r.approx ? 'approx' : 'exact';
    (facts as Record<string, Sourced<unknown>>)[field] = {
      value: r.value, source: 'agent', as_of: asOf, confidence,
      note: estimate ? "typed in — the agent's estimate" : 'typed in by the agent',
    };
  };

  put(status === 'sold' ? 'sale_price' : 'list_price', 'price', fields.price, readMoney);
  // One date, read once; in contract it's also the contract date, active the listing date.
  put('status_date', 'date', fields.date, readListingDate);
  if (facts.status_date && status === 'in_contract') facts.contract_date = facts.status_date;
  if (facts.status_date && status === 'active') facts.list_date = facts.status_date;
  put('area_sqft', 'area_sqft', fields.area_sqft, readListingArea);
  put('floor', 'floor', fields.floor, readListingFloor);
  put('beds', 'beds', fields.beds, readListingCount);
  put('baths', 'baths', fields.baths, readListingHalfCount);
  put('property_type', 'property_type', fields.property_type, readPropertyType);
  put('common_charges_monthly', 'common_charges_monthly', fields.common_charges_monthly, readMonthly);
  put('taxes_monthly', 'taxes_monthly', fields.taxes_monthly, readMonthly);
  put('maintenance_monthly', 'maintenance_monthly', fields.maintenance_monthly, readMonthly);

  const address = typeof fields.address === 'string' ? fields.address.trim() : '';
  const identity = identify({ address: address || null, unit: fields.unit ?? null, url: fields.url ?? null });
  if (!identity.key) warnings.push({ code: 'missing_address', column: 'address', message: 'no street address, so this comp has no property key and can\'t be matched or recorded' });
  else if (!identity.address.city || !identity.address.state) {
    warnings.push({
      code: 'partial_address', column: 'address',
      message: `no ${!identity.address.city ? 'city' : 'state'} in the address, so it won't match the same home from an export until one is added`,
    });
  }
  if (status === 'off_market') {
    warnings.push({ code: 'off_market', message: 'off the market without selling: kept as a "didn\'t sell" comp, which enters no statistic yet' });
  }

  const record: CompRecord = {
    identity,
    status: { raw: status, evidence_class: EVIDENCE[status], listing_status: status },
    facts,
    engagement: null,
    building_name: null,
    neighborhood: null,
    agent_commentary: null,
    tags: { features: [], amenities: [], policies: [] },
    ignored_export_price_per_sqft: null,
    flags: { closing_record: identity.streeteasy?.kind === 'closing', approx_area: facts.area_sqft?.confidence === 'approx' },
    origin: { parser_version: PARSER_VERSION, row: 1, as_of: asOf, via: 'manual' },
  };
  return { record, warnings };
}
