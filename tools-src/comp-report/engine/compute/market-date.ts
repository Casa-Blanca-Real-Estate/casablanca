// The date a comp's price speaks for (§6.5). A sale's price was agreed at
// contract, so where a listing's history gives the contract date, that's the
// market moment; the export gives sold records only their closing date, which
// overstates how fresh a sale is by the contract-to-close lag. Every comp says
// which date it used.

import { addMonths, parseIsoDate } from '../util/dates.ts';
import type { Confidence, EvidenceClass, FactField, IsoDate, PropertyFacts, Sourced } from '../types.ts';

export type MarketDateBasis = 'contract_date' | 'closing_date' | 'list_date' | 'off_market_date';

export interface MarketDate {
  date: IsoDate;
  basis: MarketDateBasis;
  /** The fact it came from. */
  field: FactField;
  confidence: Confidence;
  /** A sale dated by its contract: when it closed, where that's known. */
  closed: IsoDate | null;
}

/**
 * - sold: the contract date where there is one, else the closing date
 * - in contract: the contract date (the export's Status Date is one)
 * - active: the listing date
 * - didn't sell: the day it came off the market
 */
export function marketDate(facts: Partial<PropertyFacts>, cls: EvidenceClass | null): MarketDate | null {
  const fact = (field: FactField) => facts[field] as Sourced<IsoDate> | undefined;
  const dated = (field: FactField, basis: MarketDateBasis, closed: IsoDate | null = null): MarketDate | null => {
    const f = fact(field);
    return f ? { date: f.value, basis, field, confidence: f.confidence, closed } : null;
  };
  switch (cls) {
    case 'sold': return dated('contract_date', 'contract_date', fact('status_date')?.value ?? null) ?? dated('status_date', 'closing_date');
    case 'in_contract': return dated('contract_date', 'contract_date') ?? dated('status_date', 'contract_date');
    case 'active': return dated('list_date', 'list_date') ?? dated('status_date', 'list_date');
    case 'off_market': return dated('status_date', 'off_market_date');
    default: return null;
  }
}

/** "sold 2026-08-27", "went into contract 2026-03-02 (closed 2026-05-01)", "came off the market 2025-12-01". */
export function describeMarketDate(m: MarketDate): string {
  switch (m.basis) {
    case 'closing_date': return `sold ${m.date}`;
    case 'contract_date': return `went into contract ${m.date}${m.closed ? ` (closed ${m.closed})` : ''}`;
    case 'list_date': return `listed ${m.date}`;
    case 'off_market_date': return `came off the market ${m.date}`;
  }
}

/** Whole calendar months from one date to another: the most that can be added to the earlier without passing the later. */
export function wholeMonthsBetween(a: IsoDate, b: IsoDate): number {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const f = parseIsoDate(from)!;
  const t = parseIsoDate(to)!;
  let months = (t.y - f.y) * 12 + (t.m - f.m);
  if (months > 0 && addMonths(from, months) > to) months--;
  return months;
}
