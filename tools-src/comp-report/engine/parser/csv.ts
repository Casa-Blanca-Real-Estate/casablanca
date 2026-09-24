// A CSV reader (RFC 4180, leniently): quoted fields with "" escapes, commas and
// line breaks inside quotes, CRLF / LF / CR line endings, a leading byte-order
// mark. Returns rows of raw strings; interpretation happens in the column map.

export interface CsvReadResult {
  rows: string[][];
  /** Non-fatal oddities, e.g. a stray quote inside an unquoted field. */
  notes: string[];
}

export function readCsv(text: string): CsvReadResult {
  const rows: string[][] = [];
  const notes: string[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldWasQuoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = '';
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      if (field === '' && !fieldWasQuoted) {
        inQuotes = true;
        fieldWasQuoted = true;
      } else {
        notes.push(`row ${rows.length + 1}: a quote inside an unquoted field was kept as text`);
        field += ch;
      }
      i++;
      continue;
    }
    if (ch === ',') { endField(); i++; continue; }
    if (ch === '\r') { endRow(); i += text[i + 1] === '\n' ? 2 : 1; continue; }
    if (ch === '\n') { endRow(); i++; continue; }
    field += ch;
    i++;
  }
  if (inQuotes) notes.push(`row ${rows.length + 1}: a quoted field never closed; read to the end of the file`);
  // The last row, unless the file ended with a line break.
  if (field !== '' || row.length > 0 || fieldWasQuoted) endRow();
  return { rows, notes };
}
