// QA on every draft, before it can be copied (§9; Dispatch 13, item 5). The
// same checks run in the browser, live as the agent edits, and on the server,
// on the writer's own output and again on what the agent copies, so the log
// says what was checked.
//
//   numbers       every number and date in the email is matched against the
//                 ledger: the result's headline facts, the comps' own figures,
//                 the price table, the home's own facts, and what the agent
//                 stated (their lines, their notes on the comps, their own
//                 figures). An unmatched one is listed; the agent attributes
//                 it, edits it, or acknowledges it, and the acknowledgment is
//                 logged. Then Copy proceeds (§9.1).
//   range         a point value ("worth $3.5M") is flagged; a list-price
//                 recommendation isn't (§9.2). A warning only.
//   appraisal     "appraisal" and "appraised value": the hard block (§9.3, D-2)
//   fair housing  a term on the fixed list is a hard block; a word near one
//                 warns, and is acknowledged before Copy (fair-housing.ts)
//   disclaimer    always in (D-13)
//   estimates     a draft that uses "with estimates" says so (§9.5)
//
// Nothing here can be acknowledged away that §9.3 makes a hard block.
import type { EngineOutput, ResultKind } from '../engine/index.ts';
import type { WorkspaceComp } from './engine-input.ts';
import { fairHousingFindings, FAIR_HOUSING_LIST_VERSION } from './fair-housing.ts';
import { estimateWords } from './format.ts';
import { DISCLAIMER, HEADLINE_PLACEHOLDER, SAMPLE_BANNER } from './frame.ts';
import { numbersIn, unmatchedNumbers, type Known, type KnownUnit, type Ledger } from './grounding.ts';
import type { Intake } from './state.ts';
import type { WriterInput } from './writer-input.ts';

export const QA_VERSION = `qa-2026-10-14+${FAIR_HOUSING_LIST_VERSION}`;

// ─── The ledger: what a draft may cite ───────────────────────────────────────

function compName(c: WorkspaceComp): string {
  const street = c.record.identity.address.street ?? '';
  const unit = c.record.identity.unit.raw ?? '';
  return `${street} ${unit}`.trim();
}

/**
 * Everything the email may cite for one result (§9.1). `agentText` is the
 * agent's own words in it — their lines, their notes on the comps, the
 * sign-off — and `agentFigures` the figures they gave (their number, a
 * target, an offer): both resolve as agent-stated. The writer's ledger has
 * neither of the agent's figures, because the writer never sees them (§8.4).
 */
export function ledgerFor(args: {
  output: EngineOutput;
  result: ResultKind;
  comps: WorkspaceComp[];
  intake?: Intake | undefined;
  agentText?: Array<string | null | undefined>;
  agentFigures?: number[];
}): Ledger {
  const { output, result } = args;
  const numbers: Known[] = [];
  const add = (value: number | null | undefined, unit: KnownUnit, label: string, source: Known['source']) => {
    if (value !== null && value !== undefined && Number.isFinite(value)) numbers.push({ value, unit, label, source });
  };
  const h = output.headline_facts[result];
  for (const f of h.facts) add(f.value, f.unit, f.label, 'fact');

  const r = output.results[result];
  add(r.carry.subject?.value, 'usd_per_month', 'the home’s monthly carry', 'fact');
  add(r.carry.comp_median?.value, 'usd_per_month', 'the comps’ median monthly carry', 'fact');
  add(r.carry.subject_vs_median_percent?.value, 'percent', 'the home’s carry against the comps’ median', 'fact');
  if (r.price_table) {
    for (const row of r.price_table.rows) {
      add(row.per_sqft.value, 'usd_per_sqft', 'a step of the price table', 'table');
      add(row.price.value, 'usd', 'a price in the price table', 'table');
    }
  }

  const dates = new Set<string>([output.meta.as_of]);
  const outById = new Map(output.comps.map((c) => [c.id, c]));
  for (const c of args.comps) {
    const name = compName(c) || c.id;
    const f = c.record.facts;
    add(f.sale_price?.value, 'usd', `${name}: sale price`, 'comp');
    add(f.list_price?.value, 'usd', `${name}: last ask`, 'comp');
    add(f.original_list_price?.value, 'usd', `${name}: first ask`, 'comp');
    add(f.area_sqft?.value, 'sqft', `${name}: size`, 'comp');
    add(f.beds?.value, 'rooms', `${name}: bedrooms`, 'comp');
    add(f.baths?.value, 'rooms', `${name}: bathrooms`, 'comp');
    add(f.rooms?.value, 'rooms', `${name}: rooms`, 'comp');
    add(f.floor?.value, 'floor', `${name}: floor`, 'comp');
    add(f.days_on_market?.value, 'days', `${name}: days on the market`, 'comp');
    add(f.common_charges_monthly?.value, 'usd_per_month', `${name}: common charges`, 'comp');
    add(f.taxes_monthly?.value, 'usd_per_month', `${name}: taxes`, 'comp');
    add(f.maintenance_monthly?.value, 'usd_per_month', `${name}: maintenance`, 'comp');
    add(f.year_built?.value, 'number', `${name}: year built`, 'comp');
    add(f.outdoor_area_sqft?.value, 'sqft', `${name}: outdoor space`, 'comp');
    for (const d of [f.status_date?.value, f.list_date?.value, f.contract_date?.value]) if (d) dates.add(d);
    const out = outById.get(c.id);
    if (!out) continue;
    if (out.market_date) dates.add(out.market_date.date);
    add(out.days_on_market, 'days', `${name}: days on the market`, 'comp');
    add(out.sale_to_ask_percent?.value, 'percent', `${name}: sale against last ask`, 'comp');
    const pr = out.per_result[result];
    add(pr.price?.value, 'usd', `${name}: price`, 'comp');
    add(pr.price_per_sqft?.value, 'usd_per_sqft', `${name}: $/sq ft`, 'comp');
    add(pr.monthly_carry?.value, 'usd_per_month', `${name}: monthly carry`, 'comp');
    add(pr.ask_vs_sold?.versus_sold_median_percent.value, 'percent', `${name}: ask against the sold median`, 'comp');
    // How it differs from the home, as the engine measured it: "50 sq ft smaller", "2 floors lower".
    for (const k of pr.comparisons) {
      if (k.units === null) continue;
      add(Math.abs(k.units), k.unit_label === 'usd_per_month' ? 'usd_per_month' : 'number', `${name}: ${k.name.toLowerCase()} against the home`, 'comp');
    }
  }

  const i = args.intake ?? {};
  add(i.areaSqft?.value, 'sqft', 'the home’s size', 'home');
  add(i.beds?.value, 'rooms', 'the home’s bedrooms', 'home');
  add(i.baths?.value, 'rooms', 'the home’s bathrooms', 'home');
  add(i.floor?.value, 'floor', 'the home’s floor', 'home');
  add(i.askingPrice?.value, 'usd', 'the home’s asking price', 'home');
  add(i.commonCharges?.value, 'usd_per_month', 'the home’s common charges', 'home');
  add(i.taxes?.value, 'usd_per_month', 'the home’s taxes', 'home');
  add(i.outdoorSqft?.value, 'sqft', 'the home’s outdoor space', 'home');
  add(i.yearBuilt?.value, 'number', 'the year the home’s building was built', 'home');

  for (const text of args.agentText ?? []) {
    for (const v of numbersIn(text ?? '')) add(v, 'any', 'something you wrote', 'agent');
  }
  for (const v of args.agentFigures ?? []) add(v, 'usd', 'a figure you gave', 'agent');

  const names = [
    ...h.names.map((n) => `${n.address ?? ''} ${n.unit ?? ''}`),
    ...args.comps.map(compName),
    `${i.address?.value ?? ''} ${i.unit?.value ?? ''}`,
  ];
  const frame = [DISCLAIMER, SAMPLE_BANNER, HEADLINE_PLACEHOLDER, ...r.estimates_used.map(estimateWords)];
  return { numbers, names, dates: [...dates], frame };
}

/**
 * What the writer was given, as a ledger (CR-5): the only figures and dates
 * its draft may cite. Every number in the request's text counts, the agent's
 * own lines and notes included (agent-stated); a name's digits don't.
 */
export function ledgerFromInput(input: WriterInput): Ledger {
  const numbers: Known[] = [];
  const dates = new Set<string>();
  const NAMES = new Set(['id', 'name', 'link', 'home']);
  const walk = (v: unknown, key = ''): void => {
    if (NAMES.has(key)) return;
    if (typeof v === 'string') {
      for (const d of v.match(/\d{4}-\d{2}-\d{2}/g) ?? []) dates.add(d);
      for (const n of numbersIn(v.replace(/\d{4}-\d{2}-\d{2}/g, ' '))) numbers.push({ value: n, unit: 'any', label: `given to the writer (${key})`, source: 'fact' });
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(input);
  const names = [`${input.home.address ?? ''} ${input.home.unit ?? ''}`, ...input.comps.map((c) => c.name)];
  return { numbers, names, dates: [...dates], frame: [] };
}

// ─── Range language (§9.2) ───────────────────────────────────────────────────

const MONEY = String.raw`\$\d[\d,]*(?:\.\d+)?(?:\s?(?:million|mil|thousand|[KkMm])(?![a-z]))?`;
const HEDGE = String.raw`(?:about |around |approximately |roughly |~|just under |just over |close to |nearly |at least |at most )?`;
const POINT_VALUE = new RegExp(
  [
    String.raw`\b(?:worth|valued? at|(?:fair )?market value (?:is|of|at)|a value of|values? (?:it|the home|the apartment|the unit) at)\s+${HEDGE}${MONEY}`,
    String.raw`\b(?:it'?s|it’s|is) an? ${MONEY}\s+(?:home|apartment|unit|property|condo|co-?op)\b`,
  ].join('|'),
  'gi',
);
/** "worth $4.2M–$4.9M" is a range, not a point value. */
const RANGE_AFTER = new RegExp(String.raw`^\s*(?:–|—|-|to|and)\s*\$?\d`);

export interface Finding {
  text: string;
  index: number;
}

/** Point-value claims ("worth $3.5M"). List-price and offer language isn't one (§9.2). */
export function pointValueFindings(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(POINT_VALUE)) {
    const end = (m.index ?? 0) + m[0].length;
    if (RANGE_AFTER.test(text.slice(end))) continue;
    out.push({ text: m[0], index: m.index ?? 0 });
  }
  return out;
}

// ─── Appraisal (§9.3) ────────────────────────────────────────────────────────

export interface QaFinding {
  check: 'appraisal_word';
  match: string;
  index: number;
}

/**
 * "Appraisal" and "appraised value" never appear in client copy — the one hard
 * block (§9.3, D-2). The approved disclaimer is the exception: the tool puts it
 * there, and it says the analysis isn't one.
 */
export function appraisalFindings(text: string): QaFinding[] {
  const findings: QaFinding[] = [];
  const copy = text.split(DISCLAIMER).join(' '.repeat(DISCLAIMER.length));
  for (const m of copy.matchAll(/\b(appraisals?|appraised\s+values?)\b/gi)) {
    findings.push({ check: 'appraisal_word', match: m[0], index: m.index ?? 0 });
  }
  return findings;
}

// ─── The checks ──────────────────────────────────────────────────────────────

/**
 * The agent's answer to one finding: they attributed it (it's theirs or the
 * client's — "your goal of $3.6M") or acknowledged it and kept it (§9.1).
 */
export interface Acknowledgment {
  key: string;
  how: 'attributed' | 'acknowledged';
  /** The finding as it read when they answered. */
  text: string;
  at: string;
}

export interface QaItem {
  /** Stable across edits while the finding reads the same: "number:$4.3M", "fair_housing:family". */
  key: string;
  text: string;
  context: string;
  note: string | null;
  ack: Acknowledgment | null;
}

export type QaCheckId = 'headline' | 'numbers' | 'range' | 'appraisal' | 'fair_housing' | 'fair_housing_near' | 'disclaimer' | 'estimates' | 'sample';

export interface QaCheck {
  id: QaCheckId;
  state: 'pass' | 'fail' | 'warn';
  message: string;
  /** Each item has to be acknowledged (or fixed) before Copy. */
  needsAck?: boolean;
  items?: QaItem[];
}

function contextOf(text: string, index: number, length: number): string {
  const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, index - 28)) + 1);
  const endAt = text.indexOf(' ', Math.min(text.length, index + length + 28));
  const end = endAt < 0 ? text.length : endAt;
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

function uniqueItems(items: QaItem[]): QaItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
}

/**
 * Every check on a draft (§9), and whether it can be copied (qaStatus). Fails
 * block; a check that needs acknowledgment blocks until each of its items is
 * acknowledged or fixed; a warning only notes.
 */
export function draftChecks(args: {
  /** The whole email as it would be copied: the subject line and the body. */
  text: string;
  /**
   * Only what's written, not the frame: the writer's own output, checked on
   * the server as it lands (CR-5). The headline, disclaimer, estimates and
   * sample checks are the whole email's, and wait for it.
   */
  contentOnly?: boolean;
  headline: string | undefined;
  ledger: Ledger;
  /** The result the email uses, and the output it's from: for the estimates check, the whole email's. */
  result?: ResultKind;
  output?: EngineOutput;
  sample: boolean;
  acks?: Acknowledgment[];
}): QaCheck[] {
  const acks = new Map((args.acks ?? []).map((a) => [a.key, a]));
  const checks: QaCheck[] = [];
  const headline = args.headline?.trim();
  if (!args.contentOnly) {
    checks.push(headline
      ? { id: 'headline', state: 'pass', message: 'The headline leads.' }
      : { id: 'headline', state: 'fail', message: 'Write the headline: one sentence on what the comps show.' });
  }

  const stray = uniqueItems(unmatchedNumbers(args.text, args.ledger).map((n) => ({
    key: `number:${n.text}`, text: n.text, context: n.context, note: null, ack: acks.get(`number:${n.text}`) ?? null,
  })));
  const open = stray.filter((i) => !i.ack);
  checks.push(!stray.length
    ? { id: 'numbers', state: 'pass', message: 'Every number matches the comps, the facts or what you wrote.' }
    : {
      id: 'numbers', state: 'warn', needsAck: true, items: stray,
      message: open.length
        ? `${open.length === 1 ? `${open[0]!.text} doesn’t` : `${open.length} numbers don’t`} match the comps, the facts or anything you stated: edit, or keep ${open.length === 1 ? 'it' : 'them'} and say why.`
        : 'Every number is matched or answered for.',
    });

  const points = uniqueItems(pointValueFindings(args.text).map((p) => ({
    key: `range:${p.text.toLowerCase()}`, text: p.text, context: contextOf(args.text, p.index, p.text.length), note: null, ack: null,
  })));
  checks.push(points.length
    ? { id: 'range', state: 'warn', items: points, message: `“${points[0]!.text}” reads as one value. A range, or a list price, is how the house speaks.` }
    : { id: 'range', state: 'pass', message: 'No single-value claims.' });

  const words = appraisalFindings(args.text);
  checks.push(words.length
    ? { id: 'appraisal', state: 'fail', message: `Take out “${words[0]!.match}”: this is a comparative market analysis, never an appraisal.` }
    : { id: 'appraisal', state: 'pass', message: 'No appraisal language.' });

  const fh = fairHousingFindings(args.text.split(DISCLAIMER).join(' '.repeat(DISCLAIMER.length)));
  const hard = uniqueItems(fh.filter((f) => f.level === 'hard').map((f) => ({
    key: `fair_housing:${f.term.toLowerCase()}`, text: f.term, context: contextOf(args.text, f.index, f.term.length), note: f.basis, ack: null,
  })));
  checks.push(hard.length
    ? { id: 'fair_housing', state: 'fail', items: hard, message: `Take out “${hard[0]!.text}”: fair housing (${hard[0]!.note}). Describe the home and the market, not who it suits.` }
    : { id: 'fair_housing', state: 'pass', message: 'Nothing on the fair-housing list.' });
  const near = uniqueItems(fh.filter((f) => f.level === 'near').map((f) => ({
    key: `fair_housing_near:${f.term.toLowerCase()}`, text: f.term, context: contextOf(args.text, f.index, f.term.length), note: f.basis,
    ack: acks.get(`fair_housing_near:${f.term.toLowerCase()}`) ?? null,
  })));
  if (near.length) {
    const nearOpen = near.filter((i) => !i.ack);
    checks.push({
      id: 'fair_housing_near', state: 'warn', needsAck: true, items: near,
      message: nearOpen.length
        ? `Check “${nearOpen[0]!.text}”${nearOpen.length > 1 ? ` and ${nearOpen.length - 1} more` : ''}: close to a fair-housing term. Keep it only if it’s about the property.`
        : 'The words near a fair-housing term are answered for.',
    });
  }

  if (args.contentOnly) return checks;
  checks.push(args.text.includes(DISCLAIMER)
    ? { id: 'disclaimer', state: 'pass', message: 'The disclaimer is in.' }
    : { id: 'disclaimer', state: 'fail', message: 'Put the disclaimer back: it has to go out with every email.' });
  if (args.output && args.result === 'with_estimates' && args.output.results.with_estimates.estimates_used.length) {
    const said = args.output.results.with_estimates.estimates_used.map(estimateWords).every((w) => args.text.includes(w));
    checks.push(said
      ? { id: 'estimates', state: 'pass', message: 'Your estimates are disclosed.' }
      : { id: 'estimates', state: 'fail', message: 'The email uses your estimates: say so.' });
  }
  if (args.sample) checks.push({ id: 'sample', state: 'warn', message: 'It uses sample data: not for a client.' });
  return checks;
}

/** What still stands between the draft and Copy: each fail, and each finding awaiting an answer. */
export function blockers(checks: QaCheck[]): number {
  return checks.reduce((n, c) => n + (c.state === 'fail' ? 1 : 0) + (c.needsAck ? (c.items ?? []).filter((i) => !i.ack).length : 0), 0);
}

/** Can it be copied with a hard compliance failure? Never (Dispatch 13). */
export function hardFailures(checks: QaCheck[]): QaCheck[] {
  return checks.filter((c) => c.state === 'fail');
}

/** "Ready to send", or "2 things to fix". */
export function qaStatus(checks: QaCheck[]): { ready: boolean; line: string } {
  const n = blockers(checks);
  if (n) return { ready: false, line: `${n} thing${n === 1 ? '' : 's'} to fix` };
  return { ready: true, line: checks.some((c) => c.state === 'warn') ? 'Ready, with a note' : 'Ready to send' };
}

/** The checks as the log keeps them (narratives.qa): the version, and each check with its items. */
export function qaRecord(checks: QaCheck[]) {
  return {
    version: QA_VERSION,
    ready: qaStatus(checks).ready,
    checks: checks.map((c) => ({
      id: c.id, state: c.state, message: c.message,
      ...(c.items ? { items: c.items.map((i) => ({ key: i.key, text: i.text, context: i.context, ...(i.note ? { note: i.note } : {}), ...(i.ack ? { ack: i.ack } : {}) })) } : {}),
    })),
  };
}
