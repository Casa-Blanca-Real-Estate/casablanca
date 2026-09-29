// Parser robustness (§6.2, §6.8): columns by name never position; unknown
// columns kept and reported; missing ones warned; the export's $/Sqft never
// used; tolerant reading of real-world CSV.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compInputsFromExport, compute, deriveFromFeatures, parseCsvExport, parseExport, ParseError, PARSER_VERSION, type ParsedExport,
  type PropertyFacts,
} from '../index.ts';
import { readCsv } from '../parser/csv.ts';
import { readArea, readDate, readFloor, readMoney, readStatus } from '../parser/values.ts';
import { EXPORT_DATE, fixtureText, HANNAH_CSV, hannah, input, KEY } from './helpers.ts';

const original = hannah();

/** The export as a grid, rewritten column by column, and back to CSV. */
function rewrite(transform: (header: string[], rows: string[][]) => [string[], string[][]]): string {
  const [header, ...rows] = readCsv(fixtureText(HANNAH_CSV)).rows;
  const [h, r] = transform(header!, rows);
  const q = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [h, ...r].map((row) => row.map(q).join(',')).join('\n');
}

const parse = (text: string): ParsedExport => parseCsvExport(text, { as_of: EXPORT_DATE });

test('columns are mapped by name: a shuffled export parses to the same comps', () => {
  const order = [30, 3, 0, 12, 9, 1, 27, 5, 11, 19, 2, 14, 7, 22, 16, 25, 4, 29, 10, 18, 6, 28, 13, 21, 8, 24, 17, 26, 15, 23, 20];
  assert.equal(new Set(order).size, 31);
  const shuffled = parse(rewrite((h, rows) => [order.map((i) => h[i]!), rows.map((r) => order.map((i) => r[i] ?? ''))]));
  assert.deepEqual(shuffled.comps, original.comps);
  assert.deepEqual(shuffled.columns.unknown, []);
  assert.deepEqual(shuffled.columns.missing, []);
  assert.equal(shuffled.columns.mapped.find((m) => m.id === 'sale_price')!.index, order.indexOf(11));
});

test('missing columns are warnings that say what they cost, and the engine still runs', () => {
  const drop = new Set(['Floor', 'Monthly Taxes', '$/Sqft', 'Home Features']);
  const text = rewrite((h, rows) => {
    const keep = h.map((name, i) => (drop.has(name) ? -1 : i)).filter((i) => i >= 0);
    return [keep.map((i) => h[i]!), rows.map((r) => keep.map((i) => r[i] ?? ''))];
  });
  const parsed = parse(text);
  assert.deepEqual(parsed.columns.missing.sort(), [...drop].sort());
  for (const name of drop) {
    const w = parsed.warnings.find((x) => x.code === 'missing_column' && x.column === name);
    assert.ok(w, `a warning for ${name}`);
  }
  assert.match(parsed.warnings.find((w) => w.column === '$/Sqft')!.message, /never uses this column/);
  const chambers = parsed.comps.find((c) => c.identity.key === KEY.chambers)!;
  assert.equal(chambers.facts.floor, undefined);
  assert.equal(chambers.facts.taxes_monthly, undefined);
  assert.equal(chambers.facts.views, undefined);
  const out = compute(input({ comps: compInputsFromExport(parsed, { tier: 'primary' }) }));
  assert.equal(Math.trunc(out.results.on_facts.evidence.sold.price_per_sqft!.mean.value), 1906);
  assert.equal(out.comps.find((c) => c.id === KEY.chambers)!.per_result.on_facts.monthly_carry, null);
});

test('extra columns are kept on every comp and reported; recognised optional ones are used', () => {
  const text = rewrite((h, rows) => [
    [...h, 'Internal Notes', 'Year Built', ''],
    rows.map((r, i) => [...r, `note ${i + 1}`, i === 0 ? '2005' : '', i === 1 ? 'orphan' : '']),
  ]);
  const parsed = parse(text);
  assert.deepEqual(parsed.columns.unknown, ['Internal Notes', '(column 34)']);
  assert.ok(parsed.warnings.some((w) => w.code === 'unknown_column' && w.column === 'Internal Notes'));
  const chambers = parsed.comps.find((c) => c.identity.key === KEY.chambers)!;
  assert.deepEqual(chambers.extra_columns, { 'Internal Notes': 'note 1' });
  assert.equal(chambers.facts.year_built?.value, 2005);
  assert.deepEqual(parsed.comps.find((c) => c.identity.key === KEY.laight)!.extra_columns, { 'Internal Notes': 'note 2', '(column 34)': 'orphan' });
  // Nothing else changes.
  assert.deepEqual(parsed.comps.map((c) => c.facts.area_sqft), original.comps.map((c) => c.facts.area_sqft));
});

test('renamed, re-cased and re-spaced headers are recognised, and reported', () => {
  const renames: Record<string, string> = { 'Listing Status': '  listing   STATUS ', 'Sale Price': 'Sold Price', Beds: 'Bedrooms', 'Listing Price': 'List Price' };
  const parsed = parse(rewrite((h, rows) => [h.map((name) => renames[name] ?? name), rows]));
  assert.deepEqual(parsed.comps, original.comps);
  assert.equal(parsed.warnings.filter((w) => w.code === 'renamed_column').length, 3); // the re-spaced one is the same name
});

test('a duplicate column is kept but not used; the first is used', () => {
  const parsed = parse(rewrite((h, rows) => [[...h, 'Sqft'], rows.map((r) => [...r, '9,999 ft²'])]));
  assert.ok(parsed.warnings.some((w) => w.code === 'duplicate_column' && w.column === 'Sqft'));
  const chambers = parsed.comps.find((c) => c.identity.key === KEY.chambers)!;
  assert.equal(chambers.facts.area_sqft?.value, 2201);
  assert.equal(chambers.extra_columns?.['Sqft'], '9,999 ft²');
});

test("the export's $/Sqft column never reaches a result", () => {
  const junk = parse(rewrite((h, rows) => [h, rows.map((r) => r.map((v, i) => (h[i] === '$/Sqft' ? '$1 ft²' : v)))]));
  const a = compute(input());
  const b = compute(input({ comps: compInputsFromExport(junk, { tier: 'primary' }) }));
  assert.deepEqual(b.results, a.results);
  assert.deepEqual(b.comps, a.comps);
  assert.notEqual(b.meta.inputs_hash, a.meta.inputs_hash); // the input did change
});

test('the parser records its version and the export date on every comp', () => {
  assert.equal(original.parser.version, PARSER_VERSION);
  for (const c of original.comps) {
    assert.equal(c.origin?.parser_version, PARSER_VERSION);
    assert.equal(c.origin?.as_of, EXPORT_DATE);
    for (const v of Object.values(c.facts)) {
      assert.equal(v.source, 'se_export');
      assert.equal(v.as_of, EXPORT_DATE);
    }
  }
  assert.deepEqual(original.comps.map((c) => c.origin?.row), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test('tags are split, and service, outdoor presence, parking and views are derived from them', () => {
  const get = (key: string) => original.comps.find((c) => c.identity.key === key)!;
  const chambers = get(KEY.chambers);
  assert.deepEqual(chambers.tags.policies, ['Pets allowed']);
  assert.equal(chambers.tags.amenities.length, 10);
  assert.deepEqual(chambers.facts.service?.value, { doorman: 'full_time', concierge: true });
  assert.deepEqual(chambers.facts.views?.value, ['city', 'water']);
  assert.equal(chambers.facts.outdoor_private?.value, false); // none listed…
  assert.match(chambers.facts.outdoor_private?.note ?? '', /no private outdoor space listed/);
  assert.equal(chambers.facts.outdoor_shared?.value, true);
  assert.deepEqual(chambers.facts.parking?.value, []);
  const franklin = get(KEY.franklin);
  assert.deepEqual(franklin.facts.outdoor_kinds?.value, ['balcony', 'terrace']);
  assert.equal(franklin.facts.outdoor_area_sqft, undefined); // presence only — the export has no size
  assert.deepEqual(franklin.facts.parking?.value, ['garage', 'valet']);
  assert.deepEqual(get(KEY.hudson).facts.service?.value, { doorman: 'none_listed', concierge: false });
  assert.deepEqual(get(KEY.hudson).facts.unit_type?.value, ['loft']);
  assert.deepEqual(get(KEY.leonard108).facts.service?.value, { doorman: 'hours_unspecified', concierge: true });
  assert.equal(get(KEY.leonard108).facts.views, undefined); // no Home Features at all: unknown, not "none"
  const reade = get(KEY.reade);
  assert.deepEqual(reade.facts.outdoor_kinds?.value, ['roof_deck', 'terrace']);
  // No penthouse among its Home Features — that "none listed" fact stands, approximate — but its "PHA" label suggests one.
  assert.deepEqual(reade.facts.unit_type?.value, []);
  assert.equal(reade.facts.unit_type?.confidence, 'approx');
  assert.equal(reade.suggestions?.length, 1);
  assert.deepEqual(reade.suggestions![0]!.value.value, ['penthouse']);
  assert.equal(reade.suggestions![0]!.value.confidence, 'inferred');
  const out = compute(input());
  const pending = out.pending_confirmation.find((p) => p.target === KEY.reade && p.what === 'unit_type')!;
  assert.deepEqual(pending.value, ['penthouse']);
  // Confirmed by the agent, it's used.
  const confirmed = compute(input({ stated_facts: [{ id: 'ph', target: { comp_id: KEY.reade }, field: 'unit_type', value: { value: ['penthouse'], source: 'agent', as_of: '2026-09-24', confidence: 'exact' } }] }));
  assert.ok(!confirmed.pending_confirmation.some((p) => p.target === KEY.reade && p.what === 'unit_type'));
});

test('"none listed" is approximate; a listed tag is exact; a blank column is unknown', () => {
  const get = (key: string) => original.comps.find((c) => c.identity.key === key)!;
  const conf = (key: string, field: keyof PropertyFacts) => {
    const f = get(key).facts[field];
    return f ? [f.value, f.confidence] : undefined;
  };
  // 200 Chambers: Central air; City view; Water view; Dishwasher; Hardwood floors; Washer/dryer.
  assert.deepEqual(conf(KEY.chambers, 'views'), [['city', 'water'], 'exact']);
  assert.deepEqual(conf(KEY.chambers, 'central_air'), [true, 'exact']);
  assert.deepEqual(conf(KEY.chambers, 'dishwasher'), [true, 'exact']);
  assert.deepEqual(conf(KEY.chambers, 'laundry'), ['installed', 'exact']);
  assert.deepEqual(conf(KEY.chambers, 'finishes'), [['hardwood floors'], 'exact']);
  assert.deepEqual(conf(KEY.chambers, 'fireplace'), [false, 'approx']);
  assert.match(get(KEY.chambers).facts.fireplace!.note!, /no fireplace listed among the Home Features/);
  assert.deepEqual(conf(KEY.chambers, 'outdoor_private'), [false, 'approx']);
  assert.deepEqual(conf(KEY.chambers, 'outdoor_kinds'), [[], 'approx']);
  assert.deepEqual(conf(KEY.chambers, 'unit_type'), [[], 'approx']);
  assert.deepEqual(conf(KEY.chambers, 'parking'), [[], 'approx']);
  assert.deepEqual(conf(KEY.chambers, 'outdoor_shared'), [true, 'exact']);
  assert.deepEqual(conf(KEY.chambers, 'service'), [{ doorman: 'full_time', concierge: true }, 'exact']);
  // 181 Hudson: Dishwasher; Loft; Washer/dryer — and no doorman or concierge among its amenities.
  assert.deepEqual(conf(KEY.hudson, 'central_air'), [false, 'approx']);
  assert.deepEqual(conf(KEY.hudson, 'views'), [[], 'approx']);
  assert.deepEqual(conf(KEY.hudson, 'unit_type'), [['loft'], 'exact']);
  assert.deepEqual(conf(KEY.hudson, 'service'), [{ doorman: 'none_listed', concierge: false }, 'approx']);
  assert.match(get(KEY.hudson).facts.service!.note!, /no doorman and no concierge listed/);
  // A gas fireplace is a fireplace; 66 Leonard lists one, 77 Reade lists a plain "Fireplace".
  assert.deepEqual(conf(KEY.leonard66, 'fireplace'), [true, 'exact']);
  assert.deepEqual(conf(KEY.reade, 'fireplace'), [true, 'exact']);
  // 108 Leonard's Home Features are blank: unknown, never "none listed".
  for (const field of ['views', 'central_air', 'dishwasher', 'fireplace', 'laundry', 'finishes', 'outdoor_private', 'unit_type'] as const) {
    assert.equal(get(KEY.leonard108).facts[field], undefined, field);
  }
  // Laundry's permitted state, from a listing that says so; installed wins whatever the order.
  const derive = (tags: string[]) => deriveFromFeatures(tags).laundry;
  assert.equal(derive(['Washer/dryer allowed']), 'permitted');
  assert.equal(derive(['Washer/dryer allowed', 'Washer/dryer']), 'installed');
  assert.equal(derive(['Washer/Dryer', 'W/D allowed']), 'installed');
  assert.equal(derive(['Hardwood floors']), 'none_listed');
  // Shared laundry isn't in-unit laundry, and a decorative fireplace isn't a working one: both stay among the finishes.
  assert.deepEqual(deriveFromFeatures(['Washer/dryer in building', 'Decorative fireplace']), {
    views: [], outdoor_kinds: [], unit_type: [], central_air: false, dishwasher: false, fireplace: false, laundry: 'none_listed',
    finishes: ['decorative fireplace', 'washer/dryer in building'],
  });
  assert.deepEqual(deriveFromFeatures(['Central AC', 'Dish washer', 'Wood-burning fireplace']), {
    views: [], outdoor_kinds: [], unit_type: [], central_air: true, dishwasher: true, fireplace: true, laundry: 'none_listed', finishes: [],
  });
});

test('CSV edge cases: BOM, CRLF, quoted commas, quotes and line breaks, blank lines', () => {
  const text = '﻿Address,Unit,Listing Status,Sale Price,Sqft,Agent Commentary\r\n' +
    '"1 Main Street, New York, NY",#2A,SOLD,"$1,000,000","1,000 ft²","Says ""mint"",\r\nsee plan"\r\n' +
    '\r\n' +
    '"2 Main Street, New York, NY",#3B,SOLD,"$2,000,000","2,000 ft²",\r\n';
  const parsed = parse(text);
  assert.equal(parsed.comps.length, 2);
  assert.equal(parsed.comps[0]!.agent_commentary, 'Says "mint",\r\nsee plan');
  assert.equal(parsed.comps[0]!.facts.sale_price?.value, 1_000_000);
  assert.equal(parsed.comps[1]!.identity.key, 'pk1|ny|new york|2 main st|3B');
  assert.equal(parsed.comps[1]!.origin?.row, 3); // the blank line keeps its row number
});

test('a CSV re-saved by Excel as Windows-1252 still reads', () => {
  const utf8 = 'Address,Unit,Listing Status,Sale Price,Sqft\n"1 Main Street, New York, NY",#2A,SOLD,"$1,000,000","~1,000 ft²"\n';
  const bytes = Uint8Array.from([...utf8].map((ch) => (ch === '²' ? 0xb2 : ch.charCodeAt(0))));
  const parsed = parseExport(bytes, { as_of: EXPORT_DATE });
  assert.ok(parsed.warnings.some((w) => w.code === 'encoding'));
  assert.equal(parsed.comps[0]!.facts.area_sqft?.value, 1000);
  assert.equal(parsed.comps[0]!.facts.area_sqft?.confidence, 'approx');
});

test('cell formats', () => {
  assert.deepEqual(readMoney('$4,650,000'), { value: 4_650_000, approx: false, note: null });
  assert.deepEqual(readMoney(4_650_000), { value: 4_650_000, approx: false, note: null });
  assert.equal(readMoney('~$4.65M').value, 4_650_000);
  assert.equal(readMoney('$4.65M').approx, true); // a rounded display figure
  assert.equal(readMoney('$2,862/mo').value, 2862);
  assert.equal(readMoney('call').value, null);
  assert.equal(readMoney('').value, null);
  assert.deepEqual(readArea('2,201 ft²'), { value: 2201, approx: false, note: null });
  assert.deepEqual(readArea('~1,840 ft²'), { value: 1840, approx: true, note: null });
  assert.equal(readArea('2,201 sq ft').value, 2201);
  assert.equal(readArea(2201).value, 2201);
  assert.equal(readArea('1,840.4 ft²').value, 1840);
  assert.match(readArea('1,840.4 ft²').note ?? '', /rounded/);
  assert.equal(readArea('0 ft²').value, null);
  assert.equal(readFloor('10').value, 10);
  assert.equal(readFloor('PH').value, null);
  assert.match(readFloor('PH').note ?? '', /label/);
  assert.equal(readDate('8/27/2026').value, '2026-08-27');
  assert.equal(readDate('2026-08-27').value, '2026-08-27');
  assert.equal(readDate('8/27/26').value, '2026-08-27');
  assert.match(readDate('8/27/26').note ?? '', /two-digit/);
  assert.equal(readDate('2/30/2026').value, null);
  assert.equal(readDate(46261).value, '2026-08-27'); // a spreadsheet serial
  assert.deepEqual(readStatus('Contract Signed'), { raw: 'Contract Signed', evidence_class: 'in_contract' });
  assert.deepEqual(readStatus('CLOSED'), { raw: 'CLOSED', evidence_class: 'sold' });
  assert.deepEqual(readStatus('Temporarily Off Market'), { raw: 'Temporarily Off Market', evidence_class: null });
});

test('an unrecognised status is kept, warned, and kept out of every statistic', () => {
  const parsed = parse(rewrite((h, rows) => [h, rows.map((r, i) => (i === 0 ? r.map((v, j) => (h[j] === 'Listing Status' ? 'OFF MARKET' : v)) : r))]));
  assert.ok(parsed.warnings.some((w) => w.code === 'unrecognised_status' && w.row === 1));
  const out = compute(input({ comps: compInputsFromExport(parsed, { tier: 'primary' }) }));
  const c = out.comps.find((x) => x.id === KEY.chambers)!;
  assert.equal(c.flags.unrecognised_status, true);
  assert.equal(c.per_result.on_facts.included, false);
  assert.equal(out.results.on_facts.evidence.sold.counts.total, 4);
});

test('title lines above the headers are skipped, not mistaken for them', () => {
  const titled = 'Comps for 100 Barclay Street #17L\nPrepared 9/23/2026\n\n' + fixtureText(HANNAH_CSV);
  const parsed = parse(titled);
  assert.deepEqual(parsed.comps.map((c) => c.identity.key), original.comps.map((c) => c.identity.key));
  assert.deepEqual(parsed.comps.map((c) => c.facts), original.comps.map((c) => c.facts));
  assert.deepEqual(parsed.columns.unknown, []);
  assert.ok(parsed.warnings.some((w) => w.code === 'file_note' && /skipped 2 lines above the column headers/.test(w.message)));
});

test('zeros that mean "no data" are read as missing, and never stop the engine', () => {
  const zeroes = parse(rewrite((h, rows) => [h, rows.map((r) => r.map((v, i) => {
    if (r[0] === '79 Laight Street, New York, NY' && h[i] === 'Listing Price') return '$0'; // the closing's missing ask
    if (r[0] === '181 Hudson Street, New York, NY' && h[i] === 'Sale Price') return '$0'; // a $0 transfer
    if (r[0] === '66 Leonard Street, New York, NY' && h[i] === 'Units in Building') return '0';
    return v;
  }))]));
  const get = (key: string) => zeroes.comps.find((c) => c.identity.key === key)!;
  assert.equal(get(KEY.laight).facts.list_price, undefined);
  assert.equal(get(KEY.hudson).facts.sale_price, undefined);
  assert.equal(get(KEY.leonard66).facts.building_units, undefined);
  assert.equal(zeroes.warnings.filter((w) => w.code === 'zero_price').length, 2);
  assert.match(zeroes.warnings.find((w) => w.code === 'zero_price' && w.row === 3)!.message, /non-market transfer/);
  assert.ok(zeroes.warnings.some((w) => w.code === 'unreadable_value' && w.column === 'Units in Building'));
  const out = compute(input({ comps: compInputsFromExport(zeroes, { tier: 'primary' }) }));
  assert.equal(out.comps.find((c) => c.id === KEY.hudson)!.flags.price_missing, true);
  assert.equal(out.results.on_facts.evidence.sold.price_per_sqft!.n, 4);
});

test('empty and header-only files, and a bad export date', () => {
  assert.throws(() => parse(''), ParseError);
  assert.throws(() => parse('\n\n'), ParseError);
  const headerOnly = parse('Address,Unit,Listing Status\n');
  assert.equal(headerOnly.comps.length, 0);
  assert.ok(headerOnly.warnings.some((w) => w.code === 'no_rows'));
  assert.throws(() => parseCsvExport('Address\n1 Main St', { as_of: '9/23/2026' }), ParseError);
});

test('a slimmer export (a standard-tier guess) parses with warnings rather than failing', () => {
  const keep = ['Address', 'Unit', 'Listing URL', 'Listing Status', 'Status Date', 'Beds', 'Baths', 'Sqft', 'Sale Price', 'Listing Price'];
  const parsed = parse(rewrite((h, rows) => {
    const idx = keep.map((name) => h.indexOf(name));
    return [idx.map((i) => h[i]!), rows.map((r) => idx.map((i) => r[i] ?? ''))];
  }));
  assert.equal(parsed.comps.length, 11);
  assert.equal(parsed.columns.missing.length, 31 - keep.length);
  const out = compute(input({ comps: compInputsFromExport(parsed, { tier: 'primary' }) }));
  assert.equal(Math.trunc(out.results.on_facts.evidence.sold.price_per_sqft!.median.value), 2112);
});
