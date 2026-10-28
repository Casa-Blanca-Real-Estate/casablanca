import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CompRecord } from '../engine/index.ts';
import { onMarket, onMarketFacts, onMarketLine } from './on-market.ts';

const record = (over: { facts?: Record<string, unknown>; status?: string; history?: unknown[] }): CompRecord => ({
  status: { raw: null, evidence_class: (over.status ?? 'active') as never, listing_status: (over.status ?? 'active') as never },
  facts: Object.fromEntries(Object.entries(over.facts ?? {}).map(([k, v]) => [k, { value: v, confidence: 'inferred' }])),
  ...(over.history ? { listing: { url: null, confirmed: false, on_confirm: {}, history: over.history, description: null } } : {}),
}) as unknown as CompRecord;

test('an active listing with a list date counts its days to the analysis date', () => {
  const m = onMarket(record({ facts: { list_date: '2026-08-17' } }), '2026-10-28');
  assert.equal(m?.days, 72);
  assert.equal(m?.daysBasis, 'since_listed');
  assert.equal(onMarketLine(m), 'On the market 72 days, since Aug 17, 2026.');
});

test('a stated days on market wins, and a sold one is never counted from its list date', () => {
  assert.equal(onMarket(record({ facts: { list_date: '2026-01-01', days_on_market: 30 } }), '2026-10-28')?.days, 30);
  const sold = onMarket(record({ status: 'sold', facts: { list_date: '2026-01-01' } }), '2026-10-28');
  assert.equal(sold?.days, null);
  assert.equal(onMarketLine(sold), 'Listed Jan 1, 2026.');
});

test('price changes come from this listing period only', () => {
  const m = onMarket(record({
    facts: { list_date: '2026-08-17', original_list_price: 1_250_000 },
    history: [
      { date: '2025-03-01', event: 'Listed', kind: 'listed', price: 1_400_000 },
      { date: '2025-06-01', event: 'Price decreased', kind: 'price_change', price: 1_300_000 },
      { date: '2025-09-01', event: 'Delisted', kind: 'off_market', price: null },
      { date: '2026-08-17', event: 'Listed', kind: 'relisted', price: 1_250_000 },
      { date: '2026-09-20', event: 'Price decreased', kind: 'price_change', price: 1_195_000 },
      { date: '2026-10-10', event: 'Price decreased', kind: 'price_change', price: 1_150_000 },
    ],
  }), '2026-10-28');
  assert.deepEqual(m?.priceChanges.map((c) => c.to), [1_195_000, 1_150_000]);
  assert.equal(onMarketLine(m), 'On the market 72 days, since Aug 17, 2026, first asking $1,250,000 · 2 price cuts, now $1,150,000.');
  assert.deepEqual(onMarketFacts(m), {
    listed_on: '2026-08-17', days_on_market: 72, days_on_market_is: 'counted from the list date to the analysis date',
    original_asking_price: 1_250_000,
    price_changes: [{ date: '2026-09-20', from: 1_250_000, to: 1_195_000 }, { date: '2026-10-10', from: 1_195_000, to: 1_150_000 }],
  });
});

test('nothing known is null', () => {
  assert.equal(onMarket(record({}), '2026-10-28'), null);
  assert.equal(onMarketLine(null), null);
});
