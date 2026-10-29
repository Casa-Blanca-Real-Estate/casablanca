import assert from 'node:assert/strict';
import { test } from 'node:test';
import { againstRange, clientForHubert, clientRows, clientSub, paceLine, preApprovalWords, withBuyerFinance } from './client.ts';
import type { DealTermsState } from './state.ts';

const e = <T>(value: T) => ({ value, asOf: '2026-10-29' });
const sold = { saleToAsk: { n: 3, median: { value: -3.24 } }, daysOnMarket: { n: 3, median: { value: 148 } } };
const range = { low: 3_400_000, high: 3_900_000 };

test('the pre-approval, in words', () => {
  assert.equal(preApprovalWords(null), null);
  assert.equal(preApprovalWords({ template: 'buyer_traditional', financing: e('cash' as const), preApproved: e(true) }), 'Cash');
  assert.equal(preApprovalWords({ template: 'buyer_traditional', preApproved: e(false) }), 'Not pre-approved yet');
  assert.equal(preApprovalWords({ template: 'buyer_traditional', preApproved: e(true), preApprovalAmount: e(3_650_000) }), 'Pre-approved for $3.65M');
  assert.equal(preApprovalWords({ template: 'seller_pricing', preApproved: e(true) }), null, 'a seller’s terms hold none');
});

test('setting the financing starts the buyer’s terms, and cash or "not yet" drop what no longer applies', () => {
  const start = withBuyerFinance(null, { preApproved: e(true) });
  assert.deepEqual(start, { template: 'buyer_traditional', preApproved: e(true) });
  const withAmount = withBuyerFinance({ ...start, price: e(3_500_000) }, { preApprovalAmount: e(3_650_000) });
  assert.equal(withAmount.price?.value, 3_500_000, 'the rest of the terms stay');
  assert.equal(withBuyerFinance(withAmount, { preApproved: e(false) }).preApprovalAmount, undefined);
  const cash = withBuyerFinance(withAmount, { financing: e('cash' as const) });
  assert.equal(cash.preApproved, undefined);
  assert.equal(cash.preApprovalAmount, undefined);
  assert.equal(withBuyerFinance(withAmount, { preApproved: undefined }).preApproved, undefined, 'clearing it clears it');
});

test('the pre-approval against the range', () => {
  assert.equal(againstRange(4_000_000, range), 'Covers the whole true estimate ($3.4M – $3.9M).');
  assert.equal(againstRange(3_650_000, range), 'Reaches into the true estimate: up to $3.65M of $3.4M – $3.9M.');
  assert.equal(againstRange(3_200_000, range), '$200K short of the true estimate’s low ($3.4M – $3.9M).');
});

test('the pace against how the comps sold', () => {
  assert.match(paceLine('buyer', 'asap', sold)!, /^Your sales closed a median 3\.2% below their last ask; a buyer who needs to move fast/);
  assert.match(paceLine('buyer', 'can_wait', sold)!, /room a buyer who can wait can test\.$/);
  assert.match(paceLine('buyer', 'asap', { saleToAsk: { n: 2, median: { value: 1 } }, daysOnMarket: null })!, /1\.0% above their last ask: moving fast here can mean meeting the ask\./);
  assert.equal(paceLine('seller', 'asap', sold), 'Your sales took a median of 148 days to go into contract: the pace to beat.');
  assert.equal(paceLine('buyer', 'asap', { saleToAsk: null, daysOnMarket: null }), null);
});

test('Your client’s rows: only the ones with data', () => {
  const terms: DealTermsState = { template: 'buyer_traditional', financing: e('mortgage' as const), preApproved: e(true), preApprovalAmount: e(3_650_000) };
  const client = { urgency: { pace: e('asap' as const), text: e('Lease ends in March') }, motivations: e('Wants a room to work from home') };
  const rows = clientRows({ side: 'buyer', client, terms, range, ask: 3_995_000, sold });
  assert.deepEqual(rows.map((r) => r.k), ['Pre-approved', 'Against the range', 'Against the ask', 'How soon', 'At that pace', 'What’s moving them']);
  assert.equal(rows[0]!.v, 'Yes, for $3.65M');
  assert.equal(rows[2]!.v, '$345K short of the $4M ask.');
  assert.equal(rows[3]!.v, 'As soon as possible. Lease ends in March');
  assert.deepEqual(clientRows({ side: 'buyer', client: undefined, terms: null, range, ask: null, sold }), []);
  assert.deepEqual(clientRows({ side: 'seller', client: undefined, terms, range, ask: null, sold }), [], 'a seller has no pre-approval');
  assert.equal(clientSub('buyer', client, terms), 'Pre-approved $3.65M · ASAP');
  assert.equal(clientSub('seller', {}, null), '');
});

test('Hubert gets the facts, never the name, and nothing when there are none', () => {
  assert.equal(clientForHubert({ audience: e('buyer' as const), clientName: e('Jordan') }, null), null);
  const got = clientForHubert(
    { audience: e('buyer' as const), clientName: e('Jordan'), client: { urgency: { pace: e('can_wait' as const) }, motivations: e('Downsizing') } },
    { template: 'buyer_traditional', financing: e('mortgage' as const), preApproved: e(true), preApprovalAmount: e(3_650_000) },
  )!;
  assert.equal(got.pre_approved_for, '$3,650,000');
  assert.equal(got.how_soon, 'can wait for the right one');
  assert.equal(got.what_is_moving_them, 'Downsizing');
  assert.equal(JSON.stringify(got).includes('Jordan'), false);
  const seller = clientForHubert({ audience: e('seller' as const) }, { template: 'seller_pricing', sellerTarget: e(4_555_555) });
  assert.equal(seller, null, 'a seller’s target is never a client fact');
});
