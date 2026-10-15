// Findings' words, built from the engine's output alone (Dispatch 14, item 9):
// "How Hubert got there", the verdict line and the status tiles. Deterministic
// and pure: no model call, nothing the engine doesn't know, and never the
// agent's number or the target (D-4) — Hubert's take is about the math only.
import type { AgentNumberPosition, CompOut, EngineOutput, EvidenceClass, Result, ResultKind } from '../../../engine/index.ts';
import { clientPrice, countWord, psf } from '../../../workspace/format.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2026-08-27 → "Aug 2026". Null without a date. */
export function monthYear(date: string | null | undefined): string | null {
  const m = date ? /^(\d{4})-(\d{2})/.exec(date) : null;
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : null;
}

/** "a, b and c". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

const sqftWords = (n: number) => `${Math.round(n).toLocaleString('en-US')} sq ft`;

/** A comp's name from the engine's identity, when the page gives none: "200 Chambers St #10A". */
export function identityName(c: CompOut | undefined): string {
  if (!c) return 'a comp';
  const street = c.identity.address.street ?? 'a comp';
  const unit = c.identity.unit.raw;
  return unit ? `${street} ${unit.startsWith('#') ? unit : `#${unit}`}` : street;
}

/** The engine's reasons speak of "primary" comps; the screens call them 1st tier. */
export function engineWhy(reason: string): string {
  // The engine's method label carries a note for the build ("the default method, pending Noble"): agents don't need it.
  return reason.replace(/\s+—\s+the default method, pending Noble/, '').replace(/\bprimary\b/g, '1st-tier').replace(/\s+—\s+/g, ': ');
}

export interface TakeArgs {
  output: EngineOutput;
  kind: ResultKind;
  /** The comps by the engine's id, named as the report shows them. */
  names: ReadonlyMap<string, string>;
  /** The home's short name: "17L". */
  home: string;
  /** The home has a size: sizes and $/sq ft show only then. */
  sf: boolean;
  side: 'buyer' | 'seller';
  /** The home's asking price, where it's listed. */
  asking: number | null;
}

type Family = 'unit_rate' | 'adjusted_price';

/** The value a comp gives the home in the lead's family: its adjusted $/sq ft × the home's size, or its adjusted price. */
function impliedOf(c: CompOut, kind: ResultKind, family: Family): number | null {
  const p = c.per_result[kind];
  return (family === 'unit_rate' ? p.implied_value?.value : p.adjusted_price?.value) ?? null;
}

/** The comp whose value sets an end of the bracket (the first, if two tie). */
function endComp(comps: CompOut[], kind: ResultKind, family: Family, value: number): CompOut | undefined {
  let best: CompOut | undefined;
  let gap = Infinity;
  for (const c of comps) {
    const v = impliedOf(c, kind, family);
    if (v === null) continue;
    const d = Math.abs(v - value);
    if (d < gap) {
      gap = d;
      best = c;
    }
  }
  return best;
}

const byDateDesc = (a: CompOut, b: CompOut) => (b.status_date ?? '').localeCompare(a.status_date ?? '');

/**
 * How Hubert got there: the true estimate, explained from the agent's 1st-tier
 * sales and nothing else. Each sale by name with its price, its size (with SF
 * only) and when it sold; what that gives the home; which sale sets each end;
 * what stayed out. For a buyer, a line on the offer. Without a range, why not.
 */
export function hubertTake(a: TakeArgs): string {
  const { output, kind, home, sf, side } = a;
  const r = output.results[kind];
  const byId = new Map(output.comps.map((c) => [c.id, c]));
  const name = (c: CompOut | undefined) => (c ? a.names.get(c.id) ?? identityName(c) : 'a comp');
  const family: Family = r.lead.indicator.startsWith('unit_rate') ? 'unit_rate' : 'adjusted_price';
  const bracket = r.bracket ?? r.range;
  const inRange = (bracket?.comp_ids ?? []).map((id) => byId.get(id)).filter((c): c is CompOut => Boolean(c)).sort(byDateDesc);
  const inRangeIds = new Set(inRange.map((c) => c.id));
  const primarySold = output.comps.filter((c) => c.tier === 'primary' && c.evidence_class === 'sold').sort(byDateDesc);
  const asks = output.comps.filter((c) => c.tier === 'primary' && c.evidence_class !== null && c.evidence_class !== 'sold' && c.per_result[kind].included);
  const others = output.comps.filter((c) => c.tier !== 'primary' && c.tier_reason !== 'Not sorted yet');
  const second = others.some((c) => c.tier === 'secondary');
  const crossed = others.some((c) => c.tier === 'excluded');

  const sale = (c: CompOut) => {
    const p = c.per_result[kind];
    const bits: string[] = [];
    if (p.price) bits.push(clientPrice(p.price.value));
    if (sf && p.area_sqft) bits.push(sqftWords(p.area_sqft.value));
    const when = monthYear(c.status_date);
    if (when) bits.push(`sold ${when}`);
    return bits.length ? `${name(c)} (${bits.join(', ')})` : name(c);
  };
  const salesList = (list: CompOut[]) => (list.length <= 4 ? listWords(list.map(sale)) : `${listWords(list.slice(0, 3).map(sale))} and ${list.length - 3} more`);

  const out: string[] = [];
  if (!r.range || !bracket) {
    const why = r.range_unavailable_because ? engineWhy(r.range_unavailable_because) : 'the comps don’t give one yet';
    out.push(`I couldn’t make a range yet: ${why}.`);
    if (primarySold.length) out.push(`Your 1st-tier sales so far: ${salesList(primarySold)}.`);
    else out.push('Tier at least two sales 1st on Sort and I’ll start from those.');
    if (asks.length) out.push(`Your 1st-tier asks don’t set a range: only sales do.`);
    return out.join(' ');
  }

  const n = inRange.length;
  out.push(`I started from your ${countWord(n)} 1st-tier sale${n === 1 ? '' : 's'}: ${salesList(inRange)}.`);

  const adjusted = inRange.some((c) => c.per_result[kind].adjustments.some((x) => x.applied && x.dollars !== null && x.dollars !== 0));
  const lead = adjusted ? 'After the adjustments, ' : '';
  const h = output.headline_facts[kind].facts;
  const area = h.find((f) => f.id === 'home.area_sqft')?.value ?? null;
  const prices = `${clientPrice(bracket.low.value)}–${clientPrice(bracket.high.value)}`;
  if (family === 'unit_rate' && area) {
    // The engine's own rates, as the card above shows them; derived only if it gave none.
    const fact = (id: string) => h.find((f) => f.id === id)?.value;
    const lowRate = psf(fact('range.low_per_sqft') ?? bracket.low.value / area);
    const highRate = psf(fact('range.high_per_sqft') ?? bracket.high.value / area);
    const rates = lowRate === highRate ? `${lowRate} a sq ft` : `${lowRate}–${highRate} a sq ft`;
    out.push(`${lead}${lead ? 'at' : 'At'} ${rates} on ${home}’s ${sqftWords(area)}, that comes to ${prices}.`);
  } else {
    out.push(`${lead}${lead ? 'they' : 'They'} put ${home} at ${prices}.`);
  }

  const low = endComp(inRange, kind, family, bracket.low.value);
  const high = endComp(inRange, kind, family, bracket.high.value);
  if (low && high && low.id !== high.id) {
    const same = (c: CompOut) => (c.flags.same_building_as_subject ? `, in the same building,` : '');
    out.push(`${name(low)}${same(low)} sets the low end and ${name(high)}${same(high)} the top.`);
  }
  if (r.range.narrowed) out.push(`You narrowed that to ${clientPrice(r.range.low.value)}–${clientPrice(r.range.high.value)}.`);

  const missed = primarySold.filter((c) => !inRangeIds.has(c.id));
  for (const c of missed.slice(0, 2)) {
    const p = c.per_result[kind];
    const why = !p.included ? p.not_included_because[0] : family === 'unit_rate' ? (p.no_unit_rate_because ?? 'it has no size, so no price per sq ft') : null;
    out.push(why ? `${name(c)} didn’t count: ${engineWhy(why)}.` : `${name(c)} didn’t count.`);
  }
  if (missed.length > 2) out.push(`${countWord(missed.length - 2)} more 1st-tier sale${missed.length - 2 === 1 ? '' : 's'} didn’t count either.`);
  if (asks.length) out.push(`Your 1st-tier ask${asks.length === 1 ? '' : 's'} (in contract, active or didn’t sell) ${asks.length === 1 ? 'doesn’t' : 'don’t'} set the range: only sales do.`);
  if (second || crossed) out.push(`Your ${second && crossed ? '2nd-tier and ✕' : second ? '2nd-tier' : '✕'} comps stayed out of the range.`);

  if (side === 'buyer' && low) {
    const ask = a.asking && a.asking > 0 ? a.asking : null;
    if (!ask) out.push(`For an offer, ${name(low)}, at the low end, is the strongest case for coming in low.`);
    else if (ask > r.range.high.value) out.push(`For an offer, the ask of ${clientPrice(ask)} sits above what the sales support, and ${name(low)} is the strongest case for coming in under it.`);
    else if (ask >= r.range.low.value) out.push(`For an offer, the ask of ${clientPrice(ask)} sits inside what the sales support; ${name(low)}, at the low end, is the strongest case for coming in under it.`);
    else out.push(`For an offer, the ask of ${clientPrice(ask)} already sits below what the sales support.`);
  }
  return out.join(' ');
}

const POSITION: Record<AgentNumberPosition, string> = {
  below: 'sits below the true estimate',
  within: 'sits inside the true estimate',
  above: 'sits above the true estimate',
  overlaps_low: 'starts below the true estimate and ends inside it',
  overlaps_high: 'starts inside the true estimate and runs above it',
  spans: 'is wider than the true estimate, on both sides',
};

/**
 * The verdict: the agent's guess against the true estimate, from the engine's
 * `agent_number`. "Your guess sits below the true estimate, by about $25.4K."
 * Null with no guess or no range to set it against.
 */
export function verdictLine(output: EngineOutput, kind: ResultKind): string | null {
  const a = output.headline_facts[kind].agent_number;
  if (!a?.position || !output.results[kind].range) return null;
  const gap = a.facts.find((f) => f.id === 'agent.below_range_by' || f.id === 'agent.above_range_by');
  return `Your guess ${POSITION[a.position]}${gap ? `, by about ${clientPrice(gap.value)}` : ''}.`;
}

export interface StatusTile {
  status: EvidenceClass;
  name: string;
  /** The comps of this status that count. */
  n: number;
  value: string;
  unit: string;
}

const TILE_NAME: Record<EvidenceClass, string> = { sold: 'Sold', in_contract: 'In contract', active: 'Active', off_market: 'Didn’t sell' };
const ONE: Record<EvidenceClass, string> = { sold: 'sale', in_contract: 'ask', active: 'ask', off_market: 'last ask' };
const MANY: Record<EvidenceClass, string> = { sold: 'median', in_contract: 'median ask', active: 'median ask', off_market: 'median last ask' };
export const TILE_ORDER: EvidenceClass[] = ['sold', 'in_contract', 'active', 'off_market'];

/**
 * The status tiles: per status, the comps that count and their median, as
 * $/SF when the home has a size and the comps give one, else as a price.
 */
export function statusTiles(r: Result, sf: boolean): StatusTile[] {
  return TILE_ORDER.map((status) => {
    const e = r.evidence[status];
    const n = e.counts.included;
    if (sf && e.price_per_sqft) return { status, name: TILE_NAME[status], n, value: psf(e.price_per_sqft.median.value), unit: ' / SF' };
    if (e.price) return { status, name: TILE_NAME[status], n, value: clientPrice(e.price.median.value), unit: ` ${e.price.n > 1 ? MANY[status] : ONE[status]}` };
    return { status, name: TILE_NAME[status], n, value: '—', unit: '' };
  });
}
