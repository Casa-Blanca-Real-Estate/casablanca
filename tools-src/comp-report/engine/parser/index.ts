// The StreetEasy comp export parser (§6.2). CSV and XLSX, one schema.
//
// - Columns are found by header name, never by position. Unknown columns are
//   kept (each comp's `extra_columns`) and reported; missing ones are warnings.
// - "$4,650,000", "2,201 ft²", "~1,840 ft²" are read as whole numbers; a
//   leading "~" marks the value approximate.
// - The export's `$/Sqft` column is never used: StreetEasy switches it from
//   sale price to asking price by status and truncates it. The engine
//   recomputes $/sqft itself, with its basis.
// - A /closing/ URL is a public-record closing without listing data. It's
//   flagged, and its zeros (days on market, views, saves, shares) are read as
//   "no data", not zero.
// - Features, amenities and policies are split into tags; views, outdoor
//   presence, service level, parking and unit type are derived from them.
// - Every comp gets a stable property key (§12).
//
// The export date is an input: the engine has no clock.

import { EXPORT_SCHEMA, PARSER_VERSION } from '../version.ts';
import { isIsoDate, type IsoDate } from '../util/dates.ts';
import { cp1252Decode, utf8DecodeStrict } from '../util/utf8.ts';
import type { CompRecord, Confidence, PropertyFacts, Sourced, UnitTypeTag } from '../types.ts';
import { readCsv } from './csv.ts';
import { COLUMNS, mapColumns, type ColumnMapping } from './columns.ts';
import { deriveFromAmenities, deriveFromFeatures, unitLabelSuggestsPenthouse } from './derive.ts';
import { identify } from './property-key.ts';
import {
  cellText, isBlank, readArea, readCount, readDate, readFloor, readHalfCount, readMoney,
  readPropertyType, readStatus, readTags, type Cell, type Read,
} from './values.ts';
import { isZip } from './xlsx/zip.ts';
import { readFirstSheet } from './xlsx/workbook.ts';

export { identify, normalizeStreet, normalizeUnit, sameBuilding, sameUnit, PROPERTY_KEY_VERSION } from './property-key.ts';
export { COLUMNS } from './columns.ts';

export interface ParseOptions {
  /** The date the export was pulled from StreetEasy — every value's as-of date. */
  as_of: IsoDate;
  /** Shown in warnings; optional. */
  filename?: string;
}

export type ParseWarningCode =
  | 'missing_column' | 'unknown_column' | 'duplicate_column' | 'renamed_column'
  | 'unreadable_value' | 'value_adjusted' | 'closing_record' | 'approx_area'
  | 'unrecognised_status' | 'missing_address' | 'duplicate_property' | 'ragged_row'
  | 'encoding' | 'file_note' | 'no_rows';

export interface ParseWarning {
  code: ParseWarningCode;
  message: string;
  /** 1-based data row (the header is row 0), when the warning is about one row. */
  row?: number;
  column?: string;
}

export interface ParsedExport {
  parser: { version: string; schema: string };
  format: 'csv' | 'xlsx';
  as_of: IsoDate;
  filename: string | null;
  columns: {
    mapped: { id: string; header: string; index: number }[];
    unknown: string[];
    missing: string[];
  };
  comps: CompRecord[];
  warnings: ParseWarning[];
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/** Parses an export from its bytes, CSV or XLSX (detected from the content). */
export function parseExport(bytes: Uint8Array, options: ParseOptions): ParsedExport {
  if (isZip(bytes)) return parseXlsxExport(bytes, options);
  const warnings: ParseWarning[] = [];
  let text = utf8DecodeStrict(bytes);
  if (text === null) {
    text = cp1252Decode(bytes);
    warnings.push({
      code: 'encoding',
      message: 'the file is not UTF-8; read it as Windows-1252, which is what Excel writes when it re-saves a CSV',
    });
  }
  const parsed = parseCsvExport(text, options);
  parsed.warnings.unshift(...warnings);
  return parsed;
}

export function parseCsvExport(text: string, options: ParseOptions): ParsedExport {
  const { rows, notes } = readCsv(text);
  return build('csv', rows, false, notes, options);
}

export function parseXlsxExport(bytes: Uint8Array, options: ParseOptions): ParsedExport {
  const sheet = readFirstSheet(bytes);
  return build('xlsx', sheet.rows, sheet.date1904, sheet.notes, options);
}

function build(
  format: 'csv' | 'xlsx', rows: Cell[][], date1904: boolean, fileNotes: string[], options: ParseOptions,
): ParsedExport {
  if (!isIsoDate(options.as_of)) throw new ParseError(`as_of must be an ISO date (YYYY-MM-DD), got ${JSON.stringify(options.as_of)}`);
  const warnings: ParseWarning[] = fileNotes.map((message) => ({ code: 'file_note' as const, message }));
  const headerIndex = rows.findIndex((r) => r.some((c) => !isBlank(c)));
  if (headerIndex < 0) throw new ParseError('the file is empty');
  const headers = rows[headerIndex]!.map((c) => cellText(c));
  const dataRows = rows.slice(headerIndex + 1);
  const mapping = mapColumns(headers);
  // A column with no header is only worth reporting if something is in it.
  mapping.unknown = mapping.unknown.filter((u) => headers[u.index]!.trim() !== '' || dataRows.some((r) => !isBlank(r[u.index] ?? null)));
  reportColumns(mapping, warnings);

  const comps: CompRecord[] = [];
  const seenKeys = new Map<string, number>();
  dataRows.forEach((cells, i) => {
    if (!cells.some((c) => !isBlank(c))) return;
    const rowNumber = i + 1;
    if (cells.length > headers.length && cells.slice(headers.length).some((c) => !isBlank(c))) {
      warnings.push({ code: 'ragged_row', row: rowNumber, message: `row ${rowNumber} has more cells than there are headers; the extra cells were kept as unnamed columns` });
    }
    const comp = buildComp(cells, rowNumber, headers, mapping, date1904, options.as_of, warnings);
    if (comp.identity.key) {
      const earlier = seenKeys.get(comp.identity.key);
      if (earlier !== undefined) {
        warnings.push({ code: 'duplicate_property', row: rowNumber, message: `row ${rowNumber} is the same property as row ${earlier} (${comp.identity.key})` });
      } else {
        seenKeys.set(comp.identity.key, rowNumber);
      }
    }
    comps.push(comp);
  });
  if (comps.length === 0) warnings.push({ code: 'no_rows', message: 'the export has a header row but no comps' });

  return {
    parser: { version: PARSER_VERSION, schema: EXPORT_SCHEMA },
    format,
    as_of: options.as_of,
    filename: options.filename ?? null,
    columns: {
      mapped: mapping.mapped.map(({ id, header, index }) => ({ id, header, index })),
      unknown: mapping.unknown.map((u) => u.header),
      missing: mapping.missing.map((m) => m.header),
    },
    comps,
    warnings,
  };
}

function reportColumns(mapping: ColumnMapping, warnings: ParseWarning[]): void {
  for (const spec of mapping.missing) {
    warnings.push({ code: 'missing_column', column: spec.header, message: `no "${spec.header}" column: ${spec.missing_means}` });
  }
  for (const u of mapping.unknown) {
    warnings.push({ code: 'unknown_column', column: u.header, message: `unknown column "${u.header}" was kept on every comp but not used` });
  }
  for (const d of mapping.duplicates) {
    warnings.push({ code: 'duplicate_column', column: d.header, message: `a second "${d.header}" column was kept but not used; the first one is used` });
  }
  for (const m of mapping.mapped) {
    if (m.matched_alias) {
      const spec = COLUMNS.find((s) => s.id === m.id)!;
      warnings.push({ code: 'renamed_column', column: m.header, message: `read "${m.header}" as StreetEasy's "${spec.header}" column` });
    }
  }
}

function buildComp(
  cells: Cell[], row: number, headers: string[], mapping: ColumnMapping, date1904: boolean,
  asOf: IsoDate, warnings: ParseWarning[],
): CompRecord {
  const cell = (id: string): Cell => {
    const index = mapping.index.get(id);
    return index === undefined ? null : cells[index] ?? null;
  };
  const text = (id: string): string | null => {
    const t = cellText(cell(id));
    return t === '' ? null : t;
  };
  const header = (id: string) => COLUMNS.find((c) => c.id === id)!.header;
  const sourced = <T>(r: Read<T>, id: string, extraNote?: string): Sourced<T> | undefined => {
    if (r.note) {
      warnings.push({
        code: r.value === null ? 'unreadable_value' : 'value_adjusted', row, column: header(id),
        message: `row ${row}, ${header(id)}: ${r.note}`,
      });
    }
    if (r.value === null) return undefined;
    const confidence: Confidence = r.approx ? 'approx' : 'exact';
    const note = [r.note, extraNote].filter(Boolean).join('; ');
    return note
      ? { value: r.value, source: 'se_export', as_of: asOf, confidence, note }
      : { value: r.value, source: 'se_export', as_of: asOf, confidence };
  };
  const exact = <T>(value: T, note: string): Sourced<T> => ({ value, source: 'se_export', as_of: asOf, confidence: 'exact', note });

  const identity = identify({
    address: text('address'), unit: text('unit'), url: text('listing_url'), building_address: text('building_address'),
  });
  if (!identity.key) {
    warnings.push({ code: 'missing_address', row, message: `row ${row} has no address, so it has no stable property key` });
  }
  const closing = identity.streeteasy?.kind === 'closing';
  const status = readStatus(cell('status'));
  if (status.raw && !status.evidence_class) {
    warnings.push({ code: 'unrecognised_status', row, message: `row ${row}: status "${status.raw}" isn't sold, in contract or active, so this comp can't enter any statistic` });
  }

  const facts: PropertyFacts = {};
  const set = <K extends keyof PropertyFacts>(key: K, value: PropertyFacts[K] | undefined) => {
    if (value !== undefined) facts[key] = value;
  };
  set('property_type', sourced(readPropertyType(cell('property_type')), 'property_type'));
  const area = sourced(readArea(cell('sqft')), 'sqft');
  set('area_sqft', area);
  if (area?.confidence === 'approx') {
    warnings.push({ code: 'approx_area', row, column: 'Sqft', message: `row ${row}: the area ${cellText(cell('sqft'))} is marked approximate by StreetEasy (likely AI-inferred); its $/sqft inherits that` });
  }
  set('beds', sourced(readCount(cell('beds')), 'beds'));
  set('baths', sourced(readHalfCount(cell('baths')), 'baths'));
  set('floor', sourced(readFloor(cell('floor')), 'floor'));
  set('sale_price', sourced(readMoney(cell('sale_price')), 'sale_price'));
  set('list_price', sourced(readMoney(cell('list_price')), 'list_price'));
  set('status_date', sourced(readDate(cell('status_date'), date1904), 'status_date'));
  set('common_charges_monthly', sourced(readMoney(cell('common_charges')), 'common_charges'));
  set('taxes_monthly', sourced(readMoney(cell('taxes')), 'taxes'));
  set('maintenance_monthly', sourced(readMoney(cell('maintenance')), 'maintenance'));
  set('building_units', sourced(readCount(cell('building_units')), 'building_units'));
  set('building_stories', sourced(readCount(cell('building_stories')), 'building_stories'));
  set('year_built', sourced(readCount(cell('year_built')), 'year_built'));

  // A closing record's zeros mean "no listing data", not zero.
  const dom = readCount(cell('days_on_market'));
  if (!(closing && dom.value === 0)) set('days_on_market', sourced(dom, 'days_on_market'));
  const engagementCount = (id: string): number | null => {
    const r = readCount(cell(id));
    return closing && r.value === 0 ? null : r.value;
  };
  const engagement = closing && ['page_views', 'saves', 'shares'].every((id) => !(readCount(cell(id)).value))
    ? null
    : { page_views: engagementCount('page_views'), saves: engagementCount('saves'), shares: engagementCount('shares') };

  const tags = {
    features: readTags(cell('features')),
    amenities: readTags(cell('amenities')),
    policies: readTags(cell('policies')),
  };
  if (tags.features.length > 0) {
    const f = deriveFromFeatures(tags.features);
    facts.views = exact(f.views, f.views.length ? 'from the Home Features view tags' : 'no view listed among the Home Features');
    facts.outdoor_private = exact(f.outdoor_kinds.length > 0, f.outdoor_kinds.length ? `Home Features list ${f.outdoor_kinds.join(', ')}` : 'no private outdoor space listed among the Home Features');
    facts.outdoor_kinds = exact(f.outdoor_kinds, 'from the Home Features; the export carries no outdoor size');
    facts.finishes = exact(f.finishes, 'Home Features other than views, outdoor space and unit type');
    facts.unit_type = exact(f.unit_type, f.unit_type.length ? 'from the Home Features' : 'no penthouse, duplex, triplex or loft listed among the Home Features');
  }
  const unitRaw = identity.unit.raw;
  if (unitLabelSuggestsPenthouse(unitRaw) && !facts.unit_type?.value.includes('penthouse')) {
    const types: UnitTypeTag[] = [...(facts.unit_type?.value ?? []), 'penthouse'];
    facts.unit_type = {
      value: types.sort(), source: 'se_export', as_of: asOf, confidence: 'inferred',
      note: `the unit label ${unitRaw} suggests a penthouse — confirm`,
    };
  }
  if (tags.amenities.length > 0) {
    const a = deriveFromAmenities(tags.amenities);
    facts.service = exact(a.service, 'from the Building Amenities');
    facts.parking = exact(a.parking, a.parking.length ? 'from the Building Amenities; deeded or not can\'t be told' : 'no parking listed among the Building Amenities');
    facts.outdoor_shared = exact(a.outdoor_shared, a.outdoor_shared ? 'shared outdoor space listed among the Building Amenities' : 'no shared outdoor space listed among the Building Amenities');
    facts.amenities = exact(a.amenities, 'Building Amenities other than door service, parking and shared outdoor space');
  }
  if (tags.policies.length > 0) {
    facts.policies = exact(tags.policies.map((p) => p.toLowerCase()).sort(), 'from the Building Policies');
  }

  if (closing) {
    warnings.push({
      code: 'closing_record', row,
      message: `row ${row} (${identity.address.street ?? 'no address'} ${identity.unit.raw ?? ''}) is a public-record closing: no asking price, days on market, engagement, features or amenities — its condition can't be checked`.replace(/\s+/g, ' '),
    });
  }

  const ppsfRaw = cellText(cell('export_ppsf'));
  const ppsfNumber = ppsfRaw === '' ? null : Number(ppsfRaw.replace(/^~/, '').replace(/[$,\s]|ft²|ft2|sq\.?\s*ft|sqft/gi, ''));

  const extra: Record<string, string> = {};
  const used = new Set(mapping.index.values());
  const width = Math.max(headers.length, cells.length);
  for (let i = 0; i < width; i++) {
    if (used.has(i)) continue;
    const value = cellText(cells[i] ?? null);
    if (value === '') continue;
    const name = headers[i]?.trim() ? headers[i]!.trim() : `(column ${i + 1})`;
    extra[extra[name] === undefined ? name : `${name} (${i + 1})`] = value;
  }

  const record: CompRecord = {
    identity,
    status,
    facts,
    engagement,
    building_name: text('building_name'),
    neighborhood: text('neighborhood'),
    agent_commentary: text('agent_commentary'),
    tags,
    ignored_export_price_per_sqft: ppsfRaw === ''
      ? null
      : { raw: ppsfRaw, value: ppsfNumber !== null && Number.isFinite(ppsfNumber) ? ppsfNumber : null },
    flags: { closing_record: closing, approx_area: area?.confidence === 'approx' },
    origin: { parser_version: PARSER_VERSION, row, as_of: asOf },
  };
  if (Object.keys(extra).length > 0) record.extra_columns = extra;
  return record;
}
