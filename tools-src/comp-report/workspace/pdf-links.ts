// The listing links in a StreetEasy PDF (Kimani, 2026-10-28): agents usually
// get their comps from StreetEasy as a PDF, and all the tool needs from it is
// each comp's link. The browser reads them out of the file itself, so the PDF
// (often 20 MB) is never uploaded; only the links go to the server, and each
// is read as a pasted link is.
//
// A PDF keeps a link as a /URI string in an annotation. Older files write the
// annotation as plain text; newer ones pack it into a compressed object stream
// (/Type /ObjStm, FlateDecode). Both are searched. Images, fonts and page
// contents are never decompressed: a link isn't kept there.

const latin1 = new TextDecoder('latin1');

/** A PDF literal string's body, unescaped: \( \) \\ \n and octal escapes. */
function literal(body: string): string {
  return body.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, e: string) => {
    if (/^[0-7]/.test(e)) return String.fromCharCode(parseInt(e, 8));
    const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
    return map[e] ?? '';
  });
}

/** Every /URI in a stretch of PDF text: (literal) and <hex> strings. */
export function urisIn(text: string): string[] {
  const out: string[] = [];
  // A literal may hold balanced or escaped parentheses; links almost never do, so escaped ones are enough.
  for (const m of text.matchAll(/\/URI\s*\(((?:\\.|[^\\)])*)\)/g)) out.push(literal(m[1]!));
  for (const m of text.matchAll(/\/URI\s*<([0-9A-Fa-f\s]*)>/g)) {
    const hex = m[1]!.replace(/\s/g, '');
    let s = '';
    for (let i = 0; i + 1 < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    out.push(s);
  }
  return out.map((u) => u.trim()).filter(Boolean);
}

/** The stream inflated, or as much of it as inflates: trailing junk or a cut stream keeps what came before. */
async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  try {
    const reader = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } catch {
    // Keep what inflated before the error.
  }
  if (!chunks.length) return null;
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** True when the bytes start like a PDF (a few bytes of junk before the header are allowed, as readers allow). */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return latin1.decode(bytes.subarray(0, 1024)).includes('%PDF-');
}

/**
 * Every link in the PDF, in the order found, each once. Not only StreetEasy's:
 * the caller keeps the listing links (checkListingLink).
 */
export async function pdfLinks(bytes: Uint8Array): Promise<string[]> {
  const text = latin1.decode(bytes);
  const found = urisIn(text);
  // Compressed object streams: "<< … /Type /ObjStm … >>" then "stream", the data, "endstream".
  for (let at = text.indexOf('/ObjStm'); at >= 0; at = text.indexOf('/ObjStm', at + 7)) {
    const dictStart = text.lastIndexOf('<<', at);
    const kw = text.indexOf('stream', at);
    if (dictStart < 0 || kw < 0) continue;
    const dict = text.slice(dictStart, kw);
    if (!/\/Type\s*\/ObjStm\b/.test(dict) || !/\/FlateDecode\b/.test(dict) || /\/DecodeParms/.test(dict)) continue;
    const start = kw + 6 + (text.startsWith('\r\n', kw + 6) ? 2 : text[kw + 6] === '\n' || text[kw + 6] === '\r' ? 1 : 0);
    // A direct /Length; an indirect one ("12 0 R") falls back to the endstream keyword.
    const len = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dict);
    let end = len ? start + Number(len[1]) : text.indexOf('endstream', start);
    if (!len) while (end > start && (text[end - 1] === '\n' || text[end - 1] === '\r')) end--;
    if (end <= start || end > bytes.length) continue;
    const out = await inflate(bytes.subarray(start, end));
    if (out) found.push(...urisIn(latin1.decode(out)));
    at = Math.max(at, end - 7);
  }
  return [...new Set(found)];
}
