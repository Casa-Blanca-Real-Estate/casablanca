// The Designed email (Dispatch 14, item 10; Dispatch 26): what Send leads with
// and what the agent sends. Casa Blanca's branded 600px email, in tables and
// inline styles so Gmail keeps it: the black header with the white wordmark
// (an absolute URL, so the recipient's mail loads it); the home's photo; the
// range in a black block; the overview (the headline and how the comps were
// chosen); then one box per comp, the anchor first and marked, each with its
// address large and linked, its photo, its price, $/sq ft where the type shows
// one, its status line and the paragraph written for the client on Send's
// client step (or nothing); then things to consider, the next step, the
// agent's sign-off and the disclaimer. No price table: the figures belong per
// unit (Erez), and the table stays in Full and on Findings.
//
// The words outside the boxes are the Full draft's, read back out of its plain
// text (the source of truth QA reads); every figure beside them is the
// engine's. The photos are the listings' own on screen, and at copy time the
// copies Casa keeps (server/email-photos.ts).
import type { ListingStatus } from '../../../engine/index.ts';
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import { addressOf, urlOf, type EmailStatus } from '../../../workspace/email.ts';
import { clientPrice, psf, sqft } from '../../../workspace/format.ts';
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

/** Nothing read back yet: every counted comp shows (the client step's boxes). */
export const NO_PARSED: ParsedEmail = { sample: false, greeting: null, headline: null, intro: [], comps: [], consider: [], table: [], outro: [], signOff: null, disclaimer: null };

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
  /** The report comp id: the photo copy is asked for by it. */
  id: string | null;
  name: string;
  status: ListingStatus;
  /** "Sold Aug 2026 · Floor 10", "In contract · Same building". */
  sub: string;
  /** "$4.45M", "$4.25M ask". */
  price: string;
  /** "$2,112 a sq ft", where the type shows one (a condo with the home's size). */
  perSqft: string | null;
  /** The comp's paragraph for the client (Dispatch 26), or nothing. */
  paragraph: string | null;
  url: string | null;
  /** The hero photo: the listing's own on screen, Casa's copy in what's copied. Null: the neutral block. */
  photo: string | null;
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
 * The comps the Full email lists (email.ts countedComps), grouped by status, as
 * the designed email shows them: the anchor (★) first, the rest after. When
 * the agent has edited comps out of the text, only the ones still in it show.
 * Each comp's paragraph is the one written for the client (Dispatch 26), or
 * none; its photo is `photo`'s (the hero by default), its $/sq ft `rate`'s.
 */
export function designedComps(
  rows: { status: EmailStatus; comp: WorkspaceComp }[],
  args: {
    parsed: ParsedEmail;
    homeStreet: string | null;
    sf: boolean;
    rate?: (c: WorkspaceComp) => number | null | undefined;
    photo?: (c: WorkspaceComp) => string | null | undefined;
  },
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
    const rate = args.sf ? args.rate?.(comp) ?? null : null;
    const photo = args.photo ? args.photo(comp) ?? null : comp.judgment?.photos?.[0] ?? null;
    return {
      id: comp.judgment?.reportCompId ?? null,
      name: addressOf(comp),
      status,
      sub: parts.join(' · '),
      price,
      perSqft: rate ? `${psf(rate)} a sq ft` : null,
      paragraph: comp.judgment?.clientLine?.text.trim() || null,
      url: urlOf(comp),
      photo: safeUrl(photo) ? photo : null,
    };
  };
  const anchorRow = shown.find((r) => r.comp.judgment?.anchor) ?? null;
  // The rest by status, as the handoff groups them (Sold, In contract, Active, Didn't sell); the email's order within each.
  const rank = (s: EmailStatus) => ['sold', 'in_contract', 'active', 'off_market'].indexOf(s);
  const others = shown.filter((r) => r !== anchorRow).map((r, i) => ({ r, i })).sort((a, b) => rank(a.r.status) - rank(b.r.status) || a.i - b.i);
  return { anchor: anchorRow ? toDesigned(anchorRow) : null, others: others.map(({ r }) => toDesigned(r)) };
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
  /** The home's StreetEasy page, when known: the title links there. */
  titleUrl?: string | null;
  /** The home's own photo, for the header block; without it, the neutral block. */
  homePhoto?: string | null;
}

// Email-safe: no Object Sans, which only the app embeds. A font the reader's mail
// can't load falls back unpredictably, and one suspect for Noble's italic (NW-081).
const FONT = '\'Helvetica Neue\', Helvetica, Arial, sans-serif';
const INK = '#0f0f0f';
/**
 * Every cell's own style, so nothing is left to the mail client or the
 * compose box it's pasted into: upright, regular, dark, set left (NW-080, 081).
 * A cell's own style follows it and wins where it differs.
 */
const CELL = `font-family:${FONT};font-style:normal;font-weight:normal;color:${INK};text-align:left;`;
const HATCH = 'background-color:#eeece7;background-image:repeating-linear-gradient(135deg,#e4e2dc 0 8px,#eeece7 8px 16px);';
const SWATCH: Record<ListingStatus, string> = { sold: '#0f0f0f', in_contract: '#aaa3cf', active: '#ffffff', off_market: '#c0c2b5' };
const EYEBROW = 'font-size:10px;font-weight:bold;letter-spacing:.24em;text-transform:uppercase;';

/** The one escape: everything typed or read reaches the HTML through it, in text and attributes alike. */
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A link we write: https only, else none (http only from the local dev server, so a copy there keeps its photos). */
export const safeUrl = (url: string | null | undefined): string | null =>
  (url && /^(?:https:\/\/|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/)[^\s"<>]+$/i.test(url) ? url : null);
const lines = (s: string) => esc(s).replace(/\n/g, '<br>');

function swatch(status: ListingStatus, border: boolean): string {
  return `<span style="display:inline-block;width:8px;height:8px;background:${SWATCH[status]};${border || status === 'active' ? 'border:1px solid #0f0f0f;' : ''}box-sizing:border-box;vertical-align:middle;margin:0 6px 2px 0;"></span>`;
}

/**
 * Text Gmail would otherwise autolink (an address, "Floor 17") in an anchor of
 * our own: dark, no underline, to the StreetEasy page when there is one
 * (NW-082). Without a page it's an anchor with no href, which links nowhere.
 */
function quiet(text: string, url: string | null | undefined, style: string): string {
  const href = safeUrl(url);
  return `<a${href ? ` href="${esc(href)}"` : ''} style="${style}color:${INK};text-decoration:none;">${esc(text)}</a>`;
}

const name = (c: DesignedComp, style: string) => quiet(c.name, c.url, style);

/** A box's photo: 494 × 330 inside its 1px border and 20px padding (536px within the email's 32px gutters). */
const PHOTO_W = 494;
const PHOTO_H = 330;

/**
 * One comp's box: a thin border (the anchor's heavier, with its ★ line), the
 * address large and bold on top and linked, the photo (or the neutral block),
 * the price with $/sq ft beside it, the status line, then the client's
 * paragraph, if there is one. Tables, so Gmail keeps the layout.
 */
export function compBox(c: DesignedComp, anchor: boolean, firstOther = false): string {
  const photo = safeUrl(c.photo);
  const picture = photo
    ? `<img src="${esc(photo)}" alt="${esc(c.name)}" width="${PHOTO_W}" height="${PHOTO_H}" style="display:block;width:100%;max-width:${PHOTO_W}px;height:${PHOTO_H}px;object-fit:cover;border:0;">`
    : `<div style="height:${PHOTO_H}px;${HATCH}font-size:0;line-height:0;">&nbsp;</div>`;
  return (firstOther ? `<div style="${EYEBROW}padding:8px 0 12px;">Other comps</div>` : '')
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border:${anchor ? `2px solid ${INK}` : '1px solid #d8d6d0'};margin:0 0 18px;">`
    + `<tr><td style="${CELL}padding:20px 20px 0;">`
    + (anchor ? `<div style="${EYEBROW}padding-bottom:8px;"><span style="color:#e8b923;font-size:13px;letter-spacing:0;">★</span>&nbsp; The closest match</div>` : '')
    + `<div style="font-size:22px;font-weight:bold;letter-spacing:-.02em;line-height:1.15;">${name(c, 'font-size:22px;font-weight:bold;')}</div></td></tr>`
    + `<tr><td style="${CELL}padding:14px 20px 0;font-size:0;line-height:0;">${picture}</td></tr>`
    + `<tr><td style="${CELL}padding:14px 20px 20px;">`
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
    + `<td style="${CELL}vertical-align:baseline;font-size:22px;font-weight:bold;letter-spacing:-.02em;white-space:nowrap;">${esc(c.price)}</td>`
    + (c.perSqft ? `<td align="right" style="${CELL}text-align:right;vertical-align:baseline;font-size:14px;font-weight:bold;white-space:nowrap;">${esc(c.perSqft)}</td>` : '')
    + '</tr></table>'
    + `<div style="font-size:12px;color:#888680;margin-top:6px;">${swatch(c.status, true)}${esc(c.sub)}</div>`
    + (c.paragraph ? `<div style="font-size:14px;line-height:1.55;margin-top:12px;">${lines(c.paragraph)}</div>` : '')
    + '</td></tr></table>';
}

const row = (inner: string, pad = '32px 32px 0') => `<tr><td style="${CELL}padding:${pad};">${inner}</td></tr>`;
const para = (text: string, style = '') => `<p style="margin:0 0 14px;${style}">${lines(text)}</p>`;

/**
 * The designed email: tables and inline styles, 600px at most, centred by its
 * own markup (NW-080): an outer full-width table, the email centred in it,
 * every cell set left.
 */
export function designedHtml(d: DesignedInput): string {
  const e = d.email;
  const wordmark = (h: number) => `<img src="${esc(d.origin)}/assets/brand/casa-blanca-wordmark-white.png" alt="Casa Blanca" height="${h}" style="height:${h}px;width:auto;display:block;border:0;">`;
  const out: string[] = [];
  out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td align="center" style="${CELL}text-align:center;padding:0;">`);
  out.push(`<table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse;background:#ffffff;color:${INK};font-family:${FONT};font-style:normal;">`);
  out.push(`<tr><td bgcolor="#0f0f0f" style="${CELL}background:#0f0f0f;padding:22px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`
    + `<td style="${CELL}vertical-align:middle;">${wordmark(18)}</td>`
    + `<td align="right" style="${CELL}text-align:right;vertical-align:middle;${EYEBROW}color:#aaa3cf;">Comp report</td></tr></table></td></tr>`);
  if (e.sample) out.push(`<tr><td bgcolor="#fbf0c4" style="${CELL}background:#fbf0c4;padding:10px 32px;font-size:11px;font-weight:bold;">${esc(SAMPLE_BANNER)}</td></tr>`);
  const homePhoto = safeUrl(d.homePhoto);
  out.push(homePhoto
    ? `<tr><td height="240" bgcolor="#eeece7" style="${CELL}height:240px;padding:0;font-size:0;line-height:0;"><img src="${esc(homePhoto)}" alt="${esc(d.title)}" width="600" height="240" style="display:block;width:100%;max-width:600px;height:240px;object-fit:cover;border:0;"></td></tr>`
    : `<tr><td height="240" bgcolor="#eeece7" style="${CELL}height:240px;${HATCH}font-size:0;line-height:0;">&nbsp;</td></tr>`);
  out.push(row(
    `<div style="${EYEBROW}color:#888680;">Prepared for ${esc(d.preparedFor)} · ${esc(d.month)}</div>`
    + `<div style="font-size:30px;font-weight:bold;letter-spacing:-.03em;line-height:1.05;margin-top:6px;">${quiet(d.title, d.titleUrl, 'font-size:30px;font-weight:bold;')}</div>`
    + (d.sub ? `<div style="font-size:13px;color:#888680;margin-top:6px;">${quiet(d.sub, d.titleUrl, 'font-size:13px;color:#888680;')}</div>` : ''),
  ));
  if (d.range) {
    out.push(row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#0f0f0f" style="${CELL}background:#0f0f0f;color:#ffffff;padding:26px 28px;">`
      + `<div style="${EYEBROW}color:#aaa3cf;">${esc(d.eyebrow)}</div>`
      + `<div style="font-size:44px;font-weight:bold;letter-spacing:-.04em;line-height:1;margin-top:8px;color:#ffffff;">${esc(d.range)}</div>`
      + (d.perSqft ? `<div style="font-size:13px;color:#d8d6d0;margin-top:8px;">${esc(d.perSqft)}</div>` : '')
      + '</td></tr></table>', '24px 32px 0'));
  }
  const intro = [
    e.headline ? para(e.headline, 'font-size:18px;font-weight:bold;line-height:1.35;') : '',
    ...e.intro.map((p) => para(p)),
  ].join('');
  if (intro) out.push(row(`<div style="font-size:15px;line-height:1.6;">${intro}</div>`, '24px 32px 0'));
  // One box per comp (Dispatch 26), the anchor first and marked; every box the same width, its photo the same size.
  const boxes = [d.anchor, ...d.others].filter((c): c is DesignedComp => Boolean(c));
  if (boxes.length) {
    out.push(row(
      (d.anchor ? '' : `<div style="${EYEBROW}padding-bottom:12px;">The comps</div>`)
      + boxes.map((c) => compBox(c, c === d.anchor, d.anchor !== null && c === d.others[0])).join(''),
      '28px 32px 0',
    ));
  }
  const after: string[] = [];
  if (e.consider.length) {
    after.push(`<div style="${EYEBROW}padding-bottom:10px;">Things to consider</div>`);
    after.push(...e.consider.map((p) => para(p)));
  }
  after.push(...e.outro.map((p) => para(p)));
  if (after.length) out.push(row(`<div style="font-size:15px;line-height:1.6;">${after.join('')}</div>`));
  const mail = d.agent.email ? `mailto:${encodeURIComponent(d.agent.email).replace('%40', '@')}?subject=${encodeURIComponent(d.subject)}` : null;
  out.push(`<tr><td style="${CELL}padding:32px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid #0f0f0f;"><tr>`
    + `<td width="56" style="${CELL}width:56px;padding:22px 16px 28px 0;"><div style="width:56px;height:56px;border-radius:50%;${HATCH}"></div></td>`
    + `<td style="${CELL}padding:22px 0 28px;vertical-align:middle;"><div style="font-size:15px;font-weight:bold;">${esc(e.signOff?.split('\n').at(-1)?.trim() || d.agent.name)}</div>`
    + `<div style="font-size:12px;color:#888680;margin-top:2px;">${quiet(d.agent.office, null, 'font-size:12px;color:#888680;')}</div></td>`
    + (mail ? `<td align="right" style="${CELL}text-align:right;padding:22px 0 28px 12px;vertical-align:middle;"><a href="${esc(mail)}" style="display:inline-block;background:#0f0f0f;color:#ffffff;text-decoration:none;font-size:11px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;padding:12px 18px;white-space:nowrap;">${esc(d.cta)}</a></td>` : '')
    + '</tr></table></td></tr>');
  out.push(`<tr><td bgcolor="#0f0f0f" style="${CELL}background:#0f0f0f;color:#888680;padding:22px 32px;font-size:11px;line-height:1.5;">${wordmark(13)}`
    + (e.disclaimer ? `<div style="margin-top:10px;">${lines(e.disclaimer)}</div>` : '')
    + '</td></tr>');
  out.push('</table>');
  out.push('</td></tr></table>');
  return out.join('\n');
}

// ─── Full and Short, as they copy (NW-084 a) ─────────────────────────────────

const MUTED = '#888680';
const TEXT = `font-family:${FONT};font-style:normal;font-weight:normal;color:${INK};`;
const STREETEASY_LINK = /https:\/\/(?:www\.)?streeteasy\.com\/[^\s<>"]*[^\s<>".,;:!?)]/g;

/** A StreetEasy page as a link labelled "StreetEasy", never the raw URL; anything else not https stays text. */
function streetEasy(url: string): string {
  const href = safeUrl(url);
  return href ? `<a href="${esc(href)}" style="${TEXT}color:${INK};text-decoration:underline;">StreetEasy</a>` : esc(url);
}

/** Prose: escaped, its StreetEasy URLs as labelled links, its line breaks kept. */
function prose(s: string): string {
  let out = '';
  let at = 0;
  for (const m of s.matchAll(STREETEASY_LINK)) {
    out += esc(s.slice(at, m.index)) + streetEasy(m[0]);
    at = m.index + m[0].length;
  }
  return (out + esc(s.slice(at))).replace(/\n/g, '<br>');
}

const p = (inner: string, style = '') => `<p style="${TEXT}margin:0 0 14px;font-size:15px;line-height:1.55;${style}">${inner}</p>`;
const ul = (items: string[]) => `<ul style="${TEXT}margin:0 0 14px;padding-left:22px;font-size:15px;line-height:1.55;">${items.map((li) => `<li style="${TEXT}margin:0 0 6px;">${li}</li>`).join('')}</ul>`;

/**
 * The plain text of Full or Short (the agent's, edited or not) as the HTML that
 * copies beside it: the headline bold, each heading bold, comps and points as
 * bullets with "StreetEasy" links, the disclaimer small. It reads the text the
 * way the Designed email does (parseEmailText finds the headline; the same
 * headings and comp lines), so an edit keeps its formatting. Only the copy is
 * formatted: the text, QA and the Text tab are the plain text as typed.
 */
export function emailHtml(text: string, headline?: string): string {
  const head = parseEmailText(text, headline).headline;
  const blocks = text.replace(/\r\n/g, '\n').split(/\n[ \t]*\n/).filter((b) => b.trim());
  let headDone = false;
  const out: string[] = [];
  for (const block of blocks) {
    const t = block.trim();
    if (t === SAMPLE_BANNER) {
      out.push(p(esc(t), 'font-weight:bold;'));
      continue;
    }
    if (t.toLowerCase().startsWith(DISCLAIMER_START)) {
      out.push(p(prose(t), `font-size:12px;line-height:1.5;color:${MUTED};`));
      continue;
    }
    if (!headDone && head && t === head) {
      headDone = true;
      out.push(p(prose(t), 'font-size:17px;font-weight:bold;line-height:1.35;'));
      continue;
    }
    const lines = block.split('\n');
    if (!isHeading(lines[0]!.trim())) {
      out.push(p(prose(t)));
      continue;
    }
    // A section: a heading, then its comps, points or rows.
    let items: string[] = [];
    let rows: string[] = [];
    let comps = false;
    const flush = () => {
      if (items.length) out.push(ul(items));
      if (rows.length) out.push(p(rows.join('<br>')));
      items = [];
      rows = [];
    };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (isHeading(line)) {
        flush();
        comps = STATUS_HEADINGS.has(line);
        out.push(p(esc(line), 'font-size:13px;font-weight:bold;letter-spacing:.04em;margin:22px 0 8px;'));
        continue;
      }
      const comp = comps ? COMP_LINE.exec(line) : null;
      if (comp) {
        const url = comp[3];
        items.push(`<strong style="${TEXT}font-weight:bold;">${esc(comp[1]!.trim())}</strong> — ${esc(comp[2]!.trim())}${url ? ` · ${streetEasy(url)}` : ''}`);
      } else if (comps && items.length && !line.startsWith('- ')) {
        // A note under the comp above it.
        items[items.length - 1] += `<br><span style="${TEXT}color:#3c3654;">${prose(line)}</span>`;
      } else if (line.startsWith('- ')) {
        items.push(prose(line.slice(2)));
      } else {
        if (items.length) flush();
        rows.push(prose(line));
      }
    }
    flush();
  }
  return `<div style="${TEXT}font-size:15px;line-height:1.55;">${out.join('\n')}</div>`;
}
