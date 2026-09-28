// Reading a ZIP archive's entries — an .xlsx file is a ZIP of XML parts.
// Stored and deflated entries, checked against their CRC-32. Encrypted and
// ZIP64 archives are refused with a clear message; an export is never either.

import { inflateRaw } from './inflate.ts';

export class ZipError extends Error {
  constructor(message: string) {
    super(`zip: ${message}`);
    this.name = 'ZipError';
  }
}

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  crc32: number;
  localHeaderOffset: number;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(b: Uint8Array, o: number): number {
  if (o + 2 > b.length) throw new ZipError('archive is truncated');
  return b[o]! | (b[o + 1]! << 8);
}
function u32(b: Uint8Array, o: number): number {
  if (o + 4 > b.length) throw new ZipError('archive is truncated');
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}

function decodeName(b: Uint8Array, start: number, length: number): string {
  let s = '';
  for (let i = start; i < start + length; i++) s += String.fromCharCode(b[i]!);
  return s;
}

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function listEntries(bytes: Uint8Array): ZipEntry[] {
  // The end-of-central-directory record sits in the last 22 + 65,535 bytes.
  const minEocd = Math.max(0, bytes.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= minEocd; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('not a ZIP archive (no end-of-central-directory record)');
  const count = u16(bytes, eocd + 10);
  const cdOffset = u32(bytes, eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new ZipError('ZIP64 archives are not supported');
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (u32(bytes, p) !== 0x02014b50) throw new ZipError('corrupt central directory');
    const flags = u16(bytes, p + 8);
    const method = u16(bytes, p + 10);
    const crc = u32(bytes, p + 16);
    const compressedSize = u32(bytes, p + 20);
    const size = u32(bytes, p + 24);
    const nameLength = u16(bytes, p + 28);
    const extraLength = u16(bytes, p + 30);
    const commentLength = u16(bytes, p + 32);
    const localHeaderOffset = u32(bytes, p + 42);
    if (flags & 1) throw new ZipError('encrypted archives are not supported');
    if (compressedSize === 0xffffffff || size === 0xffffffff) throw new ZipError('ZIP64 archives are not supported');
    entries.push({
      name: decodeName(bytes, p + 46, nameLength), method, compressedSize, size, crc32: crc, localHeaderOffset,
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function readEntry(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  const p = entry.localHeaderOffset;
  if (u32(bytes, p) !== 0x04034b50) throw new ZipError(`corrupt local header for ${entry.name}`);
  const nameLength = u16(bytes, p + 26);
  const extraLength = u16(bytes, p + 28);
  const start = p + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > bytes.length) throw new ZipError(`${entry.name} is truncated`);
  const raw = bytes.subarray(start, end);
  let data: Uint8Array;
  if (entry.method === 0) data = raw.slice();
  else if (entry.method === 8) data = inflateRaw(raw, entry.size);
  else throw new ZipError(`${entry.name} uses unsupported compression method ${entry.method}`);
  if (data.length !== entry.size) throw new ZipError(`${entry.name} decompressed to the wrong size`);
  if (crc32(data) !== entry.crc32) throw new ZipError(`${entry.name} failed its CRC check`);
  return data;
}
