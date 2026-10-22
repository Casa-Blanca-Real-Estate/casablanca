// What the writer is given (Dispatch 13, item 2; §8.4, §10.2): the request the
// model sees, built from the engine's output and the agent's own lines — and
// nothing else. Plain data, like the engine, so the server builds it, the
// tests inspect it and the eval prints it.
//
// What it holds:
//   - the result's headline facts and the names beside them
//   - the comps that count, with their status, price, $/sq ft, link, the
//     agent's notes (agent-stated), their own public facts — floor, size,
//     rooms, days on the market, sale against ask, date — and how they differ
//     from the home as the engine measured it (Frankie's lines use these)
//   - the price table
//   - buyer or seller, and the client's first name
//   - the length: full, short or text
//   - the agent's own lines for this email — how they chose the comps, things
//     to consider, the next step — each marked agent-stated
//
// What it can't hold, by construction: the agent's number, any target, and
// deal terms the agent hasn't written into the email. It reads the headline
// facts' `facts` and `names`, never `agent_number`; and the server computes
// the output it reads from an engine input with no named prices and no deal
// terms, as get_numbers does (server/numbers.ts).
import type { ComparisonOut, EngineOutput, HeadlineFact, ResultKind } from '../engine/index.ts';
import { canonicalJson } from '../engine/util/canonical-json.ts';
import { sha256Tag } from '../engine/util/sha256.ts';
import { addressOf, countedComps, hasHomeSize, urlOf, type EmailLength } from './email.ts';
import type { WorkspaceComp } from './engine-input.ts';
import { againstAsk, clientPrice, estimateWords, psf, sqft, usd } from './format.ts';
import { homeName } from './reading.ts';
import { noteOf, type Audience, type Brief, type Intake, type SendState } from './state.ts';

export interface WriterComp {
  /** The engine's comp id: the writer returns each comp's lines by it. */
  id: string;
  name: string;
  status: 'sold' | 'in contract' | 'active' | 'didn’t sell';
  link: string | null;
  /** What the email already says about it after its name, before the writer's lines: the code's frame. */
  frame_line: string;
  tier: 'primary' | 'secondary';
  closest_comp?: true;
  facts: Record<string, string>;
  /** How it differs from the home, as the engine measured it: "50 sq ft smaller than the home". */
  against_the_home: string[];
  /** The agent's own note on it: agent-stated, their words. */
  agent_note: string | null;
  /** The agent's tags on it, from the house list (Dispatch 14). */
  agent_tags: string[];
}

export interface WriterInput {
  home: { name: string; address: string | null; unit: string | null };
  audience: Audience | null;
  client_first_name: string | null;
  length: EmailLength;
  result: { kind: ResultKind; label: string; uses_agent_estimates: string[] };
  /** The only figures a headline may cite (§10.2), as the email writes them. */
  headline_facts: Array<{ id: string; what: string; value: string }>;
  /** What a headline can't say yet, and why. */
  headline_cannot_say: string[];
  comps: WriterComp[];
  /** The home's price at $/sq ft steps (§6.5): the email shows it as a table. */
  price_table: Array<{ per_sqft: string; price: string }> | null;
  /** The agent's own lines for this email, marked agent-stated. */
  agent_stated: { how_the_comps_were_chosen?: string; things_to_consider?: string; next_step?: string };
}

/** A headline fact, written as the email writes it: $/sq ft truncated, prices to three figures (§6.1). */
function shown(f: HeadlineFact): string {
  switch (f.unit) {
    case 'usd': return f.id.endsWith('price') ? usd(f.value) : `about ${clientPrice(f.value)}`;
    case 'usd_per_sqft': return `${psf(f.value)} a sq ft`;
    case 'percent': return `${Math.abs(Math.round(f.value * 10) / 10).toFixed(1)}% ${f.value < 0 ? 'below' : f.value > 0 ? 'above' : 'at'}`;
    case 'days': return `${Math.round(f.value)} days`;
    case 'sqft': return sqft(f.value);
    case 'usd_per_month': return `${usd(f.value)} a month`;
    default: return String(Math.round(f.value * 100) / 100);
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Factors whose difference, better or worse, is worth a comp's line; the rest (equipment, policies, recency) aren't. */
const QUALITATIVE = new Set(['views', 'outdoor_space', 'service_level', 'amenities', 'unit_type', 'building_era', 'parking']);

/** The engine's comparison against the home, in words — only its own measurements, never a new figure. */
export function againstHome(k: ComparisonOut): string | null {
  if (k.status !== 'compared') return null;
  const n = k.units === null ? null : Math.abs(k.units);
  // Signed so positive means the comp is worse: subject minus comp for area, rooms and floors; comp minus subject for carry.
  const worse = (k.units ?? 0) > 0;
  if (k.factor === 'interior_size' && n !== null) return n ? `${sqft(n)} ${worse ? 'smaller' : 'bigger'} than the home` : 'the same size as the home';
  if (k.factor === 'floor' && n !== null) return n ? `${plural(n, 'floor')} ${worse ? 'lower' : 'higher'} than the home` : 'on the same floor as the home';
  if (k.factor === 'beds_baths' && n !== null) {
    const what = k.name.toLowerCase().startsWith('bed') ? 'bedroom' : 'bathroom';
    return n ? `${plural(n, what)} ${worse ? 'fewer' : 'more'} than the home` : what === 'bedroom' ? 'the same number of bedrooms as the home' : null;
  }
  if (k.factor === 'carrying_costs' && n !== null) return n ? `${usd(n)} a month ${worse ? 'more' : 'less'} to carry than the home` : null;
  if (QUALITATIVE.has(k.factor) && (k.direction === 'comp_superior' || k.direction === 'comp_inferior')) {
    return `${k.name}: ${k.direction === 'comp_superior' ? 'better than' : 'not as good as'} the home’s`;
  }
  return null;
}

const STATUS_WORDS = { sold: 'sold', in_contract: 'in contract', active: 'active', off_market: 'didn’t sell' } as const;

/** The writer's request body, for one result and one length. Pure: the same inputs give the same request. */
export function writerInput(args: {
  output: EngineOutput;
  result: ResultKind;
  comps: WorkspaceComp[];
  homeAddress: string | null;
  homeUnit: string | null;
  audience: Audience | null;
  clientName: string | null;
  length: EmailLength;
  agentLines: { chosen?: string | undefined; consider?: string | undefined; nextStep?: string | undefined };
}): WriterInput {
  const { output, result, length } = args;
  const h = output.headline_facts[result];
  const r = output.results[result];
  const outById = new Map(output.comps.map((c) => [c.id, c]));
  const listed = length === 'text' ? [] : countedComps(output, result, args.comps).filter((x) => length === 'full' || x.status === 'sold');
  // No size for the home (or a co-op): no sizes and no per-SF figures for the writer to quote (Dispatch 14).
  const sized = hasHomeSize(output);

  const comps: WriterComp[] = listed.map(({ status, comp, line }) => {
    const out = outById.get(comp.id)!;
    const f = comp.record.facts;
    const facts: Record<string, string> = {};
    if (f.floor) facts.floor = String(f.floor.value);
    if (f.area_sqft && sized) facts.size = sqft(f.area_sqft.value, f.area_sqft.confidence === 'approx' || comp.record.flags.approx_area);
    if (f.beds) facts.bedrooms = String(f.beds.value);
    if (f.baths) facts.bathrooms = String(f.baths.value);
    if (out.days_on_market !== null) facts.days_on_the_market = String(out.days_on_market);
    if (out.sale_to_ask_percent) facts.sale_against_last_ask = againstAsk(out.sale_to_ask_percent.value);
    if (f.status_date) facts[status === 'sold' ? 'sale_date' : 'date'] = f.status_date.value;
    const pr = out.per_result[result];
    if (pr.monthly_carry) facts.monthly_carry = `${usd(pr.monthly_carry.value)} a month`;
    const note = noteOf(comp.judgment);
    return {
      id: comp.id,
      name: addressOf(comp),
      status: STATUS_WORDS[status],
      link: urlOf(comp),
      frame_line: line,
      tier: out.tier === 'primary' ? 'primary' : 'secondary',
      ...(out.anchor ? { closest_comp: true as const } : {}),
      facts,
      against_the_home: pr.comparisons.map(againstHome).filter((x): x is string => Boolean(x)),
      agent_note: note,
      agent_tags: comp.judgment?.tags ?? [],
    };
  });

  const firstName = args.clientName?.trim().split(/\s+/)[0] ?? null;
  const agent: WriterInput['agent_stated'] = {};
  if (length === 'full' && args.agentLines.chosen?.trim()) agent.how_the_comps_were_chosen = args.agentLines.chosen.trim();
  if (length === 'full' && args.agentLines.consider?.trim()) agent.things_to_consider = args.agentLines.consider.trim();
  if (args.agentLines.nextStep?.trim()) agent.next_step = args.agentLines.nextStep.trim();

  return {
    home: { name: homeName(args.homeUnit, args.homeAddress), address: args.homeAddress, unit: args.homeUnit },
    audience: args.audience,
    client_first_name: firstName || null,
    length,
    result: { kind: result, label: r.label, uses_agent_estimates: [...new Set(r.estimates_used.map(estimateWords))] },
    // The base is one number: the house speaks in ranges (§9.2), so the writer isn't handed it.
    headline_facts: h.facts.filter((f) => !f.id.startsWith('base') && (sized || f.unit !== 'usd_per_sqft')).map((f) => ({ id: f.id, what: f.label, value: shown(f) })),
    headline_cannot_say: h.missing,
    comps,
    price_table: length === 'full' && sized && r.price_table
      ? r.price_table.rows.map((row) => ({ per_sqft: psf(row.per_sqft.value), price: clientPrice(row.price.value) }))
      : null,
    agent_stated: agent,
  };
}

/**
 * The writer's input from the report as it's stored: the server builds the
 * request with it, and the browser builds the same thing to tell whether a
 * draft is still current. `output` must carry no named prices or deal terms
 * where it's sent; this reads neither either way.
 */
export function writerInputFrom(args: {
  output: EngineOutput;
  comps: WorkspaceComp[];
  intake: Intake | undefined;
  brief: Brief;
  send: SendState;
  result: ResultKind;
  length: EmailLength;
}): WriterInput {
  const { intake, brief, send } = args;
  return writerInput({
    output: args.output, result: args.result, comps: args.comps, length: args.length,
    homeAddress: intake?.address?.value.split(',')[0]?.trim() || null,
    homeUnit: intake?.unit?.value ?? null,
    audience: brief.audience?.value ?? null,
    clientName: brief.clientName?.value ?? send.clientName?.value ?? null,
    agentLines: { chosen: send.chosen?.value, consider: send.consider?.value, nextStep: send.nextStep?.value },
  });
}

/**
 * An input's key — a hash of its canonical JSON — so a stored draft's input
 * compares with one built now: the database keeps the input as jsonb, which
 * doesn't keep key order, and the browser gets the key, not the whole input.
 */
export function writerInputKey(input: WriterInput | null | undefined): string {
  return input ? sha256Tag(canonicalJson(input)) : '';
}
