// An .xlsx workbook's first worksheet as rows of cells — the same shape the
// CSV reader produces, so both formats share one column map (§6.2: "XLSX is
// the same schema").

import type { Cell } from '../values.ts';
import { utf8DecodeStrict } from '../../util/utf8.ts';
import { attrLocal, childElements, firstChild, parseXml, textOf, type XmlElement } from './xml.ts';
import { isZip, listEntries, readEntry, ZipError, type ZipEntry } from './zip.ts';

export interface SheetReadResult {
  sheetName: string;
  rows: Cell[][];
  /** The workbook counts dates from 1904 (old Mac Excel) rather than 1900. */
  date1904: boolean;
  notes: string[];
}

export class XlsxError extends Error {
  constructor(message: string) {
    super(`xlsx: ${message}`);
    this.name = 'XlsxError';
  }
}

function xmlPart(bytes: Uint8Array, entries: Map<string, ZipEntry>, path: string): XmlElement | null {
  const entry = entries.get(path);
  if (!entry) return null;
  const text = utf8DecodeStrict(readEntry(bytes, entry));
  if (text === null) throw new XlsxError(`${path} is not valid UTF-8`);
  return parseXml(text);
}

function resolvePart(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/');
  parts.pop();
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}

/** "AB12" → 27 (zero-based column index). */
export function columnIndex(ref: string): number | null {
  const match = /^([A-Z]+)\d*$/i.exec(ref);
  if (!match) return null;
  let n = 0;
  for (const ch of match[1]!.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sharedStringText(si: XmlElement): string {
  // Rich text is a run of <r><t/></r>; phonetic guides (<rPh>) aren't content.
  let s = '';
  for (const child of childElements(si)) {
    if (child.name === 't') s += textOf(child);
    else if (child.name === 'r') for (const t of childElements(child, 't')) s += textOf(t);
  }
  return s;
}

export function readFirstSheet(bytes: Uint8Array): SheetReadResult {
  if (!isZip(bytes)) throw new XlsxError('not an .xlsx file (no ZIP signature)');
  let entries: Map<string, ZipEntry>;
  try {
    entries = new Map(listEntries(bytes).map((e) => [e.name, e]));
  } catch (error) {
    if (error instanceof ZipError) throw new XlsxError(error.message);
    throw error;
  }
  const notes: string[] = [];
  const workbook = xmlPart(bytes, entries, 'xl/workbook.xml');
  if (!workbook) throw new XlsxError('no xl/workbook.xml — not a spreadsheet');
  const date1904 = ['1', 'true'].includes(firstChild(workbook, 'workbookPr')?.attrs['date1904'] ?? '');
  const sheets = firstChild(workbook, 'sheets');
  const sheet = sheets ? childElements(sheets, 'sheet')[0] : undefined;
  if (!sheet) throw new XlsxError('the workbook has no sheets');
  const sheetName = sheet.attrs['name'] ?? 'Sheet1';
  if (sheets && childElements(sheets, 'sheet').length > 1) notes.push(`read the first sheet ("${sheetName}") of several`);

  let sheetPath = 'xl/worksheets/sheet1.xml';
  const relId = attrLocal(sheet, 'id');
  const rels = xmlPart(bytes, entries, 'xl/_rels/workbook.xml.rels');
  if (rels && relId) {
    const rel = childElements(rels, 'Relationship').find((r) => r.attrs['Id'] === relId);
    if (rel?.attrs['Target']) sheetPath = resolvePart('xl/workbook.xml', rel.attrs['Target']);
  }
  const worksheet = xmlPart(bytes, entries, sheetPath);
  if (!worksheet) throw new XlsxError(`missing worksheet part ${sheetPath}`);

  const shared: string[] = [];
  const sst = xmlPart(bytes, entries, 'xl/sharedStrings.xml');
  if (sst) for (const si of childElements(sst, 'si')) shared.push(sharedStringText(si));

  const rows: Cell[][] = [];
  const sheetData = firstChild(worksheet, 'sheetData');
  let nextRow = 1;
  for (const row of sheetData ? childElements(sheetData, 'row') : []) {
    const rowNumber = row.attrs['r'] ? Number(row.attrs['r']) : nextRow;
    nextRow = rowNumber + 1;
    const cells: Cell[] = [];
    let nextCol = 0;
    for (const c of childElements(row, 'c')) {
      const col = c.attrs['r'] ? columnIndex(c.attrs['r']) ?? nextCol : nextCol;
      nextCol = col + 1;
      const type = c.attrs['t'] ?? 'n';
      const v = firstChild(c, 'v');
      let value: Cell = null;
      if (type === 's') {
        const idx = v ? Number(textOf(v)) : NaN;
        value = Number.isInteger(idx) && shared[idx] !== undefined ? shared[idx]! : null;
        if (value === null) notes.push(`row ${rowNumber}: a shared-string reference couldn't be resolved`);
      } else if (type === 'inlineStr') {
        const is = firstChild(c, 'is');
        value = is ? sharedStringText(is) : null;
      } else if (type === 'str' || type === 'd') {
        value = v ? textOf(v) : null;
      } else if (type === 'b') {
        value = v ? textOf(v).trim() === '1' : null;
      } else if (type === 'e') {
        notes.push(`row ${rowNumber}: an error cell (${v ? textOf(v) : '?'}) was read as blank`);
        value = null;
      } else if (v) {
        const text = textOf(v).trim();
        const num = Number(text);
        value = text !== '' && Number.isFinite(num) ? num : null;
      }
      while (cells.length < col) cells.push(null);
      cells[col] = value;
    }
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
  }
  return { sheetName, rows, date1904, notes };
}
