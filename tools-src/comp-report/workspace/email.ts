// The client email (§10.2; `02-screens.md`, Send). It's built around the
// agent's headline, in the order Frankie's email goes (sources/2026-07-29-frankie-…):
//
//   greeting · the headline · how the comps were chosen · sold, in contract,
//   active and didn't sell, each comp a link with its price and its lines ·
//   things to consider · the price table · the next step · sign-off ·
//   the approved disclaimer (D-13)
//
// The frame is the code's, whoever writes the rest: the greeting, each comp's
// link and price, the price table, the sign-off and the disclaimer. The
// writer (CR-5) drafts the sections between — how the comps were chosen, each
// comp's lines, things to consider, the next step. Without a draft, the
// agent's own lines and notes fill them, as the template did before the
// writer: it's the fallback when the writer fails (Dispatch 13).
//
// Empty sections are left out (Kara). Every figure comes from the engine's
// output or from what the agent wrote; nothing here computes a number (§4.1).
// The headline drafts cite only the engine's headline facts (§10.2). A draft
// built from sample values says so at the top (Dispatch 07).
import type { EngineOutput, HeadlineFacts, ResultKind } from '../engine/index.ts';
import type { WorkspaceComp } from './engine-input.ts';
import { againstAsk, clientPrice, countWord, estimateWords, psf, usd } from './format.ts';
import { DISCLAIMER, HEADLINE_PLACEHOLDER, SAMPLE_BANNER } from './frame.ts';
import { noteOf } from './state.ts';
import { fact, homeName, readingFromFacts } from './reading.ts';

export { DISCLAIMER, HEADLINE_PLACEHOLDER, SAMPLE_BANNER };

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
  /** The writer's sections (CR-5). Without them, the agent's own lines and notes fill the email. */
  written?: WrittenSections | null | undefined;
}

/** What the writer drafts between the frame's parts, in Frankie's order (Dispatch 13, item 3). */
export interface WrittenSections {
  /** One line on how the comps were chosen. Empty: left out. */
  chosen: string;
  /** Each comp's one to three lines, by the engine's comp id. */
  comps: { id: string; lines: string[] }[];
  /** Things to consider, a point a line. */
  consider: string[];
  nextStep: string;
}

export interface EmailDraft {
  subject: string;
  /** Plain text, for the textarea and the clipboard. */
  text: string;
  /** The same email as HTML, so the comps paste into Gmail as links. */
  html: string;
}

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'comp'; name: string; url: string | null; line: string; notes: string[] }
  | { kind: 'rows'; rows: string[] }
  | { kind: 'points'; points: string[] };

const STATUS_HEADINGS = { sold: 'Sold', in_contract: 'In contract', active: 'Active', off_market: 'Didn’t sell' } as const;
const ORDER = ['sold', 'in_contract', 'active', 'off_market'] as const;

/** "200 Chambers Street #10A". */
export function addressOf(c: WorkspaceComp): string {
  const street = c.record.identity.address.street ?? 'Unknown address';
  const unit = c.record.identity.unit.raw;
  return unit ? `${street} ${unit.startsWith('#') ? unit : `#${unit}`}` : street;
}

/** The comp's StreetEasy page, when it has one. */
export function urlOf(c: WorkspaceComp): string | null {
  const url = c.record.listing?.url ?? c.record.identity.streeteasy?.url ?? null;
  return url && /^https:\/\/(www\.)?streeteasy\.com\//.test(url) ? url : null;
}

export type EmailStatus = (typeof ORDER)[number];

/**
 * The comps the email lists — those counted in the chosen result, "didn't
 * sell" included (§6.3) — each with the frame's line: its price, $/sq ft, sale
 * against ask and days on the market. The writer is given the same list.
 */
export function countedComps(output: EngineOutput, result: ResultKind, comps: WorkspaceComp[]): { status: EmailStatus; comp: WorkspaceComp; line: string }[] {
  const outById = new Map(output.comps.map((c) => [c.id, c]));
  const rows: { status: EmailStatus; comp: WorkspaceComp; line: string }[] = [];
  for (const c of comps) {
    const status = c.record.status.listing_status ?? c.record.status.evidence_class;
    if (!status) continue;
    const out = outById.get(c.id);
    const pr = out?.per_result[result];
    if (!pr?.included) continue;
    const f = c.record.facts;
    const rate = pr?.price_per_sqft?.value ?? null;
    const perFoot = rate !== null ? ` (${psf(rate)} a sq ft)` : '';
    let line: string;
    if (status === 'sold') {
      const vsAsk = out?.sale_to_ask_percent ? `, ${againstAsk(out.sale_to_ask_percent.value)}` : '';
      line = `sold for ${usd(f.sale_price?.value)}${perFoot}${vsAsk}`;
    } else if (status === 'off_market') {
      line = `on the market for ${usd(f.list_price?.value)}${perFoot}, and never sold`;
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
  const w = input.written ?? null;
  const chosen = w ? w.chosen : input.chosen;
  const nextStep = w ? w.nextStep : input.nextStep;
  const consider = w ? w.consider.map((x) => x.trim()).filter(Boolean) : input.consider?.trim() ? [input.consider.trim()] : [];
  if (input.sample) p(SAMPLE_BANNER);
  p(`Hi ${input.clientName?.trim() || '[client name]'},`);
  p(input.headline?.trim() || HEADLINE_PLACEHOLDER);
  const r = input.output.results[input.result];
  if (input.result === 'with_estimates' && r.estimates_used.length) {
    p([...new Set(r.estimates_used.map(estimateWords))].join(' '));
  }
  if (input.length === 'text') {
    p(nextStep);
    p(input.agentName || '[your name]');
    p(DISCLAIMER);
    return out;
  }
  if (input.length === 'full') p(chosen);

  const writtenLines = new Map((w?.comps ?? []).map((c) => [c.id, c.lines.map((l) => l.trim()).filter(Boolean)]));
  const rows = countedComps(input.output, input.result, input.comps);
  for (const status of ORDER) {
    if (input.length === 'short' && status !== 'sold') continue;
    const list = rows.filter((x) => x.status === status);
    if (!list.length) continue;
    out.push({ kind: 'h', text: STATUS_HEADINGS[status] });
    for (const { comp, line } of list) {
      let notes: string[];
      if (w) notes = (writtenLines.get(comp.id) ?? []).slice(0, input.length === 'full' ? 3 : 1);
      else {
        const note = input.length === 'full' ? noteOf(comp.judgment) : null;
        notes = note ? [note] : [];
      }
      out.push({ kind: 'comp', name: addressOf(comp), url: urlOf(comp), line, notes });
    }
  }

  if (input.length === 'full' && consider.length) {
    out.push({ kind: 'h', text: 'Things to consider' });
    if (w) out.push({ kind: 'points', points: consider });
    else p(consider[0]);
  }
  // The price table, as Frankie gives it: "$880 - $638K", a line a step (§6.5).
  const table = r.price_table;
  if (input.length === 'full' && table) {
    out.push({ kind: 'h', text: `Price per sq ft for ${input.homeLine || 'the home'}` });
    out.push({ kind: 'rows', rows: table.rows.map((row) => `${psf(row.per_sqft.value)} - ${clientPrice(row.price.value)}`) });
  }
  p(nextStep);
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
    } else if (b.kind === 'rows') {
      text.push(...b.rows, '');
      html.push(`<p>${b.rows.map(escape).join('<br>')}</p>`);
    } else if (b.kind === 'points') {
      text.push(...b.points.map((x) => `- ${x.replace(/\n/g, ' ')}`), '');
      html.push(`<ul>${b.points.map((x) => `<li>${escape(x)}</li>`).join('')}</ul>`);
    } else {
      text.push(`- ${b.name} — ${b.line}${b.url ? ` — ${b.url}` : ''}`);
      for (const note of b.notes) text.push(`  ${note.replace(/\n/g, ' ')}`);
      if (bs[i + 1]?.kind !== 'comp') text.push(''); // a blank line after each status's list
      const name = b.url ? `<a href="${escape(b.url)}">${escape(b.name)}</a>` : escape(b.name);
      const notes = b.notes.map((n) => `<br><span style="margin-left:1.5em">${escape(n)}</span>`).join('');
      html.push(`<p style="margin:0 0 6px">${name} — ${escape(b.line)}${notes}</p>`);
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

/** The name of a home or comp a fact rests on, from the facts' own names: "17L", "200 Chambers Street #10A". */
function named(h: HeadlineFacts, id: string | undefined): string | null {
  const n = h.names.find((x) => x.id === id);
  if (!n) return null;
  if (id === 'subject') return homeName(n.unit, n.address);
  return [n.address, n.unit ? (n.unit.startsWith('#') ? n.unit : `#${n.unit}`) : null].filter(Boolean).join(' ') || null;
}

/**
 * Headline drafts for the agent to pick and make their own (§10.2), drawn only
 * from the result's headline facts and the names beside them — never from the
 * agent's own number (§8.4). The first is the neutral reading Findings shows.
 */
export function headlineDrafts(h: HeadlineFacts): string[] {
  const home = named(h, 'subject') ?? 'the home';
  const drafts: string[] = [];
  const reading = readingFromFacts(h, home);
  if (reading) drafts.push(reading);
  const low = fact(h, 'range.low');
  const high = fact(h, 'range.high');
  const n = fact(h, 'range.comps');
  const prices = low && high ? `about ${clientPrice(low.value)}–${clientPrice(high.value)}` : null;
  const toAsk = fact(h, 'sold.median_sale_to_ask');
  if (prices && toAsk) {
    const median = Math.round(toAsk.value * 10) / 10;
    const closing = median === 0 ? 'closing at their last ask, at the median' : `closing a median ${againstAsk(median, 'their')}`;
    drafts.push(`The closest sales put ${home} at ${prices}, ${closing}.`);
  }
  const anchorRate = fact(h, 'anchor.per_sqft');
  const anchorImplied = fact(h, 'anchor.implied');
  const anchor = named(h, anchorRate?.comp_ids[0]);
  if (anchorRate && anchorImplied && anchor) {
    drafts.push(`The closest comp, ${anchor}, sold at ${psf(anchorRate.value)} a sq ft — about ${clientPrice(anchorImplied.value)} for ${home}.`);
  }
  const ceiling = fact(h, 'off_market.lowest_per_sqft');
  if (prices && ceiling) {
    drafts.push(`The sales support ${prices} for ${home}, and a listing that didn’t sell at ${psf(ceiling.value)} a sq ft marks the ceiling.`);
  }
  // The plainest restatement of the reading, kept only while there's room.
  if (prices && n) {
    drafts.push(`Recent sales of the ${n.value === 1 ? 'most similar home' : `${countWord(n.value)} most similar homes`} support ${prices} for ${home}.`);
  }
  if (!drafts.length) {
    const median = fact(h, 'sold.median_per_sqft');
    const sold = fact(h, 'sold.count');
    // No range yet: what the sales say per foot.
    if (median && sold) drafts.push(`The ${sold.value === 1 ? 'closest sale came in at' : `${countWord(sold.value)} closest sales have a median of`} ${psf(median.value)} a sq ft.`);
  }
  return [...new Set(drafts)].slice(0, 4);
}
