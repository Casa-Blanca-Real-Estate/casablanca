// Send and Done's words (Dispatch 14): buyer and seller, the tabs, the sent line.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COPY_LABEL, FALLBACK_FORMATS, FORMATS, LEAD_FORMATS, designedCta, designedEyebrow, formatOf, homeSub, lengthOf, monthOf, outcomeFields, parseAmount, sentLine } from './copy.ts';

test('the tabs: Designed first and the default, Text next, Full and Short the fallbacks; a stored format wins (Dispatch 26)', () => {
  assert.deepEqual(LEAD_FORMATS.map((f) => [f.id, f.label]), [['designed', 'Designed email'], ['text', 'Then text them']]);
  assert.deepEqual(FALLBACK_FORMATS.map((f) => f.id), ['full', 'short']);
  assert.deepEqual(FORMATS.map((f) => f.id), ['designed', 'text', 'full', 'short']);
  assert.equal(lengthOf('designed'), 'full');
  assert.equal(lengthOf('text'), 'text');
  assert.equal(formatOf({}), 'designed', 'no stored format: Designed');
  assert.equal(formatOf({ format: 'full' }), 'full', 'a stored format still wins');
  assert.equal(formatOf({ length: 'short' }), 'short');
  assert.equal(formatOf({ format: 'designed', length: 'full' }), 'designed');
  assert.equal(COPY_LABEL.designed, 'Copy the designed email');
  assert.equal(COPY_LABEL.text, 'Copy the text');
});

test('buyer and seller copy, from the prototype', () => {
  assert.equal(designedEyebrow('seller', '17L'), 'What the sales support');
  assert.equal(designedEyebrow('buyer', '17L'), 'What 17L is worth today');
  assert.equal(designedCta('seller'), 'Talk it through');
  assert.equal(designedCta('buyer'), 'Plan the offer');
  assert.deepEqual(outcomeFields('seller').map((f) => f.label), ['Listed at', 'Contract price', 'Sold for']);
  assert.deepEqual(outcomeFields('buyer').map((f) => f.label), ['Offered at', 'Contract price', 'Sold for']);
});

test('the home’s line, the month, and the sent line', () => {
  const asOf = '2026-10-14';
  assert.equal(homeSub({ beds: { value: 3, asOf }, baths: { value: 3, asOf }, floor: { value: 17, asOf } }), '3 bd · 3 ba · Floor 17');
  assert.equal(homeSub({ floor: { value: 17, asOf } }), 'Floor 17');
  assert.equal(monthOf('2026-10-14'), 'October 2026');
  assert.equal(sentLine({ client: 'Jordan and Sam', sentAt: '2026-10-09T15:00:00Z', format: 'designed' }), 'To Jordan and Sam · Oct 9, 2026 · Sent as the designed email');
  assert.equal(sentLine({ client: ' ', sentAt: '2026-10-09T15:00:00Z', format: 'text' }), 'Oct 9, 2026 · Sent as a text message');
});

test('amounts as an agent types them', () => {
  assert.equal(parseAmount('$4,450,000'), 4_450_000);
  assert.equal(parseAmount('4.45M'), 4_450_000);
  assert.equal(parseAmount('950k'), 950_000);
  assert.equal(parseAmount('4450000'), 4_450_000);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('about 4M'), null);
  assert.equal(parseAmount('0'), null);
});
