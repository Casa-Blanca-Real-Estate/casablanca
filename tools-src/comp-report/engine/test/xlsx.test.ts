// XLSX is the same schema (§6.2). Three workbooks of Hannah's export — text
// cells as StreetEasy formats them, a shared-strings workbook as Excel writes
// one, and native numbers and dates as a user re-saving it would produce —
// must all parse to the same comps as the CSV. The ZIP and DEFLATE readers
// are checked against Node's zlib.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 as nodeCrc32, constants, deflateRawSync } from 'node:zlib';
import { parseExport, parseXlsxExport } from '../index.ts';
import { inflateRaw, InflateError } from '../parser/xlsx/inflate.ts';
import { crc32, listEntries, readEntry } from '../parser/xlsx/zip.ts';
import { parseXml, textOf, XmlError } from '../parser/xlsx/xml.ts';
import { XlsxError } from '../parser/xlsx/workbook.ts';
import { EXPORT_DATE, fixtureBytes, hannah } from './helpers.ts';

const csv = hannah();

for (const name of ['hannah-100-barclay-17l-2026-09-23.xlsx', 'hannah-shared-strings.xlsx', 'hannah-typed.xlsx']) {
  test(`${name} parses to the same comps as the CSV`, () => {
    const parsed = parseExport(fixtureBytes(name), { as_of: EXPORT_DATE });
    assert.equal(parsed.format, 'xlsx');
    assert.deepEqual(parsed.columns, csv.columns);
    assert.deepEqual(parsed.comps, csv.comps);
    assert.deepEqual(parsed.warnings.filter((w) => w.code !== 'file_note'), csv.warnings);
  });
}

// A deterministic pseudo-random stream, so failures reproduce.
function* random(seed: number): Generator<number> {
  let x = seed >>> 0;
  for (;;) {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    yield x;
  }
}

test('inflate matches zlib across block types, levels and strategies', () => {
  const rng = random(20260924);
  const next = () => rng.next().value as number;
  const words = ['Tribeca', 'condo', 'doorman', '$4,650,000', '2,201 ft²', 'SOLD', 'IN CONTRACT', ';', ' ', '\n', '<c r="A1">'];
  const samples: Uint8Array[] = [new Uint8Array(0), Uint8Array.of(0), fixtureBytes('hannah-100-barclay-17l-2026-09-23.csv')];
  for (let i = 0; i < 40; i++) {
    const size = next() % (i < 20 ? 3000 : 200_000);
    if (i % 3 === 0) samples.push(Uint8Array.from({ length: size }, () => next() & 0xff)); // incompressible
    else samples.push(new TextEncoder().encode(Array.from({ length: size / 6 }, () => words[next() % words.length]).join('')));
  }
  const options = [
    { level: 0 }, { level: 1 }, { level: 6 }, { level: 9 },
    { level: 6, strategy: constants.Z_FIXED }, { level: 6, strategy: constants.Z_HUFFMAN_ONLY }, { level: 6, strategy: constants.Z_RLE },
  ];
  for (const sample of samples) {
    for (const opt of options) {
      const compressed = new Uint8Array(deflateRawSync(sample, opt));
      assert.deepEqual(inflateRaw(compressed, sample.length), sample, `size ${sample.length}, ${JSON.stringify(opt)}`);
    }
  }
});

test('inflate refuses corrupt data and caps its output', () => {
  assert.throws(() => inflateRaw(Uint8Array.of(0xff, 0xff, 0xff)), InflateError); // block type 3
  const compressed = new Uint8Array(deflateRawSync(new Uint8Array(100_000)));
  assert.throws(() => inflateRaw(compressed.subarray(0, compressed.length - 5)), InflateError);
  assert.throws(() => inflateRaw(compressed, 0, 50_000), /exceeds/);
});

test('crc32 matches zlib', () => {
  for (const s of ['', 'a', 'The quick brown fox', '2,201 ft²']) {
    const bytes = new TextEncoder().encode(s);
    assert.equal(crc32(bytes), nodeCrc32(bytes));
  }
});

// ── A tiny ZIP writer, for workbooks built in the test ──
function zip(files: Record<string, string>, opts: { corruptCrc?: string; encrypt?: boolean } = {}): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (n: number) => Uint8Array.of(n & 255, (n >> 8) & 255);
  const u32 = (n: number) => Uint8Array.of(n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255);
  const cat = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  for (const [name, body] of Object.entries(files)) {
    const data = enc.encode(body);
    const nameBytes = enc.encode(name);
    const crc = opts.corruptCrc === name ? (crc32(data) ^ 1) >>> 0 : crc32(data);
    const flags = opts.encrypt ? 1 : 0;
    const local = cat(u32(0x04034b50), u16(20), u16(flags), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, data);
    central.push(cat(u32(0x02014b50), u16(20), u16(20), u16(flags), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes));
    chunks.push(local);
    offset += local.length;
  }
  const cd = cat(...central);
  const eocd = cat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(cd.length), u32(offset), u16(0));
  return cat(...chunks, cd, eocd);
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
function workbook(sheet: string, date1904 = false): Record<string, string> {
  return {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': `<workbook ${NS}><workbookPr${date1904 ? ' date1904="1"' : ''}/><sheets><sheet name="Export" sheetId="1" r:id="rId7"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/data.xml"/></Relationships>',
    'xl/worksheets/data.xml': `<worksheet ${NS}><sheetData>${sheet}</sheetData></worksheet>`,
  };
}
const inline = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;

test('a 1904-dated workbook with inline strings, stored entries and gaps between cells', () => {
  // 2026-08-27 is serial 46261 in Excel's 1900 system and 44799 in the 1904 system.
  const sheet = `<row r="1">${inline('A1', 'Address')}${inline('B1', 'Unit')}${inline('C1', 'Listing Status')}${inline('D1', 'Status Date')}${inline('F1', 'Sale Price')}${inline('G1', 'Sqft')}</row>` +
    `<row r="3">${inline('A3', '1 Main Street, New York, NY')}${inline('B3', '#2A')}${inline('C3', 'SOLD')}<c r="D3"><v>44799</v></c><c r="F3"><v>1000000</v></c><c r="G3" t="str"><v>1,000 ft²</v></c></row>`;
  const parsed = parseXlsxExport(zip(workbook(sheet, true)), { as_of: EXPORT_DATE });
  assert.equal(parsed.comps.length, 1);
  const c = parsed.comps[0]!;
  assert.equal(c.facts.status_date?.value, '2026-08-27');
  assert.equal(c.facts.sale_price?.value, 1_000_000);
  assert.equal(c.facts.area_sqft?.value, 1000);
  assert.equal(c.origin?.row, 2); // data row 2: the blank sheet row 2 keeps its place
  assert.ok(parsed.columns.unknown.length === 0);
});

test('corrupt, encrypted and non-workbook files fail with a clear error', () => {
  const sheet = `<row r="1">${inline('A1', 'Address')}</row>`;
  assert.throws(() => parseXlsxExport(zip(workbook(sheet), { corruptCrc: 'xl/worksheets/data.xml' }), { as_of: EXPORT_DATE }), /CRC/);
  assert.throws(() => parseXlsxExport(zip(workbook(sheet), { encrypt: true }), { as_of: EXPORT_DATE }), /encrypted/);
  assert.throws(() => parseXlsxExport(zip({ 'hello.txt': 'hi' }), { as_of: EXPORT_DATE }), XlsxError);
  const good = fixtureBytes('hannah-100-barclay-17l-2026-09-23.xlsx');
  assert.throws(() => parseXlsxExport(good.subarray(0, good.length - 30), { as_of: EXPORT_DATE }), XlsxError);
  assert.throws(() => parseXlsxExport(new TextEncoder().encode('Address,Unit\n'), { as_of: EXPORT_DATE }), /ZIP signature/);
});

test('the ZIP reader lists and reads entries', () => {
  const bytes = zip({ 'a.txt': 'alpha', 'dir/b.txt': 'beta' });
  const entries = listEntries(bytes);
  assert.deepEqual(entries.map((e) => e.name), ['a.txt', 'dir/b.txt']);
  assert.equal(new TextDecoder().decode(readEntry(bytes, entries[1]!)), 'beta');
});

test('the XML reader handles entities, CDATA and prefixes, and refuses DTDs', () => {
  const doc = parseXml('<?xml version="1.0"?><!-- c --><x:root xmlns:x="u"><x:t a="1 &amp; 2">&lt;4&gt; &#8211; &#x2014;<![CDATA[<raw>]]></x:t></x:root>');
  assert.equal(doc.name, 'root');
  const t = doc.children[0] as { attrs: Record<string, string> };
  assert.equal(t.attrs['a'], '1 & 2');
  assert.equal(textOf(doc), '<4> – —<raw>');
  assert.throws(() => parseXml('<!DOCTYPE x [<!ENTITY a "b">]><x>&a;</x>'), XmlError);
  assert.throws(() => parseXml('<a><b></a>'), XmlError);
});
