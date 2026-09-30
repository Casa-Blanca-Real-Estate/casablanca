// The client email (§10.2; `02-screens.md`, Send), still a fixed template —
// the writer comes in CR-5. It's built around the agent's headline, in the
// order Frankie's email goes (sources/2026-07-29-frankie-…):
//
//   greeting · the headline · how the comps were chosen · sold, in contract,
//   active and didn't sell, each comp a link with its price and the agent's
//   notes · things to consider · (the price table, with CR-2.2) · the next
//   step · sign-off · the approved disclaimer (D-13)
//
// Empty sections are left out (Kara). Every figure comes from the engine's
// output or from what the agent wrote; nothing here computes a number (§4.1).
// A draft built from sample values says so at the top (Dispatch 07).
import type { EngineOutput, ResultKind } from '../engine/index.ts';
import type { WorkspaceComp } from './engine-input.ts';
import { againstAsk, clientPrice, countWord, estimateWords, psf, usd } from './format.ts';

export const SAMPLE_BANNER = '[SAMPLE DATA — this draft uses sample values. Not for clients.]';

/** Approved 2026-09-29 (D-13, design §14). It carries the StreetEasy attribution. */
export const DISCLAIMER =
  'This comparative market analysis is an estimate of market value prepared by a licensed real estate agent for informational purposes. ' +
  'It is not an appraisal. Data provided by StreetEasy and other sources, which may be incomplete or subject to change.';

export const HEADLINE_PLACEHOLDER = '[Your headline: one sentence on what the comps show]';

export type EmailLength = 'full' | 'short' | 'text';

export interface EmailInput {
  /** "100 Barclay Street #17L". */
  homeLine: string;
  audience: 'buyer' | 'seller' | null;
  output: EngineOutput;
  result: ResultKind;
  comps: WorkspaceComp[];
  agentName: string;
  clientName?: string | undefined;
  /** The agent's one sentence (D-21). Missing, the draft holds a placeholder and can't be copied. */
  headline?: string | undefined;
  /** How the comps were chosen: "I focused on lower floors and homes close in size…" */
  chosen?: string | undefined;
  /** Things to consider: the agent's points, buildings that trade higher or lower. */
  consider?: string | undefined;
  /** The next step: the offer advice for a buyer, the pricing advice for a seller. */
  nextStep?: string | undefined;
  length: EmailLength;
  sample: boolean;
}

export interface EmailDraft {
  subject: string;
  /** Plain text, for the textarea and the clipboard. */
  text: string;
  /** The same email as HTML, so the comps paste into Gmail as links. */
  html: string;
}

type Block = { kind: 'p'; text: string } | { kind: 'h'; text: string } | { kind: 'comp'; name: string; url: string | null; line: string; note: string | null };

const STATUS_HEADINGS = { sold: 'Sold', in_contract: 'In contract', active: 'Active', off_market: 'Didn’t sell' } as const;
const ORDER = ['sold', 'in_contract', 'active', 'off_market'] as const;

function addressOf(c: WorkspaceComp): string {
  const street = c.record.identity.address.street ?? 'Unknown address';
  const unit = c.record.identity.unit.raw;
  return unit ? `${street} ${unit.startsWith('#') ? unit : `#${unit}`}` : street;
}

function urlOf(c: WorkspaceComp): string | null {
  const url = c.record.listing?.url ?? c.record.identity.streeteasy?.url ?? null;
  return url && /^https:\/\/(www\.)?streeteasy\.com\//.test(url) ? url : null;
}

/** The comps the email lists: those counted in the chosen result, and primary "didn't sell" listings. */
function counted(input: EmailInput): { status: (typeof ORDER)[number]; comp: WorkspaceComp; line: string }[] {
  const outById = new Map(input.output.comps.map((c) => [c.id, c]));
  const rows: { status: (typeof ORDER)[number]; comp: WorkspaceComp; line: string }[] = [];
  for (const c of input.comps) {
    const status = c.record.status.listing_status ?? c.record.status.evidence_class;
    if (!status) continue;
    const out = outById.get(c.id);
    const pr = out?.per_result[input.result];
    const inNumbers = Boolean(pr?.included);
    const didntSell = status === 'off_market' && c.judgment?.tier === 'primary';
    if (!inNumbers && !didntSell) continue;
    const f = c.record.facts;
    const rate = pr?.price_per_sqft?.value ?? null;
    const perFoot = rate !== null ? ` (${psf(rate)} a sq ft)` : '';
    let line: string;
    if (status === 'sold') {
      const vsAsk = out?.sale_to_ask_percent ? `, ${againstAsk(out.sale_to_ask_percent.value)}` : '';
      line = `sold for ${usd(f.sale_price?.value)}${perFoot}${vsAsk}`;
    } else if (status === 'off_market') {
      line = `on the market for ${usd(f.list_price?.value)}, and never sold`;
    } else {
      line = `${status === 'in_contract' ? 'last asking' : 'asking'} ${usd(f.list_price?.value)}${perFoot}`;
    }
    const dom = f.days_on_market?.value;
    if (dom !== undefined && status !== 'off_market') line += ` · ${dom} days on the market`;
    rows.push({ status, comp: c, line });
  }
  return rows;
}

function blocks(input: EmailInput): Block[] {
  const out: Block[] = [];
  const p = (text: string | undefined) => {
    if (text && text.trim()) out.push({ kind: 'p', text: text.trim() });
  };
  if (input.sample) p(SAMPLE_BANNER);
  p(`Hi ${input.clientName?.trim() || '[client name]'},`);
  p(input.headline?.trim() || HEADLINE_PLACEHOLDER);
  const r = input.output.results[input.result];
  if (input.result === 'with_estimates' && r.estimates_used.length) {
    p([...new Set(r.estimates_used.map(estimateWords))].join(' '));
  }
  if (input.length === 'text') {
    p(input.nextStep);
    p(input.agentName || '[your name]');
    p(DISCLAIMER);
    return out;
  }
  if (input.length === 'full') p(input.chosen);

  const rows = counted(input);
  for (const status of ORDER) {
    if (input.length === 'short' && status !== 'sold') continue;
    const list = rows.filter((x) => x.status === status);
    if (!list.length) continue;
    out.push({ kind: 'h', text: STATUS_HEADINGS[status] });
    for (const { comp, line } of list) {
      const note = input.length === 'full' ? comp.judgment?.reasons.at(-1)?.reason ?? null : null;
      out.push({ kind: 'comp', name: addressOf(comp), url: urlOf(comp), line, note: note && note.trim() ? note.trim() : null });
    }
  }

  if (input.length === 'full' && input.consider?.trim()) {
    out.push({ kind: 'h', text: 'Things to consider' });
    p(input.consider);
  }
  p(input.nextStep);
  p(input.agentName || '[your name]');
  p(DISCLAIMER);
  return out;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildEmail(input: EmailInput): EmailDraft {
  const bs = blocks(input);
  const text: string[] = [];
  const html: string[] = [];
  bs.forEach((b, i) => {
    if (b.kind === 'p') {
      text.push(b.text, '');
      html.push(`<p>${escape(b.text).replace(/\n/g, '<br>')}</p>`);
    } else if (b.kind === 'h') {
      text.push(b.text.toUpperCase());
      html.push(`<p><strong>${escape(b.text)}</strong></p>`);
    } else {
      text.push(`- ${b.name} — ${b.line}${b.url ? ` — ${b.url}` : ''}`);
      if (b.note) text.push(`  ${b.note.replace(/\n/g, ' ')}`);
      if (bs[i + 1]?.kind !== 'comp') text.push(''); // a blank line after each status's list
      const name = b.url ? `<a href="${escape(b.url)}">${escape(b.name)}</a>` : escape(b.name);
      html.push(`<p style="margin:0 0 6px">${name} — ${escape(b.line)}${b.note ? `<br><span style="margin-left:1.5em">${escape(b.note)}</span>` : ''}</p>`);
    }
  });
  const subject = `${input.sample ? '[SAMPLE] ' : ''}${input.homeLine || 'The home'}: what the comps say`;
  return { subject, text: text.join('\n').trimEnd(), html: html.join('\n') };
}

/** Plain text the agent edited, as HTML for the clipboard: paragraphs, and StreetEasy links made links. */
export function htmlFromText(text: string): string {
  return text.split(/\n{2,}/).map((para) => {
    const body = escape(para).replace(/https:\/\/(www\.)?streeteasy\.com\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`).replace(/\n/g, '<br>');
    return `<p>${body}</p>`;
  }).join('\n');
}

// ─── QA (§9) ─────────────────────────────────────────────────────────────────

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

export interface QaCheck {
  id: 'headline' | 'appraisal' | 'disclaimer' | 'estimates' | 'sample';
  state: 'pass' | 'fail' | 'warn';
  message: string;
}

/** The checks before an email goes out, and whether it can be copied: every fail blocks. */
export function emailChecks(args: { text: string; headline: string | undefined; result: ResultKind; output: EngineOutput; sample: boolean }): QaCheck[] {
  const checks: QaCheck[] = [];
  checks.push(args.headline?.trim()
    ? { id: 'headline', state: 'pass', message: 'The headline leads.' }
    : { id: 'headline', state: 'fail', message: 'Write the headline: one sentence on what the comps show.' });
  const words = appraisalFindings(args.text);
  checks.push(words.length
    ? { id: 'appraisal', state: 'fail', message: `Take out “${words[0]!.match}”: this is a comparative market analysis, never an appraisal.` }
    : { id: 'appraisal', state: 'pass', message: 'No appraisal language.' });
  checks.push(args.text.includes(DISCLAIMER)
    ? { id: 'disclaimer', state: 'pass', message: 'The disclaimer is in.' }
    : { id: 'disclaimer', state: 'fail', message: 'Put the disclaimer back: it has to go out with every email.' });
  if (args.result === 'with_estimates' && args.output.results.with_estimates.estimates_used.length) {
    const said = args.output.results.with_estimates.estimates_used.map(estimateWords).every((w) => args.text.includes(w));
    checks.push(said
      ? { id: 'estimates', state: 'pass', message: 'Your estimates are disclosed.' }
      : { id: 'estimates', state: 'fail', message: 'The email uses your estimates: say so.' });
  }
  if (args.sample) checks.push({ id: 'sample', state: 'warn', message: 'It uses sample data: not for a client.' });
  return checks;
}

/** "Ready to send", or "2 things to fix". */
export function qaStatus(checks: QaCheck[]): { ready: boolean; line: string } {
  const fails = checks.filter((c) => c.state === 'fail').length;
  if (fails) return { ready: false, line: `${fails} thing${fails === 1 ? '' : 's'} to fix` };
  return { ready: true, line: checks.some((c) => c.state === 'warn') ? 'Ready, with a note' : 'Ready to send' };
}

/** Headline drafts from the engine's figures only (the assistant's, from headline_facts, come with CR-2.2). */
export function headlineDrafts(output: EngineOutput, result: ResultKind, homeName: string, reading: string): string[] {
  const r = output.results[result];
  if (!r.range) return [];
  const drafts = [reading];
  const n = r.range.comp_ids.length;
  drafts.push(`Recent sales of the ${n === 1 ? 'most similar home' : `${countWord(n)} most similar homes`} support about ${clientPrice(r.range.low.value)}–${clientPrice(r.range.high.value)} for ${homeName}.`);
  if (r.sale_to_ask) {
    const median = Math.round(r.sale_to_ask.median.value * 10) / 10;
    const closing = median === 0 ? 'closing at their last ask, at the median' : `closing a median ${againstAsk(median, 'their')}`;
    drafts.push(`The closest sales put ${homeName} at about ${clientPrice(r.range.low.value)}–${clientPrice(r.range.high.value)}, ${closing}.`);
  }
  return [...new Set(drafts)];
}
