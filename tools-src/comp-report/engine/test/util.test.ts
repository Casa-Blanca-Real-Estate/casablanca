// The engine's own utilities, checked against the platform implementations
// they replace — Date, node:crypto, TextEncoder/TextDecoder.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../util/canonical-json.ts';
import { addMonths, civilFromDays, daysBetween, daysFromCivil, formatIsoDate, isIsoDate, parseUsDate, spreadsheetSerialToIso } from '../util/dates.ts';
import { mean, median, powInt, roundHalfAway } from '../util/numbers.ts';
import { sha256, sha256Tag, toHex } from '../util/sha256.ts';
import { cp1252Decode, utf8DecodeStrict, utf8Encode } from '../util/utf8.ts';

test('calendar arithmetic agrees with Date.UTC for every day, 1900–2100', () => {
  for (let days = daysFromCivil(1900, 1, 1); days <= daysFromCivil(2100, 12, 31); days++) {
    const d = new Date(days * 86_400_000);
    const c = civilFromDays(days);
    assert.equal(c.y, d.getUTCFullYear());
    assert.equal(c.m, d.getUTCMonth() + 1);
    assert.equal(c.d, d.getUTCDate());
    if (c.d === 1 || c.d === 29) assert.equal(daysFromCivil(c.y, c.m, c.d), days);
  }
  assert.equal(daysBetween('2026-08-27', '2026-09-24'), 28);
  assert.equal(daysBetween('2026-09-24', '2026-08-27'), -28);
});

test('months, spreadsheet serials and US dates', () => {
  assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(addMonths('2024-03-31', -1), '2024-02-29');
  assert.equal(addMonths('2026-01-15', -6), '2025-07-15');
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
  assert.equal(spreadsheetSerialToIso(46261, false), '2026-08-27');
  assert.equal(spreadsheetSerialToIso(44799, true), '2026-08-27');
  assert.equal(spreadsheetSerialToIso(46261.75, false), '2026-08-27'); // time of day dropped
  assert.equal(spreadsheetSerialToIso(60, false), null); // Excel's fictional 1900-02-29
  assert.deepEqual(parseUsDate('8/27/2026'), { date: '2026-08-27', twoDigitYear: false });
  assert.equal(parseUsDate('13/1/2026'), null);
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('2028-02-29'), true);
  assert.equal(formatIsoDate({ y: 987, m: 1, d: 2 }), '0987-01-02');
});

test('SHA-256 matches the standard vectors and node:crypto', () => {
  const hex = (s: string) => toHex(sha256(utf8Encode(s)));
  assert.equal(hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  assert.equal(hex('a'.repeat(1_000_000)), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  for (let n = 0; n < 300; n++) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 31 + n * 7) & 0xff);
    assert.equal(toHex(sha256(bytes)), createHash('sha256').update(bytes).digest('hex'), `length ${n}`);
  }
  assert.match(sha256Tag('x'), /^sha256:[0-9a-f]{64}$/);
});

test('UTF-8 matches TextEncoder and TextDecoder, and rejects what isn’t UTF-8', () => {
  const samples = ['', 'ascii', '2,201 ft²', '≈ Tribeca — “quoted”', 'emoji 🏙️ and 𝔘', 'São Paulo, Zürich, 北京'];
  for (const s of samples) {
    const bytes = utf8Encode(s);
    assert.deepEqual(bytes, new TextEncoder().encode(s));
    assert.equal(utf8DecodeStrict(bytes), s);
  }
  assert.equal(utf8DecodeStrict(Uint8Array.of(0xb2)), null); // a Windows-1252 "²"
  assert.equal(utf8DecodeStrict(Uint8Array.of(0xc2)), null); // truncated
  assert.equal(utf8DecodeStrict(Uint8Array.of(0xe0, 0x80, 0x80)), null); // overlong
  assert.equal(utf8DecodeStrict(Uint8Array.of(0xed, 0xa0, 0x80)), null); // a surrogate
  assert.deepEqual(utf8Encode('\uD800'), new TextEncoder().encode('\uD800')); // lone surrogate → U+FFFD
  assert.equal(cp1252Decode(Uint8Array.of(0x32, 0xb2, 0x20, 0x93, 0x94, 0x80)), '2² “”€');
});

test('canonical JSON: sorted keys, no undefined, nothing JSON can’t hold', () => {
  assert.equal(canonicalJson({ b: 1, a: [true, null, 'x'], c: undefined, d: { z: -0, y: 1.5 } }), '{"a":[true,null,"x"],"b":1,"d":{"y":1.5,"z":0}}');
  assert.equal(canonicalJson({ B: 1, a: 2, á: 3 }), '{"B":1,"a":2,"á":3}'); // code-unit order, not locale
  assert.throws(() => canonicalJson({ x: NaN }), /non-finite/);
  assert.throws(() => canonicalJson([undefined]), /undefined/);
  assert.throws(() => canonicalJson({ d: new Date(0) }), /non-plain/);
  assert.throws(() => canonicalJson({ f: () => 1 }), /function/);
});

test('arithmetic helpers', () => {
  assert.equal(roundHalfAway(2.5), 3);
  assert.equal(roundHalfAway(-2.5), -3);
  assert.equal(roundHalfAway(-0.2), 0);
  assert.ok(!Object.is(roundHalfAway(-0.2), -0));
  assert.equal(powInt(2, 10), 1024);
  assert.equal(powInt(1.005, 0), 1);
  assert.equal(powInt(2, -2), 0.25);
  let repeated = 1;
  for (let i = 0; i < 360; i++) repeated *= 1 + 0.06 / 12;
  assert.ok(Math.abs(powInt(1 + 0.06 / 12, 360) - repeated) < 1e-9);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
  assert.equal(mean([1, 2, 4]), 7 / 3);
});
