// Carry, price evaluation, monthly cost and deal terms (§6.7).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../index.ts';
import { monthlyCost } from '../compute/money.ts';
import { agentFact, comps, input, KEY, SUBJECT_IDENTITY, subjectFacts } from './helpers.ts';

const subjectWithCarry = () => ({
  identity: SUBJECT_IDENTITY,
  facts: subjectFacts({ common_charges_monthly: agentFact(3_600), taxes_monthly: agentFact(3_300) }),
});

test('carry per comp: common charges plus taxes, and per square foot', () => {
  const out = compute(input());
  const chambers = out.comps.find((c) => c.id === KEY.chambers)!.per_result.on_facts;
  assert.equal(chambers.monthly_carry!.value, 2_862 + 2_812);
  assert.equal(chambers.carry_per_sqft!.value, (2_862 + 2_812) / 2_201);
  assert.equal(out.comps.find((c) => c.id === KEY.laight)!.per_result.on_facts.monthly_carry, null); // a closing: none
  assert.equal(out.comps.find((c) => c.id === KEY.barclay11f)!.per_result.on_facts.carry_per_sqft, null); // no area
});

test('the subject against the comp median', () => {
  const r = compute(input({ subject: subjectWithCarry() })).results.on_facts;
  // Ten comps have carry (the closing has none): the middle two are $6,160 and $6,621.
  assert.equal(r.carry.comp_ids.length, 10);
  assert.equal(r.carry.comp_median!.value, Math.round((6_160 + 6_621) / 2));
  assert.equal(r.carry.subject!.value, 6_900);
  assert.equal(r.carry.subject_per_sqft!.value, 6_900 / 2_000);
  assert.equal(r.carry.subject_vs_median_percent!.value, (6_900 / ((6_160 + 6_621) / 2) - 1) * 100);
});

test('co-op carry is maintenance', () => {
  const coopComps = comps().map((c) => ({
    ...c,
    record: {
      ...c.record,
      facts: { ...c.record.facts, property_type: { ...c.record.facts.property_type!, value: 'coop' as const }, maintenance_monthly: { ...c.record.facts.property_type!, value: 4_000 } },
    },
  }));
  const out = compute(input({ property_type: 'coop', comps: coopComps, subject: { identity: SUBJECT_IDENTITY, facts: { maintenance_monthly: agentFact(5_000) } } }));
  assert.equal(out.results.on_facts.carry.subject!.value, 5_000);
  assert.equal(out.results.on_facts.carry.comp_median!.value, 4_000);
});

test('monthly cost: principal and interest, and the terms kept apart', () => {
  // The textbook case: $1,000,000 at 6% over 30 years is $5,995.51 a month.
  const m = monthlyCost({ down_payment: { dollars: 250_000 }, annual_rate_percent: 6, term_years: 30, insurance_monthly: 200 },
    1_250_000, { common_charges_monthly: agentFact(2_000), taxes_monthly: agentFact(1_500) }, 'condo');
  assert.equal(m.loan, 1_000_000);
  assert.equal(m.mortgage_payment, 5_996);
  assert.equal(m.interest_first_month, 5_000);
  assert.equal(m.principal_first_month, 996);
  assert.equal(m.monthly_carry, 3_500);
  assert.equal(m.housing_cash_outflow, 5_996 + 3_500 + 200); // everything paid
  assert.equal(m.ownership_carrying_cost, 5_000 + 3_500 + 200); // principal isn't an expense
  assert.equal(m.economic_burn, m.housing_cash_outflow! - 996);
  assert.equal(m.economic_burn, m.ownership_carrying_cost);
  assert.deepEqual(m.gaps, []);
  assert.match(m.label, /Estimate/);
});

test('monthly cost: zero rate, interest only, gaps', () => {
  const carry = { common_charges_monthly: agentFact(2_000), taxes_monthly: agentFact(1_500) };
  const zero = monthlyCost({ down_payment: { percent: 20 }, annual_rate_percent: 0, term_years: 30 }, 1_200_000, carry, 'condo');
  assert.equal(zero.down_payment, 240_000);
  assert.equal(zero.mortgage_payment, Math.round(960_000 / 360));
  assert.equal(zero.interest_first_month, 0);
  const io = monthlyCost({ down_payment: { percent: 20 }, annual_rate_percent: 6, term_years: 10, interest_only: true }, 1_250_000, carry, 'condo');
  assert.equal(io.mortgage_payment, 5_000);
  assert.equal(io.principal_first_month, 0);
  const noCarry = monthlyCost({ down_payment: { dollars: 2_000_000 }, annual_rate_percent: 6, term_years: 30 }, 1_000_000, {}, 'condo');
  assert.equal(noCarry.loan, 0);
  assert.equal(noCarry.housing_cash_outflow, null);
  assert.ok(noCarry.gaps.some((g) => /exceeds the price/.test(g)));
  assert.ok(noCarry.gaps.some((g) => /common charges and taxes are unknown/.test(g)));
});

test('price evaluation: $/sqft, where it falls, distance from each indicator, negotiating room', () => {
  const out = compute(input({ prices: [{ id: 'list', label: 'List price', kind: 'list', price: 4_500_000 }] }));
  const p = out.prices[0]!.per_result.on_facts;
  const r = out.results.on_facts;
  assert.equal(p.per_sqft!.value, 4_500_000 / 2_000);
  assert.equal(p.vs_range!.position, 'within');
  assert.equal(p.vs_range!.to_low, 4_500_000 - r.range!.low.value);
  assert.equal(p.vs_range!.through_percent, ((4_500_000 - r.range!.low.value) / (r.range!.high.value - r.range!.low.value)) * 100);
  assert.equal(p.vs_base!.difference, 4_500_000 - r.base!.value);
  assert.ok(p.vs_indicators.some((i) => i.indicator === 'adjusted_price.median' && i.difference === -100_000));
  // The comps closed at a median 3.52% under their last ask.
  assert.equal(p.negotiating_room!.n, 4);
  assert.equal(p.negotiating_room!.implied_sale_at_median, Math.round(4_500_000 * (1 + r.sale_to_ask!.median.value / 100)));
  assert.equal(p.negotiating_room!.max_percent, r.sale_to_ask!.max.value);
});

test('monthly cost on the base of each result, or on a named price', () => {
  const base = compute(input({ subject: subjectWithCarry(), financing: { price: 'base', down_payment: { percent: 20 }, annual_rate_percent: 6.25, term_years: 30 } }));
  assert.equal(base.monthly_cost!.on_facts!.price, base.results.on_facts.base!.value);
  const named = compute(input({
    subject: subjectWithCarry(),
    prices: [{ id: 'offer', label: 'Offer', kind: 'offer', price: 4_500_000 }],
    financing: { price: { named_price_id: 'offer' }, down_payment: { percent: 20 }, annual_rate_percent: 6.25, term_years: 30 },
  }));
  const m = named.monthly_cost!.on_facts!;
  assert.equal(m.loan, 3_600_000);
  assert.equal(m.mortgage_payment, 22_166);
  assert.equal(m.monthly_carry, 6_900);
  const noBase = compute(input({ subject: { identity: SUBJECT_IDENTITY, facts: {} }, financing: { price: 'base', down_payment: { percent: 20 }, annual_rate_percent: 6, term_years: 30 } }));
  assert.equal(noBase.monthly_cost!.on_facts, null);
});

test('deal terms: captured, evaluated where v1 can, and honest about what it cannot', () => {
  const buyer = compute(input({
    subject: subjectWithCarry(),
    deal_terms: {
      template: 'buyer_traditional', price: 4_400_000, deposit: { percent: 10 }, target_closing: '2026-12-15',
      financing: { down_payment: { percent: 25 }, annual_rate_percent: 6, term_years: 30 },
    },
  })).deal_terms!;
  assert.equal(buyer.deposit, 440_000);
  assert.equal(buyer.price_evaluations[0]!.id, 'deal_terms.price');
  assert.equal(buyer.price_evaluations[0]!.kind, 'offer');
  assert.equal(buyer.monthly_cost!.on_facts!.loan, 3_300_000);
  assert.ok(buyer.not_computed_in_v1.some((n) => /closing timeline/.test(n)));
  const rentToOwn = compute(input({
    deal_terms: { template: 'buyer_rent_to_own', price: 11_500_000, deposit: { dollars: 1_150_000 }, interim_rent: { monthly: 58_000, credit_percent: 30 } },
  })).deal_terms!;
  assert.equal(rentToOwn.deposit, 1_150_000);
  assert.ok(rentToOwn.not_computed_in_v1.some((n) => /rent credit/.test(n)));
  const seller = compute(input({ deal_terms: { template: 'seller_pricing', seller_target: 4_900_000, timing: 'before the new year', flexibility: 'some' } })).deal_terms!;
  assert.equal(seller.price_evaluations[0]!.kind, 'target');
  assert.ok(seller.not_computed_in_v1.some((n) => /timing and flexibility/.test(n)));
});
