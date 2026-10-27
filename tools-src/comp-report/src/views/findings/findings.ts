// Findings' words, built from the engine's output alone (Dispatch 14, item 9;
// plainer in Dispatch 21): "How Hubert got there", the verdict line, the status
// tiles and the pricing details' sentences. Deterministic
// and pure: no model call, nothing the engine doesn't know, and never the
// agent's number or the target (D-4) — Hubert's take is about the math only.
import type { AgentNumberPosition, CompOut, EngineOutput, EvidenceClass, Gap, Result, ResultKind } from '../../../engine/index.ts';
import type { RevealPin } from '../../../workspace/state.ts';
import { clientPrice, countWord, pct, psf } from '../../../workspace/format.ts';

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

/** A piece of the take: words, or a comp by name (its price, size and date in `title`), so Design can draw chips later. */
export type TakeSegment = { text: string } | { comp: string; name: string; title: string };

/** The take as one string: the comps by name. */
export function takeText(segments: readonly TakeSegment[]): string {
  return segments.map((s) => ('text' in s ? s.text : s.name)).join('');
}

/**
 * How Hubert got there (NW-063 a, NB-19 A): the true estimate, explained from
 * the agent's closest (1st-tier) sales and nothing else, one short sentence
 * per idea. The sales by name, their price, size and date in each name's
 * title; what they give the home; which sale sets each end; what stayed out.
 * For a buyer, a line on the offer. Without a range, why not.
 */
export function hubertTake(a: TakeArgs): TakeSegment[] {
  const { output, kind, home, sf, side } = a;
  const r = output.results[kind];
  const byId = new Map(output.comps.map((c) => [c.id, c]));
  const family: Family = r.lead.indicator.startsWith('unit_rate') ? 'unit_rate' : 'adjusted_price';
  const bracket = r.bracket ?? r.range;
  const inRange = (bracket?.comp_ids ?? []).map((id) => byId.get(id)).filter((c): c is CompOut => Boolean(c)).sort(byDateDesc);
  const inRangeIds = new Set(inRange.map((c) => c.id));
  const primarySold = output.comps.filter((c) => c.tier === 'primary' && c.evidence_class === 'sold').sort(byDateDesc);
  const asks = output.comps.filter((c) => c.tier === 'primary' && c.evidence_class !== null && c.evidence_class !== 'sold' && c.per_result[kind].included);
  const others = output.comps.filter((c) => c.tier !== 'primary' && c.tier_reason !== 'Not sorted yet');
  const second = others.some((c) => c.tier === 'secondary');
  const crossed = others.some((c) => c.tier === 'excluded');

  const out: TakeSegment[] = [];
  const say = (...parts: Array<string | TakeSegment[]>) => {
    if (out.length) out.push({ text: ' ' });
    for (const p of parts) {
      if (typeof p === 'string') out.push({ text: p });
      else out.push(...p);
    }
  };
  const comp = (c: CompOut): TakeSegment[] => {
    const p = c.per_result[kind];
    const bits: string[] = [];
    if (p.price) bits.push(clientPrice(p.price.value));
    if (sf && p.area_sqft) bits.push(sqftWords(p.area_sqft.value));
    const when = monthYear(c.status_date);
    if (when) bits.push(`sold ${when}`);
    return [{ comp: c.id, name: a.names.get(c.id) ?? identityName(c), title: bits.join(' · ') }];
  };
  const list = (cs: CompOut[]): TakeSegment[] => {
    const shown = cs.length <= 4 ? cs : cs.slice(0, 3);
    const segs: TakeSegment[] = [];
    shown.forEach((c, i) => {
      if (i > 0) segs.push({ text: i === shown.length - 1 && cs.length <= 4 ? ' and ' : ', ' });
      segs.push(...comp(c));
    });
    if (cs.length > 4) segs.push({ text: ` and ${cs.length - 3} more` });
    return segs;
  };

  if (!r.range || !bracket) {
    const why = r.range_unavailable_because ? engineWhy(r.range_unavailable_because) : 'the comps don’t give one yet';
    say(`I couldn’t make a range yet: ${why}.`);
    if (primarySold.length) say(`Your closest sales so far: `, list(primarySold), '.');
    else say('Tier at least two sales 1st on Sort and I’ll start from those.');
    if (asks.length) say('Only sales set a range, not your closest asks.');
    return out;
  }

  const n = inRange.length;
  say(`I started from your ${countWord(n)} closest sale${n === 1 ? '' : 's'}: `, list(inRange), '.');

  const adjusted = inRange.some((c) => c.per_result[kind].adjustments.some((x) => x.applied && x.dollars !== null && x.dollars !== 0));
  const h = output.headline_facts[kind].facts;
  const area = h.find((f) => f.id === 'home.area_sqft')?.value ?? null;
  const prices = `${clientPrice(bracket.low.value)}–${clientPrice(bracket.high.value)}`;
  if (family === 'unit_rate' && area) {
    // The engine's own rates, as the card above shows them; derived only if it gave none.
    const fact = (id: string) => h.find((f) => f.id === id)?.value;
    const lowRate = psf(fact('range.low_per_sqft') ?? bracket.low.value / area);
    const highRate = psf(fact('range.high_per_sqft') ?? bracket.high.value / area);
    const rates = lowRate === highRate ? `${lowRate} a sq ft` : `${lowRate}–${highRate} a sq ft`;
    say(adjusted ? `After adjustments, they come to ${rates}.` : `They sold for ${rates}.`);
    say(`On ${home}’s ${sqftWords(area)}, that’s ${prices}.`);
  } else {
    say(adjusted ? `After adjustments, they put ${home} at ${prices}.` : `They put ${home} at ${prices}.`);
  }

  const low = endComp(inRange, kind, family, bracket.low.value);
  const high = endComp(inRange, kind, family, bracket.high.value);
  if (low && high && low.id !== high.id) {
    const same = (c: CompOut) => (c.flags.same_building_as_subject ? ', in the same building,' : '');
    say(comp(low), `${same(low)} sets the low end.`);
    say(comp(high), `${same(high)} sets the top.`);
  }
  if (r.range.narrowed) say(`You narrowed that to ${clientPrice(r.range.low.value)}–${clientPrice(r.range.high.value)}.`);

  const missed = primarySold.filter((c) => !inRangeIds.has(c.id));
  for (const c of missed.slice(0, 2)) {
    const p = c.per_result[kind];
    const why = !p.included ? p.not_included_because[0] : family === 'unit_rate' ? (p.no_unit_rate_because ?? 'it has no size, so no price per sq ft') : null;
    say(comp(c), why ? ` didn’t count: ${engineWhy(why)}.` : ' didn’t count.');
  }
  if (missed.length > 2) say(`${countWord(missed.length - 2)} more of your closest sales didn’t count either.`);
  if (asks.length) say(asks.length === 1 ? 'Your closest ask doesn’t set the range. Only sales do.' : 'Your closest asks don’t set the range. Only sales do.');
  if (second || crossed) say(`Your ${second && crossed ? '2nd-tier and ✕' : second ? '2nd-tier' : '✕'} comps stayed out.`);

  if (side === 'buyer' && low) {
    const ask = a.asking && a.asking > 0 ? a.asking : null;
    if (!ask) say('For an offer, ', comp(low), ', at the low end, is your strongest case for going low.');
    else if (ask > r.range.high.value) {
      say(`The ask of ${clientPrice(ask)} is above what the sales support.`);
      say(comp(low), ' is your strongest case for offering under it.');
    } else if (ask >= r.range.low.value) {
      say(`The ask of ${clientPrice(ask)} is inside what the sales support.`);
      say(comp(low), ', at the low end, is your strongest case for offering under it.');
    } else say(`The ask of ${clientPrice(ask)} is already below what the sales support.`);
  }
  return out;
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

/**
 * How sales closed against their last asks (NW-071 a): "Your 3 sales closed a
 * median 2.1% above their last asking price, from −3.0% to +4.5%." The word
 * follows the sign; at 0, "at their asking price".
 */
export function saleToAskLine(sta: { n: number; median: { value: number }; min: { value: number }; max: { value: number } }): string {
  const r = Math.round(sta.median.value * 10) / 10;
  const one = sta.n === 1;
  const their = one ? 'its' : 'their';
  const where = r === 0 ? `at ${their} asking price` : `${Math.abs(r).toFixed(1)}% ${r < 0 ? 'below' : 'above'} ${their} last asking price`;
  if (one) return `Your one sale closed ${where}.`;
  return `Your ${sta.n} sales closed a median ${where}, from ${pct(sta.min.value)} to ${pct(sta.max.value)}.`;
}

/**
 * How long sales took (NW-072): the spread and the count. "Your 3 sales took
 * 24 to 259 days to go into contract; the middle one, 148." Two are named both.
 */
export function daysOnMarketLine(dom: { n: number; median: { value: number }; min: { value: number }; max: { value: number } }): string {
  const d = (f: { value: number }) => Math.round(f.value);
  if (dom.n === 1) return `Your one sale took ${d(dom.median)} days to go into contract.`;
  if (dom.n === 2) return `Your 2 sales took ${d(dom.min)} and ${d(dom.max)} days to go into contract.`;
  return `Your ${dom.n} sales took ${d(dom.min)} to ${d(dom.max)} days to go into contract; ${dom.n % 2 ? 'the middle one' : 'the median'}, ${d(dom.median)}.`;
}

/**
 * §8.4's backstop, on the target: how far changes since the reveal moved the
 * range toward or away from the target. Null until the range has changed, or
 * without a pin, a range or a target. The distance is from the target to the
 * range's nearer end (none when it's inside).
 */
export function movedLine(reveal: RevealPin | null | undefined, range: { low: number; high: number } | null, target: number | null, label: string): string | null {
  if (!reveal || reveal.low === null || reveal.high === null || !range || target === null) return null;
  if (reveal.low === range.low && reveal.high === range.high) return null;
  const gap = (lo: number, hi: number) => (target < lo ? lo - target : target > hi ? target - hi : 0);
  const before = gap(reveal.low, reveal.high);
  const now = gap(range.low, range.high);
  const the = label.startsWith('Your') ? label.charAt(0).toLowerCase() + label.slice(1) : `the ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  const from = `Since you first saw it, the range moved from ${clientPrice(reveal.low)}–${clientPrice(reveal.high)} to ${clientPrice(range.low)}–${clientPrice(range.high)}`;
  if (before === 0 && now === 0) return `${from}. ${the.charAt(0).toUpperCase()}${the.slice(1)} sits inside both.`;
  if (now < before) return `${from}: ${clientPrice(before - now)} closer to ${the}${now === 0 ? ', which it now takes in' : ''}.`;
  if (now > before) return `${from}: ${clientPrice(now - before)} further from ${the}.`;
  return `${from}, no closer to ${the}.`;
}

/**
 * "Still needed" (NW-077 a): only the gaps the agent can close on a screen
 * (Dispatch 19's `fillable`), and what they are: "2 facts about the home and
 * 1 about a comp to fill in". The rest belong with the warnings.
 */
export function stillNeeded(gaps: readonly Gap[]): { fillable: Gap[]; rest: Gap[]; words: string | null } {
  const fillable = gaps.filter((g) => g.fillable);
  const rest = gaps.filter((g) => !g.fillable);
  const home = fillable.filter((g) => g.target === 'subject' || g.target === null).length;
  const comps = fillable.length - home;
  const fact = (n: number) => `${n} fact${n === 1 ? '' : 's'}`;
  const parts = [home ? `${fact(home)} about the home` : '', comps ? `${home ? `${comps}` : fact(comps)} about ${comps === 1 ? 'a comp' : 'your comps'}` : ''].filter(Boolean);
  return { fillable, rest, words: parts.length ? `${parts.join(' and ')} to fill in` : null };
}
