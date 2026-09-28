// DEFLATE decompression (RFC 1951) — what's inside an .xlsx file's ZIP.
// A straightforward canonical-Huffman decoder after Mark Adler's puff.c:
// small, synchronous, and runs anywhere. Tested against Node's zlib.

class BitReader {
  private readonly data: Uint8Array;
  private pos = 0;
  private bitBuf = 0;
  private bitCount = 0;
  constructor(data: Uint8Array) {
    this.data = data;
  }

  bits(need: number): number {
    let val = this.bitBuf;
    while (this.bitCount < need) {
      if (this.pos >= this.data.length) throw new InflateError('compressed data ended early');
      val |= this.data[this.pos++]! << this.bitCount;
      this.bitCount += 8;
    }
    this.bitBuf = val >>> need;
    this.bitCount -= need;
    return val & ((1 << need) - 1);
  }

  alignToByte(): void {
    this.bitBuf = 0;
    this.bitCount = 0;
  }

  readByte(): number {
    if (this.pos >= this.data.length) throw new InflateError('compressed data ended early');
    return this.data[this.pos++]!;
  }
}

export class InflateError extends Error {
  constructor(message: string) {
    super(`inflate: ${message}`);
    this.name = 'InflateError';
  }
}

const MAX_BITS = 15;

interface Huffman {
  count: Uint16Array; // codes of each length
  symbol: Uint16Array; // symbols in canonical order
}

function buildHuffman(lengths: Uint8Array | number[], n: number): { h: Huffman; incomplete: boolean } {
  const count = new Uint16Array(MAX_BITS + 1);
  const symbol = new Uint16Array(n);
  for (let s = 0; s < n; s++) count[lengths[s]!]!++;
  if (count[0] === n) return { h: { count, symbol }, incomplete: false };
  let left = 1;
  for (let len = 1; len <= MAX_BITS; len++) {
    left <<= 1;
    left -= count[len]!;
    if (left < 0) throw new InflateError('over-subscribed code lengths');
  }
  const offs = new Uint16Array(MAX_BITS + 1);
  for (let len = 1; len < MAX_BITS; len++) offs[len + 1] = offs[len]! + count[len]!;
  for (let s = 0; s < n; s++) if (lengths[s] !== 0) symbol[offs[lengths[s]!]!++] = s;
  return { h: { count, symbol }, incomplete: left > 0 };
}

function decodeSymbol(br: BitReader, h: Huffman): number {
  let code = 0;
  let first = 0;
  let index = 0;
  for (let len = 1; len <= MAX_BITS; len++) {
    code |= br.bits(1);
    const count = h.count[len]!;
    if (code - count < first) return h.symbol[index + (code - first)]!;
    index += count;
    first += count;
    first <<= 1;
    code <<= 1;
  }
  throw new InflateError('invalid Huffman code');
}

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

let fixedTables: { lencode: Huffman; distcode: Huffman } | null = null;
function fixed(): { lencode: Huffman; distcode: Huffman } {
  if (fixedTables) return fixedTables;
  const lengths = new Uint8Array(288);
  for (let s = 0; s < 144; s++) lengths[s] = 8;
  for (let s = 144; s < 256; s++) lengths[s] = 9;
  for (let s = 256; s < 280; s++) lengths[s] = 7;
  for (let s = 280; s < 288; s++) lengths[s] = 8;
  const lencode = buildHuffman(lengths, 288).h;
  const distLengths = new Uint8Array(30).fill(5);
  const distcode = buildHuffman(distLengths, 30).h;
  fixedTables = { lencode, distcode };
  return fixedTables;
}

class Output {
  buf: Uint8Array;
  len = 0;
  private readonly limit: number;
  constructor(expected: number, limit: number) {
    this.limit = limit;
    this.buf = new Uint8Array(Math.max(1024, Math.min(expected, limit)));
  }
  private ensure(extra: number): void {
    const need = this.len + extra;
    if (need > this.limit) throw new InflateError(`output exceeds ${this.limit} bytes`);
    if (need <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < need) size *= 2;
    const next = new Uint8Array(Math.min(size, this.limit));
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  push(byte: number): void {
    this.ensure(1);
    this.buf[this.len++] = byte;
  }
  copy(distance: number, length: number): void {
    if (distance > this.len) throw new InflateError('distance too far back');
    this.ensure(length);
    for (let i = 0; i < length; i++) {
      this.buf[this.len] = this.buf[this.len - distance]!;
      this.len++;
    }
  }
}

function inflateCodes(br: BitReader, out: Output, lencode: Huffman, distcode: Huffman): void {
  for (;;) {
    const sym = decodeSymbol(br, lencode);
    if (sym < 256) { out.push(sym); continue; }
    if (sym === 256) return;
    const li = sym - 257;
    if (li >= 29) throw new InflateError('invalid length symbol');
    const length = LENGTH_BASE[li]! + br.bits(LENGTH_EXTRA[li]!);
    const di = decodeSymbol(br, distcode);
    if (di >= 30) throw new InflateError('invalid distance symbol');
    const distance = DIST_BASE[di]! + br.bits(DIST_EXTRA[di]!);
    out.copy(distance, length);
  }
}

function inflateStored(br: BitReader, out: Output): void {
  br.alignToByte();
  const len = br.readByte() | (br.readByte() << 8);
  const nlen = br.readByte() | (br.readByte() << 8);
  if (len !== (~nlen & 0xffff)) throw new InflateError('stored block length check failed');
  for (let i = 0; i < len; i++) out.push(br.readByte());
}

function inflateDynamic(br: BitReader, out: Output): void {
  const nlen = br.bits(5) + 257;
  const ndist = br.bits(5) + 1;
  const ncode = br.bits(4) + 4;
  if (nlen > 286 || ndist > 30) throw new InflateError('bad dynamic block counts');
  const lengths = new Uint8Array(320);
  for (let i = 0; i < ncode; i++) lengths[CODE_LENGTH_ORDER[i]!] = br.bits(3);
  const { h: lencodeForLengths, incomplete } = buildHuffman(lengths, 19);
  if (incomplete) throw new InflateError('incomplete code-length code');
  const all = new Uint8Array(nlen + ndist);
  let index = 0;
  while (index < nlen + ndist) {
    let sym = decodeSymbol(br, lencodeForLengths);
    if (sym < 16) { all[index++] = sym; continue; }
    let len = 0;
    if (sym === 16) {
      if (index === 0) throw new InflateError('repeat with no previous length');
      len = all[index - 1]!;
      sym = 3 + br.bits(2);
    } else if (sym === 17) {
      sym = 3 + br.bits(3);
    } else {
      sym = 11 + br.bits(7);
    }
    if (index + sym > nlen + ndist) throw new InflateError('too many code lengths');
    while (sym--) all[index++] = len;
  }
  if (all[256] === 0) throw new InflateError('no end-of-block code');
  const lit = buildHuffman(all.subarray(0, nlen), nlen);
  // An incomplete code is allowed only as a single one-bit code (puff.c's rule).
  if (lit.incomplete && nlen !== lit.h.count[0]! + lit.h.count[1]!) throw new InflateError('incomplete literal/length code');
  const dist = buildHuffman(all.subarray(nlen, nlen + ndist), ndist);
  if (dist.incomplete && ndist !== dist.h.count[0]! + dist.h.count[1]!) throw new InflateError('incomplete distance code');
  inflateCodes(br, out, lit.h, dist.h);
}

/**
 * Decompresses raw DEFLATE data. `expectedSize` pre-sizes the output (the ZIP
 * header states it); `limit` caps it, so a malicious file can't exhaust memory.
 */
export function inflateRaw(data: Uint8Array, expectedSize = 0, limit = 64 * 1024 * 1024): Uint8Array {
  const br = new BitReader(data);
  const out = new Output(expectedSize, limit);
  let last = 0;
  do {
    last = br.bits(1);
    const type = br.bits(2);
    if (type === 0) inflateStored(br, out);
    else if (type === 1) { const t = fixed(); inflateCodes(br, out, t.lencode, t.distcode); }
    else if (type === 2) inflateDynamic(br, out);
    else throw new InflateError('invalid block type');
  } while (!last);
  return out.buf.slice(0, out.len);
}
