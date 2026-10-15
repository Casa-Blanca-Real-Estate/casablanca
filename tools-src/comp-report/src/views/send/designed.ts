// The Designed email (Dispatch 14, item 10; the handoff's "Designed email").
// It renders the Full draft — the agent's plain text, the source of truth —
// into Casa Blanca's branded 600px email: tables and inline styles, so Gmail
// keeps it; the black header with the white wordmark (an absolute URL, so the
// recipient's mail loads it); the range in a black block; the headline and
// the body's paragraphs; the anchor comp, then the other comps, with neutral
// blocks where their photos will go; the agent's sign-off; the disclaimer.
// No separate writer run: the words are the Full draft's, read back out of
// its plain text, and every figure beside them is the engine's.
import type { ListingStatus } from '../../../engine/index.ts';
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import { addressOf, urlOf, type EmailStatus } from '../../../workspace/email.ts';
import { clientPrice, sqft } from '../../../workspace/format.ts';
import { DISCLAIMER, HEADLINE_PLACEHOLDER, SAMPLE_BANNER } from '../../../workspace/frame.ts';

// ─── Reading the Full draft back ─────────────────────────────────────────────

export interface ParsedComp {
  name: string;
  line: string;
  url: string | null;
  notes: string[];
}

/** The Full draft's plain text, read back into the parts the designed email lays out. */
export interface ParsedEmail {
  sample: boolean;
  greeting: string | null;
  headline: string | null;
  /** Prose before the comps: the estimate note, how the comps were chosen. */
  intro: string[];
  comps: ParsedComp[];
  consider: string[];
  /** The price table's lines: "$2,112 - $4.23M". */
  table: string[];
  /** Prose after the comps: the next step, and anything the agent added. */
  outro: string[];
  signOff: string | null;
  disclaimer: string | null;
}

const STATUS_HEADINGS = new Set(['SOLD', 'IN CONTRACT', 'ACTIVE', 'DIDN’T SELL', 'DIDN\'T SELL']);
const COMP_LINE = /^-\s+(.+?)\s+—\s+(.+?)(?:\s+—\s+(https?:\/\/\S+))?\s*$/;
const DISCLAIMER_START = DISCLAIMER.slice(0, 40).toLowerCase();

function isHeading(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && t.length <= 80 && /[A-Z]/.test(t) && !/[a-z]/.test(t) && !/^[-$\d[]/.test(t);
}

/**
 * Reads the email's plain text the way the template writes it (workspace/email.ts):
 * greeting, headline, paragraphs, a heading per status with a comp a line,
 * THINGS TO CONSIDER, the price table, the next step, the sign-off, the
 * disclaimer. Forgiving of the agent's edits: whatever it can't place is a
 * paragraph, so nothing they wrote is dropped.
 */
export function parseEmailText(text: string, headline?: string): ParsedEmail {
  const out: ParsedEmail = { sample: false, greeting: null, headline: null, intro: [], comps: [], consider: [], table: [], outro: [], signOff: null, disclaimer: null };
  const h = headline?.trim();
  const blocks = text.replace(/\r\n/g, '\n').split(/\n[ \t]*\n/).map((b) => b.replace(/^\n+|\s+$/g, '')).filter((b) => b.trim());
  let seenSection = false;
  const prose = (p: string) => (seenSection ? out.outro : out.intro).push(p);
  for (const block of blocks) {
    const t = block.trim();
    if (t === SAMPLE_BANNER) {
      out.sample = true;
      continue;
    }
    if (t.toLowerCase().startsWith(DISCLAIMER_START)) {
      out.disclaimer = t;
      continue;
    }
    if (!out.greeting && !out.headline && !out.intro.length && !t.includes('\n') && /^(hi|hello|dear)\b/i.test(t)) {
      out.greeting = t;
      continue;
    }
    if (!out.headline && ((h && t === h) || t === HEADLINE_PLACEHOLDER)) {
      out.headline = t;
      continue;
    }
    const lines = block.split('\n');
    if (!isHeading(lines[0]!)) {
      prose(t);
      continue;
    }
    seenSection = true;
    let section: 'comps' | 'consider' | 'table' | 'other' = 'other';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (isHeading(line)) {
        section = STATUS_HEADINGS.has(line) ? 'comps' : line === 'THINGS TO CONSIDER' ? 'consider' : line.startsWith('PRICE PER SQ FT') ? 'table' : 'other';
        if (section === 'other') out.outro.push(line.charAt(0) + line.slice(1).toLowerCase());
        continue;
      }
      if (section === 'comps') {
        const m = COMP_LINE.exec(line);
        if (m) out.comps.push({ name: m[1]!.trim(), line: m[2]!.trim(), url: m[3] ?? null, notes: [] });
        else if (out.comps.length) out.comps.at(-1)!.notes.push(line);
        else out.outro.push(line);
      } else if (section === 'consider') {
        out.consider.push(line.replace(/^-\s+/, ''));
      } else if (section === 'table') {
        out.table.push(line);
      } else {
        out.outro.push(line);
      }
    }
  }
  // Without the headline as written, the first paragraph after the greeting is it (the template's order).
  if (!out.headline && out.intro.length) out.headline = out.intro.shift()!;
  // The sign-off: the last paragraph, when it's a short line that ends no sentence (the agent's name).
  const tail = out.outro.length ? out.outro : out.intro;
  const last = tail.at(-1);
  if (last && last.length <= 60 && !/[.!?:]$/.test(last)) out.signOff = tail.pop()!;
  return out;
}

// ─── The comps, as the designed email shows them ─────────────────────────────

export interface DesignedComp {
  name: string;
  status: ListingStatus;
  /** "Sold Aug 2026 · Floor 10", "In contract · Same building". */
  sub: string;
  /** "$4.45M", "$4.25M ask". */
  price: string;
  note: string | null;
  url: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS_WORD: Record<ListingStatus, string> = { sold: 'Sold', in_contract: 'In contract', active: 'Active', off_market: 'Didn’t sell' };

/** "100 Barclay Street" and "100 Barclay St" are one building. */
export function sameStreet(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string) => s.toLowerCase().split(',')[0]!.replace(/[.#]/g, '')
    .replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave').replace(/\bplace\b/g, 'pl').replace(/\broad\b/g, 'rd')
    .replace(/\bboulevard\b/g, 'blvd').replace(/\s+/g, ' ').trim();
  return Boolean(a && b && norm(a) === norm(b));
}

/**
 * The comps the Full email lists (email.ts countedComps), in its order, as
 * the designed email shows them: the anchor (★) first, the rest after. When
 * the agent has edited comps out of the text, only the ones still in it show.
 * Each comp's note is the Full draft's own line about it, as edited.
 */
export function designedComps(
  rows: { status: EmailStatus; comp: WorkspaceComp }[],
  args: { parsed: ParsedEmail; homeStreet: string | null; sf: boolean },
): { anchor: DesignedComp | null; others: DesignedComp[] } {
  const named = new Map(args.parsed.comps.map((p) => [p.name, p]));
  const shown = args.parsed.comps.length ? rows.filter((r) => named.has(addressOf(r.comp))) : rows;
  const toDesigned = ({ status, comp }: { status: EmailStatus; comp: WorkspaceComp }): DesignedComp => {
    const f = comp.record.facts;
    const date = f.status_date?.value;
    const when = status === 'sold' && date ? ` ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}` : '';
    const parts = [`${STATUS_WORD[status]}${when}`];
    if (sameStreet(comp.record.identity.address.street, args.homeStreet)) parts.push('Same building');
    else if (f.floor) parts.push(`Floor ${f.floor.value}`);
    if (args.sf && f.area_sqft) parts.push(sqft(f.area_sqft.value));
    const price = status === 'sold' ? clientPrice(f.sale_price?.value) : `${clientPrice(f.list_price?.value)} ask`;
    const p = named.get(addressOf(comp));
    return { name: addressOf(comp), status, sub: parts.join(' · '), price, note: p?.notes.join(' ') || null, url: urlOf(comp) };
  };
  const anchorRow = shown.find((r) => r.comp.judgment?.anchor) ?? null;
  return { anchor: anchorRow ? toDesigned(anchorRow) : null, others: shown.filter((r) => r !== anchorRow).map(toDesigned) };
}

// ─── The HTML ────────────────────────────────────────────────────────────────

export interface DesignedInput {
  /** Where the wordmark is served from: location.origin. */
  origin: string;
  /** "Jordan and Sam", or "you". */
  preparedFor: string;
  /** "October 2026". */
  month: string;
  /** "100 Barclay Street #17L". */
  title: string;
  /** "3 bd · 3 ba · Floor 17". */
  sub: string;
  /** The range block's eyebrow: "What the sales support" (seller), "What 17L is worth today" (buyer). */
  eyebrow: string;
  /** "$4.22M – $4.91M"; null without a range. */
  range: string | null;
  /** "$2,112 – $2,457 a square foot", only when the home has a size. */
  perSqft: string | null;
  email: ParsedEmail;
  anchor: DesignedComp | null;
  others: DesignedComp[];
  agent: { name: string; office: string; email: string | null };
  /** "Talk it through" (seller), "Plan the offer" (buyer). */
  cta: string;
  subject: string;
}

const FONT = '\'Object Sans\', \'Helvetica Neue\', Helvetica, Arial, sans-serif';
const HATCH = 'background-color:#eeece7;background-image:repeating-linear-gradient(135deg,#e4e2dc 0 8px,#eeece7 8px 16px);';
const SWATCH: Record<ListingStatus, string> = { sold: '#0f0f0f', in_contract: '#aaa3cf', active: '#ffffff', off_market: '#c0c2b5' };
const EYEBROW = 'font-size:10px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lines = (s: string) => esc(s).replace(/\n/g, '<br>');

function swatch(status: ListingStatus, border: boolean): string {
  return `<span style="display:inline-block;width:8px;height:8px;background:${SWATCH[status]};${border || status === 'active' ? 'border:1px solid #0f0f0f;' : ''}box-sizing:border-box;vertical-align:middle;margin:0 6px 2px 0;"></span>`;
}

function name(c: DesignedComp, style: string): string {
  return c.url
    ? `<a href="${esc(c.url)}" style="${style}color:#0f0f0f;text-decoration:none;">${esc(c.name)}</a>`
    : `<span style="${style}">${esc(c.name)}</span>`;
}

const row = (inner: string, pad = '32px 32px 0') => `<tr><td style="padding:${pad};">${inner}</td></tr>`;
const para = (text: string, style = '') => `<p style="margin:0 0 14px;${style}">${lines(text)}</p>`;

/** The designed email: one table, inline styles, 600px at most. */
export function designedHtml(d: DesignedInput): string {
  const e = d.email;
  const wordmark = (h: number) => `<img src="${esc(d.origin)}/assets/brand/casa-blanca-wordmark-white.png" alt="Casa Blanca" height="${h}" style="height:${h}px;width:auto;display:block;border:0;">`;
  const out: string[] = [];
  out.push(`<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;background:#ffffff;color:#0f0f0f;font-family:${FONT};">`);
  out.push(`<tr><td bgcolor="#0f0f0f" style="background:#0f0f0f;padding:22px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`
    + `<td style="vertical-align:middle;">${wordmark(18)}</td>`
    + `<td align="right" style="vertical-align:middle;${EYEBROW}color:#aaa3cf;font-family:${FONT};">Comp report</td></tr></table></td></tr>`);
  if (e.sample) out.push(`<tr><td bgcolor="#fbf0c4" style="background:#fbf0c4;padding:10px 32px;font-size:11px;font-weight:800;">${esc(SAMPLE_BANNER)}</td></tr>`);
  out.push(`<tr><td height="240" bgcolor="#eeece7" style="height:240px;${HATCH}font-size:0;line-height:0;">&nbsp;</td></tr>`);
  out.push(row(
    `<div style="${EYEBROW}color:#888680;">Prepared for ${esc(d.preparedFor)} · ${esc(d.month)}</div>`
    + `<div style="font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1.05;margin-top:6px;">${esc(d.title)}</div>`
    + (d.sub ? `<div style="font-size:13px;color:#888680;margin-top:6px;">${esc(d.sub)}</div>` : ''),
  ));
  if (d.range) {
    out.push(row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#0f0f0f" style="background:#0f0f0f;color:#ffffff;padding:26px 28px;">`
      + `<div style="${EYEBROW}color:#aaa3cf;">${esc(d.eyebrow)}</div>`
      + `<div style="font-size:44px;font-weight:800;letter-spacing:-.04em;line-height:1;margin-top:8px;color:#ffffff;">${esc(d.range)}</div>`
      + (d.perSqft ? `<div style="font-size:13px;color:#d8d6d0;margin-top:8px;">${esc(d.perSqft)}</div>` : '')
      + '</td></tr></table>', '24px 32px 0'));
  }
  const intro = [
    e.headline ? para(e.headline, 'font-size:18px;font-weight:800;line-height:1.35;') : '',
    ...e.intro.map((p) => para(p)),
  ].join('');
  if (intro) out.push(row(`<div style="font-size:15px;line-height:1.6;">${intro}</div>`, '24px 32px 0'));
  if (d.anchor) {
    const a = d.anchor;
    out.push(row(
      `<div style="${EYEBROW}padding-bottom:12px;"><span style="color:#e8b923;font-size:13px;letter-spacing:0;">★</span>&nbsp; The closest match</div>`
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
      + `<td width="48%" height="150" bgcolor="#eeece7" style="width:48%;height:150px;${HATCH}font-size:0;line-height:0;">&nbsp;</td>`
      + '<td width="4%" style="width:4%;font-size:0;">&nbsp;</td>'
      + '<td width="48%" style="width:48%;vertical-align:top;">'
      + `<div>${name(a, 'font-size:17px;font-weight:800;')}</div>`
      + `<div style="font-size:12px;color:#888680;margin-top:6px;">${swatch(a.status, false)}${esc(a.sub)}</div>`
      + `<div style="font-size:24px;font-weight:800;letter-spacing:-.02em;margin-top:6px;">${esc(a.price)}</div>`
      + (a.note ? `<div style="font-size:13px;line-height:1.5;color:#3c3654;margin-top:6px;">${lines(a.note)}</div>` : '')
      + '</td></tr></table>',
    ));
  }
  if (d.others.length) {
    out.push(row(
      `<div style="${EYEBROW}padding-bottom:10px;">${d.anchor ? 'Other comps' : 'The comps'}</div>`
      + d.others.map((c) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #eeece7;"><tr>'
        + `<td width="72" style="width:72px;padding:12px 0;vertical-align:middle;"><div style="width:72px;height:52px;${HATCH}font-size:0;line-height:0;">&nbsp;</div></td>`
        + '<td width="14" style="width:14px;font-size:0;">&nbsp;</td>'
        + `<td style="padding:12px 0;vertical-align:middle;"><div>${name(c, 'font-size:14px;font-weight:800;')}</div>`
        + `<div style="font-size:12px;color:#888680;margin-top:3px;">${swatch(c.status, true)}${esc(c.sub)}</div></td>`
        + `<td align="right" style="padding:12px 0 12px 12px;vertical-align:middle;font-size:15px;font-weight:800;white-space:nowrap;">${esc(c.price)}</td>`
        + '</tr></table>').join(''),
    ));
  }
  const after: string[] = [];
  if (e.consider.length) {
    after.push(`<div style="${EYEBROW}padding-bottom:10px;">Things to consider</div>`);
    after.push(...e.consider.map((p) => para(p)));
  }
  if (e.table.length) {
    after.push(`<div style="${EYEBROW}padding:8px 0 10px;">Price per square foot</div>`);
    after.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">'
      + e.table.map((t) => {
        const [rate, price] = t.split(/\s+-\s+/);
        return `<tr><td style="padding:8px 0;border-top:1px solid #eeece7;font-size:13px;color:#888680;">${esc(rate ?? t)} a sq ft</td>`
          + `<td align="right" style="padding:8px 0;border-top:1px solid #eeece7;font-size:14px;font-weight:800;">${esc(price ?? '')}</td></tr>`;
      }).join('') + '</table>');
  }
  after.push(...e.outro.map((p) => para(p)));
  if (after.length) out.push(row(`<div style="font-size:15px;line-height:1.6;">${after.join('')}</div>`));
  const mail = d.agent.email ? `mailto:${encodeURIComponent(d.agent.email).replace('%40', '@')}?subject=${encodeURIComponent(d.subject)}` : null;
  out.push(`<tr><td style="padding:32px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid #0f0f0f;"><tr>`
    + `<td width="56" style="width:56px;padding:22px 16px 28px 0;"><div style="width:56px;height:56px;border-radius:50%;${HATCH}"></div></td>`
    + `<td style="padding:22px 0 28px;vertical-align:middle;"><div style="font-size:15px;font-weight:800;">${esc(e.signOff?.split('\n').at(-1)?.trim() || d.agent.name)}</div>`
    + `<div style="font-size:12px;color:#888680;margin-top:2px;">${esc(d.agent.office)}</div></td>`
    + (mail ? `<td align="right" style="padding:22px 0 28px 12px;vertical-align:middle;"><a href="${esc(mail)}" style="display:inline-block;background:#0f0f0f;color:#ffffff;text-decoration:none;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:12px 18px;white-space:nowrap;">${esc(d.cta)}</a></td>` : '')
    + '</tr></table></td></tr>');
  out.push(`<tr><td bgcolor="#0f0f0f" style="background:#0f0f0f;color:#888680;padding:22px 32px;font-size:11px;line-height:1.5;">${wordmark(13)}`
    + (e.disclaimer ? `<div style="margin-top:10px;">${lines(e.disclaimer)}</div>` : '')
    + '</td></tr>');
  out.push('</table>');
  return out.join('\n');
}
