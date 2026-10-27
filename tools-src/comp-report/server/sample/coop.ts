// The co-op sample (Dispatch 23, NW-054 b): for now, Hannah's 100 Barclay
// export read as co-ops, ported from dev/seed-report.mjs. Every comp becomes a
// Co-op in a co-op building and loses its size and its $/sqft, as most co-op
// listings have none. When Kimani pulls a real co-op export, a generated file
// (as barclay-17l-export.ts is) replaces this.
import { SAMPLE_EXPORT } from './barclay-17l-export.ts';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1);
}

/** A StreetEasy export's comps as co-ops, with no sizes. */
export function coopCsv(csv: string): string {
  const rows = parseCsv(csv);
  const header = rows[0]!;
  const at = (name: string) => header.indexOf(name);
  for (const r of rows.slice(1)) {
    r[at('Property Type')] = 'Co-op';
    r[at('Sqft')] = '';
    r[at('$/Sqft')] = '';
    if (at('Building Type') >= 0) r[at('Building Type')] = 'Co-op building';
  }
  const cell = (c: string) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export const SAMPLE_COOP_EXPORT = {
  filename: 'streeteasy-comp-export-100-barclay-17l-coop-sample.csv',
  asOf: SAMPLE_EXPORT.asOf,
  csv: coopCsv(SAMPLE_EXPORT.csv),
};

/** The export the sample import stores for a report of that kind. */
export function sampleExport(kind: 'condo' | 'coop'): { filename: string; asOf: string; csv: string } {
  return kind === 'coop' ? SAMPLE_COOP_EXPORT : SAMPLE_EXPORT;
}
