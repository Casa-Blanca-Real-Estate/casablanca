// The export's columns, mapped by header name — never by position (§6.2).
// Each column has its StreetEasy header, the other names it may appear under,
// and what kind of value it holds. Headers match case-insensitively and
// ignoring spacing. Unknown columns are kept and reported; missing ones are
// warnings, each saying what the gap costs.

export type ColumnKind =
  | 'text' | 'address' | 'unit' | 'url' | 'status' | 'date' | 'property_type'
  | 'count' | 'half_count' | 'area' | 'money' | 'floor' | 'tags' | 'ignored_price_per_sqft';

export interface ColumnSpec {
  id: string;
  header: string;
  aliases: string[];
  kind: ColumnKind;
  /** Part of the reference export. Missing → a warning. */
  expected: boolean;
  /** What losing this column costs, for the warning. */
  missing_means: string;
}

export const COLUMNS: readonly ColumnSpec[] = [
  { id: 'address', header: 'Address', aliases: ['Street Address', 'Property Address'], kind: 'address', expected: true,
    missing_means: 'comps can only be keyed by their StreetEasy link, so they may not match across imports' },
  { id: 'unit', header: 'Unit', aliases: ['Apt', 'Apartment', 'Unit Number', 'Unit #'], kind: 'unit', expected: true,
    missing_means: 'units are taken from the address line where present' },
  { id: 'listing_url', header: 'Listing URL', aliases: ['URL', 'Link', 'StreetEasy URL', 'Listing Link'], kind: 'url', expected: true,
    missing_means: 'public-record closings cannot be flagged and listings cannot be opened from the report' },
  { id: 'status', header: 'Listing Status', aliases: ['Status'], kind: 'status', expected: true,
    missing_means: 'no comp has an evidence class, so no comp can enter any statistic' },
  { id: 'status_date', header: 'Status Date', aliases: ['Date'], kind: 'date', expected: true,
    missing_means: 'recency cannot be measured and a recency window excludes every comp' },
  { id: 'property_type', header: 'Property Type', aliases: ['Type', 'Home Type'], kind: 'property_type', expected: true,
    missing_means: 'like-for-like (condo against condo) cannot be checked' },
  { id: 'neighborhood', header: 'Neighborhood', aliases: [], kind: 'text', expected: true,
    missing_means: 'neighborhoods are not shown' },
  { id: 'beds', header: 'Beds', aliases: ['Bedrooms', 'Bed', 'BR'], kind: 'count', expected: true,
    missing_means: 'bedroom differences cannot be compared' },
  { id: 'baths', header: 'Baths', aliases: ['Bathrooms', 'Bath', 'BA'], kind: 'half_count', expected: true,
    missing_means: 'bathroom differences cannot be compared' },
  { id: 'sqft', header: 'Sqft', aliases: ['Sq Ft', 'Square Feet', 'Size', 'Ft²', 'Sqft.'], kind: 'area', expected: true,
    missing_means: 'no comp can contribute a price per square foot' },
  { id: 'floor', header: 'Floor', aliases: [], kind: 'floor', expected: true,
    missing_means: 'floor differences cannot be compared' },
  { id: 'sale_price', header: 'Sale Price', aliases: ['Sold Price', 'Closing Price', 'Close Price'], kind: 'money', expected: true,
    missing_means: 'no sold comp has a price, so there is no sold evidence' },
  { id: 'export_ppsf', header: '$/Sqft', aliases: ['Price/Sqft', 'Price per Sqft', 'PPSF', '$/Ft²', 'Price/Ft²'], kind: 'ignored_price_per_sqft', expected: true,
    missing_means: 'nothing — the engine never uses this column; it recomputes $/sqft itself' },
  { id: 'list_price', header: 'Listing Price', aliases: ['List Price', 'Asking Price', 'Last Asking Price'], kind: 'money', expected: true,
    missing_means: 'in-contract and active comps have no price, and sale-to-ask cannot be computed' },
  { id: 'agent_commentary', header: 'Agent Commentary', aliases: ['Commentary', 'Notes'], kind: 'text', expected: true,
    missing_means: 'nothing — it is shown when present' },
  { id: 'common_charges', header: 'Common Charges', aliases: ['Common Charge', 'CC'], kind: 'money', expected: true,
    missing_means: 'condo carrying costs cannot be computed' },
  { id: 'taxes', header: 'Monthly Taxes', aliases: ['Taxes', 'Real Estate Taxes', 'RE Taxes'], kind: 'money', expected: true,
    missing_means: 'condo carrying costs cannot be computed' },
  { id: 'maintenance', header: 'Maintenance Fees', aliases: ['Maintenance', 'Maintenance Fee'], kind: 'money', expected: true,
    missing_means: 'co-op carrying costs cannot be computed' },
  { id: 'days_on_market', header: 'Days on Market', aliases: ['DOM'], kind: 'count', expected: true,
    missing_means: 'days on market cannot be summarised' },
  { id: 'page_views', header: 'Views', aliases: ['Page Views', 'Listing Views'], kind: 'count', expected: true,
    missing_means: 'engagement is not shown' },
  { id: 'saves', header: 'Saves', aliases: [], kind: 'count', expected: true,
    missing_means: 'engagement is not shown' },
  { id: 'shares', header: 'Shares', aliases: [], kind: 'count', expected: true,
    missing_means: 'engagement is not shown' },
  { id: 'building_name', header: 'Building Name', aliases: [], kind: 'text', expected: true,
    missing_means: 'building names are not shown' },
  { id: 'building_address', header: 'Building Address', aliases: [], kind: 'text', expected: true,
    missing_means: 'ZIP codes are not recorded' },
  { id: 'building_type', header: 'Building Type', aliases: [], kind: 'text', expected: true,
    missing_means: 'nothing the engine uses' },
  { id: 'building_neighborhood', header: 'Building Neighborhood', aliases: [], kind: 'text', expected: true,
    missing_means: 'nothing the engine uses' },
  { id: 'building_units', header: 'Units in Building', aliases: ['Units', 'Building Units'], kind: 'count', expected: true,
    missing_means: 'building size cannot be compared' },
  { id: 'building_stories', header: 'Stories in Building', aliases: ['Stories', 'Building Stories'], kind: 'count', expected: true,
    missing_means: 'building size cannot be compared' },
  { id: 'policies', header: 'Building Policies', aliases: ['Policies'], kind: 'tags', expected: true,
    missing_means: 'policies cannot be compared' },
  { id: 'features', header: 'Home Features', aliases: ['Features', 'Unit Features'], kind: 'tags', expected: true,
    missing_means: 'views, private outdoor space and finishes cannot be derived' },
  { id: 'amenities', header: 'Building Amenities', aliases: ['Amenities'], kind: 'tags', expected: true,
    missing_means: 'service level, parking, shared outdoor space and amenities cannot be derived' },
  // Not in the reference export; recognised if a variant carries it.
  { id: 'year_built', header: 'Year Built', aliases: ['Built'], kind: 'count', expected: false,
    missing_means: 'building era comes from the listing lookup' },
];

export function normalizeHeader(header: string): string {
  return header.replace(/^﻿/, '').toLowerCase().replace(/\s+/g, ' ').replace(/\s*:$/, '').trim();
}

const BY_HEADER = new Map<string, ColumnSpec>();
for (const spec of COLUMNS) {
  for (const name of [spec.header, ...spec.aliases]) BY_HEADER.set(normalizeHeader(name), spec);
}

export interface ColumnMapping {
  /** Column id → index in the row. */
  index: Map<string, number>;
  mapped: { id: string; header: string; index: number; matched_alias: boolean }[];
  unknown: { header: string; index: number }[];
  duplicates: { id: string; header: string; index: number }[];
  missing: ColumnSpec[];
}

export function mapColumns(headers: readonly string[]): ColumnMapping {
  const index = new Map<string, number>();
  const mapped: ColumnMapping['mapped'] = [];
  const unknown: ColumnMapping['unknown'] = [];
  const duplicates: ColumnMapping['duplicates'] = [];
  headers.forEach((raw, i) => {
    const normalized = normalizeHeader(raw);
    const spec = BY_HEADER.get(normalized);
    if (!spec) {
      unknown.push({ header: raw.trim() === '' ? `(column ${i + 1})` : raw.trim(), index: i });
    } else if (index.has(spec.id)) {
      duplicates.push({ id: spec.id, header: raw.trim(), index: i });
    } else {
      index.set(spec.id, i);
      mapped.push({ id: spec.id, header: raw.trim(), index: i, matched_alias: normalized !== normalizeHeader(spec.header) });
    }
  });
  const missing = COLUMNS.filter((spec) => spec.expected && !index.has(spec.id));
  return { index, mapped, unknown, duplicates, missing };
}
