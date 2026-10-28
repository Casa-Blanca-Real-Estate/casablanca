// How long a listing has been on the market, and what its price did (Kimani's
// notebook, 2026-10-27: "how long has the home been listed?" had no answer).
// Read from what's already stored: the export's Days on Market and Listing
// Date, or a StreetEasy page's own facts and history. No new fetch. The home's
// shows on Edit details and goes to Hubert (get_numbers), each comp's too.
import type { CompRecord, IsoDate, ListingEvent } from '../engine/index.ts';
import { isoDay, usd } from './format.ts';

export interface PriceChange {
  date: IsoDate | null;
  from: number;
  to: number;
}

export interface OnMarket {
  /** When this listing period began: the page's or export's list date, else its history's. */
  listed: IsoDate | null;
  /** Days on the market. */
  days: number | null;
  /** "stated": the page or export says it; "since_listed": counted from the list date to the analysis date, for an active listing. */
  daysBasis: 'stated' | 'since_listed' | null;
  /** The first ask in this listing period. */
  originalAsk: number | null;
  /** Each change of the ask in this period, oldest first. */
  priceChanges: PriceChange[];
  /** The ask now (the last ask, for a listing that's sold or in contract). */
  ask: number | null;
}

const DAY_MS = 86_400_000;
const dayNumber = (d: IsoDate) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / DAY_MS;

/** This listing period's events: from the last listed or relisted, oldest first. */
function currentPeriod(history: ListingEvent[]): ListingEvent[] {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.kind === 'listed' || history[i]!.kind === 'relisted') return history.slice(i);
  }
  return history;
}

/** Null when nothing about its time on the market is known. */
export function onMarket(record: CompRecord, asOf: IsoDate): OnMarket | null {
  const f = record.facts;
  const period = currentPeriod(record.listing?.history ?? []);
  const priceChanges: PriceChange[] = [];
  let ask: number | null = null;
  for (const e of period) {
    if (e.price === null || (e.kind !== 'listed' && e.kind !== 'relisted' && e.kind !== 'price_change')) continue;
    if (ask !== null && e.price !== ask) priceChanges.push({ date: e.date, from: ask, to: e.price });
    ask = e.price;
  }
  const listed = f.list_date?.value ?? null;
  const stated = f.days_on_market?.value ?? null;
  const active = (record.status.listing_status ?? record.status.evidence_class) === 'active';
  let days: number | null = stated;
  let daysBasis: OnMarket['daysBasis'] = stated !== null ? 'stated' : null;
  if (days === null && listed && active && /^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    const n = Math.round(dayNumber(asOf) - dayNumber(listed));
    if (n >= 0) {
      days = n;
      daysBasis = 'since_listed';
    }
  }
  const originalAsk = f.original_list_price?.value ?? null;
  if (days === null && !listed && originalAsk === null && !priceChanges.length) return null;
  return { listed, days, daysBasis, originalAsk, priceChanges, ask: f.list_price?.value ?? null };
}

/** For Hubert (get_numbers): plain fields, dates as written. */
export function onMarketFacts(m: OnMarket | null) {
  if (!m) return null;
  return {
    ...(m.listed ? { listed_on: m.listed } : {}),
    ...(m.days !== null ? { days_on_market: m.days, days_on_market_is: m.daysBasis === 'stated' ? 'as the listing or export says' : 'counted from the list date to the analysis date' } : {}),
    ...(m.originalAsk !== null ? { original_asking_price: m.originalAsk } : {}),
    ...(m.priceChanges.length ? { price_changes: m.priceChanges.map((c) => ({ date: c.date, from: c.from, to: c.to })) } : {}),
  };
}

/** "On the market 72 days, since Aug 17, 2026, first asking $1,250,000 · 2 price cuts, now $1,150,000." */
export function onMarketLine(m: OnMarket | null): string | null {
  if (!m) return null;
  const since = m.listed ? `, since ${isoDay(m.listed)}` : '';
  const head = m.days !== null ? `on the market ${m.days.toLocaleString('en-US')} day${m.days === 1 ? '' : 's'}${since}` : m.listed ? `listed ${isoDay(m.listed)}` : null;
  const first = m.originalAsk ?? m.priceChanges[0]?.from ?? null;
  const now = m.priceChanges.at(-1)?.to ?? m.ask;
  // One ask, unchanged: "asking". A first ask the page gives with no history of the change: "first asking, now".
  const askText = first === null ? null
    : m.priceChanges.length || now === null || now === first ? (m.priceChanges.length ? `first asking ${usd(first)}` : `asking ${usd(first)}`)
      : `first asking ${usd(first)}, now ${usd(now)}`;
  const lead = [head, askText].filter(Boolean).join(', ');
  const cuts = m.priceChanges.filter((c) => c.to < c.from).length;
  const rises = m.priceChanges.length - cuts;
  const changes = m.priceChanges.length
    ? `${[cuts && `${cuts} price cut${cuts === 1 ? '' : 's'}`, rises && `${rises} price increase${rises === 1 ? '' : 's'}`].filter(Boolean).join(', ')}, now ${usd(now)}`
    : '';
  const line = [lead, changes].filter(Boolean).join(' · ');
  return line ? `${line[0]!.toUpperCase()}${line.slice(1)}.` : null;
}
