// Carrying cost, price evaluation, the monthly cost estimate and deal terms
// (§6.7) — rudimentary, as v1 intends.
//
// Terms follow the audit's §9 definitions, pending the house glossary (§6.9):
// - monthly carry: common charges + real estate taxes (condo), maintenance (co-op)
// - mortgage payment: principal and interest (or interest only)
// - housing cash outflow: everything actually paid in a month
// - ownership carrying cost: interest + carry + insurance + other ownership costs
// - principal: paid down, not an expense
// - economic burn: cash outflow less principal
//
// Amortisation raises (1 + r) to the number of payments by repeated
// squaring — exact operations, so every runtime agrees to the dollar.

import { powInt, roundHalfAway } from '../util/numbers.ts';
import type { DealTerms, Dollars, FinancingInput, IsoDate, NamedPrice, PropertyFacts, ReportPropertyType } from '../types.ts';
import { monthlyCarry } from './compare.ts';
import { weakest } from './facts.ts';
import { figure } from './results.ts';
import type { DealTermsOut, MonthlyCost, PriceEvaluation, PriceEvaluationResult, Result, ResultKind } from './output.ts';

export function evaluatePrice(price: Dollars, result: Result, subjectFacts: Partial<PropertyFacts>, asOf: IsoDate): PriceEvaluationResult {
  const area = subjectFacts.area_sqft;
  const range = result.range;
  const base = result.base;
  const vsIndicators: PriceEvaluationResult['vs_indicators'] = [];
  for (const family of [result.indicators.unit_rate, result.indicators.adjusted_price]) {
    for (const ind of [family.median, family.mean, family.anchor]) {
      if (!ind.implied_value) continue;
      const v = ind.implied_value.value;
      vsIndicators.push({ indicator: ind.id, implied_value: v, difference: price - v, percent: (price / v - 1) * 100 });
    }
  }
  const s2a = result.sale_to_ask;
  return {
    per_sqft: area ? figure(price / area.value, 'usd_per_sqft', weakest(area.confidence), `the price ÷ the subject's ${area.value} sqft`, asOf) : null,
    vs_range: range
      ? {
        position: price < range.low.value ? 'below' : price > range.high.value ? 'above' : 'within',
        through_percent: range.high.value > range.low.value ? ((price - range.low.value) / (range.high.value - range.low.value)) * 100 : null,
        to_low: price - range.low.value,
        to_high: price - range.high.value,
      }
      : null,
    vs_base: base ? { difference: price - base.value, percent: (price / base.value - 1) * 100 } : null,
    vs_indicators: vsIndicators,
    negotiating_room: s2a
      ? {
        median_sale_to_ask_percent: s2a.median.value,
        min_percent: s2a.min.value,
        max_percent: s2a.max.value,
        n: s2a.n,
        implied_sale_at_median: roundHalfAway(price * (1 + s2a.median.value / 100)),
      }
      : null,
  };
}

export function evaluatePrices(
  prices: readonly NamedPrice[], results: Record<ResultKind, Result>, subjectFacts: Record<ResultKind, Partial<PropertyFacts>>, asOf: IsoDate,
): PriceEvaluation[] {
  return prices.map((p) => ({
    ...p,
    per_result: {
      on_facts: evaluatePrice(p.price, results.on_facts, subjectFacts.on_facts, asOf),
      with_estimates: evaluatePrice(p.price, results.with_estimates, subjectFacts.with_estimates, asOf),
    },
  }));
}

export function monthlyCost(
  financing: Omit<FinancingInput, 'price'>, price: Dollars, subjectFacts: Partial<PropertyFacts>, reportType: ReportPropertyType,
): MonthlyCost {
  const gaps: string[] = [];
  let down = 'percent' in financing.down_payment
    ? roundHalfAway((price * financing.down_payment.percent) / 100)
    : financing.down_payment.dollars;
  if (down > price) {
    gaps.push('the down payment exceeds the price; read as the whole price');
    down = price;
  }
  const loan = price - down;
  const r = financing.annual_rate_percent / 100 / 12;
  const n = financing.term_years * 12;
  let payment: number;
  if (financing.interest_only) payment = loan * r;
  else if (r === 0) payment = loan / n;
  else {
    const growth = powInt(1 + r, n);
    payment = (loan * r * growth) / (growth - 1);
  }
  const mortgage_payment = roundHalfAway(payment);
  const interest_first_month = roundHalfAway(loan * r);
  const principal_first_month = financing.interest_only ? 0 : mortgage_payment - interest_first_month;
  const carry = monthlyCarry(subjectFacts, reportType);
  if (!carry) gaps.push(reportType === 'coop' ? "the subject's maintenance is unknown" : "the subject's common charges and taxes are unknown");
  const insurance = financing.insurance_monthly ?? null;
  const other = financing.other_ownership_costs_monthly ?? null;
  if (insurance === null) gaps.push('insurance not given — not included');
  const extras = (insurance ?? 0) + (other ?? 0);
  const housing_cash_outflow = carry ? mortgage_payment + carry.value + extras : null;
  const ownership_carrying_cost = carry ? interest_first_month + carry.value + extras : null;
  return {
    label: 'Estimate — the first month of the loan; principal is paid down, not an expense',
    price,
    down_payment: down,
    loan,
    annual_rate_percent: financing.annual_rate_percent,
    term_years: financing.term_years,
    interest_only: financing.interest_only ?? false,
    mortgage_payment,
    interest_first_month,
    principal_first_month,
    monthly_carry: carry?.value ?? null,
    insurance,
    other_ownership_costs: other,
    housing_cash_outflow,
    ownership_carrying_cost,
    economic_burn: housing_cash_outflow === null ? null : housing_cash_outflow - principal_first_month,
    gaps,
  };
}

export function monthlyCosts(
  financing: FinancingInput, prices: readonly NamedPrice[], results: Record<ResultKind, Result>,
  subjectFacts: Record<ResultKind, Partial<PropertyFacts>>, reportType: ReportPropertyType,
): Record<ResultKind, MonthlyCost | null> {
  const one = (kind: ResultKind): MonthlyCost | null => {
    const price = financing.price === 'base'
      ? results[kind].base?.value ?? null
      : prices.find((p) => p.id === (financing.price as { named_price_id: string }).named_price_id)?.price ?? null;
    return price === null ? null : monthlyCost(financing, price, subjectFacts[kind], reportType);
  };
  return { on_facts: one('on_facts'), with_estimates: one('with_estimates') };
}

export function dealTerms(
  terms: DealTerms, results: Record<ResultKind, Result>, subjectFacts: Record<ResultKind, Partial<PropertyFacts>>,
  reportType: ReportPropertyType, asOf: IsoDate,
): DealTermsOut {
  const named: NamedPrice[] = [];
  if (terms.price !== undefined) {
    named.push({ id: 'deal_terms.price', label: 'Deal price', kind: terms.template === 'seller_pricing' ? 'list' : 'offer', price: terms.price });
  }
  if (terms.seller_target !== undefined) named.push({ id: 'deal_terms.seller_target', label: "Seller's target", kind: 'target', price: terms.seller_target });
  const depositBase = terms.price ?? terms.seller_target ?? null;
  const deposit = !terms.deposit ? null
    : 'dollars' in terms.deposit ? terms.deposit.dollars
      : depositBase === null ? null : roundHalfAway((depositBase * terms.deposit.percent) / 100);
  const notComputed: string[] = [];
  if (terms.interim_rent) notComputed.push('interim rent and rent credit — with full offer modelling');
  if (terms.target_closing) notComputed.push('the closing timeline — with full offer modelling');
  if (terms.timing || terms.flexibility) notComputed.push("the seller's timing and flexibility are captured for strategy, not calculated");
  return {
    template: terms.template,
    captured: terms,
    deposit,
    price_evaluations: evaluatePrices(named, results, subjectFacts, asOf),
    monthly_cost: terms.financing && terms.price !== undefined
      ? {
        on_facts: monthlyCost(terms.financing, terms.price, subjectFacts.on_facts, reportType),
        with_estimates: monthlyCost(terms.financing, terms.price, subjectFacts.with_estimates, reportType),
      }
      : null,
    not_computed_in_v1: notComputed,
  };
}
