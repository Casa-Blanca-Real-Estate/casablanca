import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { looksLikePdf, pdfLinks, urisIn } from './pdf-links.ts';

const enc = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'));
const cat = (...parts: Uint8Array[]) => new Uint8Array(Buffer.concat(parts));

test('plain annotations: literal and hex strings, each link once', async () => {
  const hex = Buffer.from('https://streeteasy.com/building/5-franklin-place-new_york/ph', 'latin1').toString('hex');
  const pdf = enc([
    '%PDF-1.4',
    '4 0 obj << /Type /Annot /Subtype /Link /A << /S /URI /URI (https://streeteasy.com/building/100-barclay-street-new_york/17l) >> >> endobj',
    '5 0 obj << /Type /Annot /Subtype /Link /A << /S /URI /URI (https://streeteasy.com/building/100-barclay-street-new_york/17l) >> >> endobj',
    `6 0 obj << /Type /Annot /Subtype /Link /A << /S /URI /URI <${hex}> >> >> endobj`,
    '%%EOF',
  ].join('\n'));
  assert.ok(looksLikePdf(pdf));
  assert.deepEqual(await pdfLinks(pdf), [
    'https://streeteasy.com/building/100-barclay-street-new_york/17l',
    'https://streeteasy.com/building/5-franklin-place-new_york/ph',
  ]);
});

test('annotations packed in a compressed object stream, with a direct or an indirect length', async () => {
  const packed = deflateSync(Buffer.from('<< /S /URI /URI (https://streeteasy.com/sale/1712345) >> << /S /URI /URI (https://www.casa-blanca.com/) >>', 'latin1'));
  const indirect = deflateSync(Buffer.from('<< /S /URI /URI (https://streeteasy.com/building/200-chambers-street-new_york/12c) >>', 'latin1'));
  const pdf = cat(
    enc(`%PDF-1.7\n9 0 obj\n<< /Type /ObjStm /N 2 /First 10 /Filter /FlateDecode /Length ${packed.length} >>\nstream\r\n`),
    packed,
    enc('\r\nendstream\nendobj\n10 0 obj\n<< /Type /ObjStm /N 1 /First 5 /Filter /FlateDecode /Length 11 0 R >>\nstream\n'),
    indirect,
    enc('\nendstream\nendobj\n%%EOF'),
  );
  assert.deepEqual(await pdfLinks(pdf), [
    'https://streeteasy.com/sale/1712345',
    'https://www.casa-blanca.com/',
    'https://streeteasy.com/building/200-chambers-street-new_york/12c',
  ]);
});

test('escapes in a literal string are undone', () => {
  assert.deepEqual(urisIn('/URI (https://streeteasy.com/x\\(1\\)) /URI(https://a.b/\\\\c)'), ['https://streeteasy.com/x(1)', 'https://a.b/\\c']);
});

test('a broken stream is skipped, and a file that isn’t a PDF says so', async () => {
  const pdf = enc('%PDF-1.7\n1 0 obj << /Type /ObjStm /Filter /FlateDecode /Length 5 >>\nstream\nxxxxx\nendstream\n/URI (https://streeteasy.com/sale/1)');
  assert.deepEqual(await pdfLinks(pdf), ['https://streeteasy.com/sale/1']);
  assert.equal(looksLikePdf(enc('Address,Unit,Price\n')), false);
});
