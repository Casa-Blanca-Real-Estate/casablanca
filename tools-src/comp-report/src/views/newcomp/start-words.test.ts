import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingDetails, noteOf, readStartNote, readStartWords, startsOnDetails } from './start-words.ts';

const LINK = 'https://streeteasy.com/building/100-barclay/17l';

test('a link on its own: the home, nothing else said', () => {
  const w = readStartWords(LINK);
  assert.equal(w.home?.kind, 'link');
  assert.deepEqual([w.side, w.client, w.type, w.price], [null, null, null, null]);
  assert.ok(startsOnDetails(w));
});

test('a link with who it is for', () => {
  const w = readStartWords(`${LINK} buyer, Jordan and Sam, condo, budget $4.5M`);
  assert.equal(w.home?.kind, 'link');
  assert.equal(w.side, 'buyer');
  assert.equal(w.client, 'Jordan and Sam');
  assert.equal(w.type, 'condo');
  assert.equal(w.price, 4_500_000);
});

test('words before the link, and "my sellers"', () => {
  const w = readStartWords(`for my sellers Pat & Chris Lee ${LINK}`);
  assert.equal(w.side, 'seller');
  assert.equal(w.client, 'Pat & Chris Lee');
  assert.equal(w.home?.kind, 'link');
});

test('a typed address with a unit and the rest of the sentence', () => {
  const w = readStartWords('100 Barclay St #17L for my buyers Jordan and Sam, co-op, up to 3.2 million');
  assert.deepEqual(w.home, { kind: 'typed', address: '100 Barclay St', unit: '#17L', title: '100 Barclay St #17L' });
  assert.equal(w.side, 'buyer');
  assert.equal(w.client, 'Jordan and Sam');
  assert.equal(w.type, 'coop');
  assert.equal(w.price, 3_200_000);
});

test('the unit in its own part', () => {
  const w = readStartWords('100 Barclay Street, #17L, seller');
  assert.deepEqual(w.home, { kind: 'typed', address: '100 Barclay Street', unit: '#17L', title: '100 Barclay Street #17L' });
  assert.equal(w.side, 'seller');
  assert.equal(w.client, null);
});

test('a plain address is just the home', () => {
  const w = readStartWords('25 Leonard Street');
  assert.deepEqual(w.home, { kind: 'typed', address: '25 Leonard Street', unit: null, title: '25 Leonard Street' });
  assert.equal(w.side, null);
  assert.equal(w.client, null);
});

test('buyer and seller both said: neither is guessed', () => {
  assert.equal(readStartWords(`${LINK} buyer or seller?`).side, null);
});

test('a keyword after "for" is not a name', () => {
  assert.equal(readStartWords(`${LINK} for Condo`).client, null);
  assert.equal(readStartWords(`${LINK} for a buyer`).client, null);
});

test('a link that is not a listing: the window says why', () => {
  const w = readStartWords('https://example.com/x buyer');
  assert.equal(w.home?.kind, 'bad-link');
  assert.equal(startsOnDetails(w), false);
  assert.equal(w.side, 'buyer');
});

test('nothing typed', () => {
  const w = readStartWords('   ');
  assert.equal(w.home, null);
  assert.equal(startsOnDetails(w), false);
});

test('the note keeps only what was said, and reads back', () => {
  const n = noteOf(readStartWords(`${LINK} seller`));
  assert.deepEqual(n, { said: { side: 'seller' }, from: 'link' });
  assert.deepEqual(readStartNote(JSON.stringify(n)), n);
  assert.equal(readStartNote('{oops'), null);
  assert.equal(readStartNote(null), null);
});

test('missing details, in words', () => {
  assert.equal(missingDetails({}), 'the size, the bedrooms, the bathrooms and the floor');
  assert.equal(missingDetails({ beds: 1, baths: 1, floor: 3 }), 'the size');
  assert.equal(missingDetails({ areaSqft: 1, beds: 1, baths: 1, floor: 3 }), null);
});
