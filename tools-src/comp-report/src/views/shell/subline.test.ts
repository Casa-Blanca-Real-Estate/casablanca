import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entry } from '../../../workspace/state.ts';
import { homeSubLine } from './subline.ts';

const e = <T>(value: T, extra: Partial<Entry<T>> = {}): Entry<T> => ({ value, asOf: '2026-10-14', ...extra });

test('every part, with the client from the brief', () => {
  const line = homeSubLine({
    side: 'seller', brief: { clientName: e('Jordan and Sam') }, send: {}, sf: true,
    intake: { areaSqft: e(2201), beds: e(3), baths: e(3), floor: e(17) },
  });
  assert.equal(line, 'Seller · Jordan and Sam · 2,201 sq ft · 3 bd · 3 ba · Fl 17');
});

test('no square footage says so; an estimate and a missing client are handled', () => {
  assert.equal(homeSubLine({ side: 'buyer', brief: {}, send: {}, sf: false, intake: { beds: e(2), floor: e(5) } }), 'Buyer · No sq ft · 2 bd · Fl 5');
  assert.equal(
    homeSubLine({ side: 'buyer', brief: {}, send: { clientName: e(' Priya Shah ') }, sf: true, intake: { areaSqft: e(2000, { estimate: true }) } }),
    'Buyer · Priya Shah · 2,000 sq ft est.',
  );
});

test('a half bath and nothing else known', () => {
  assert.equal(homeSubLine({ side: 'seller', brief: {}, send: {}, sf: false, intake: { baths: e(2.5) } }), 'Seller · No sq ft · 2.5 ba');
});
