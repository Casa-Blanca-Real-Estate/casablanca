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

/**
 * The headline's paragraph: the headline as written, or a lead-in joined to the range ("…put it at:" reads back
 * from "…put it at $4.23M – $4.92M.", workspace/email.ts withRange).
 */
function isHeadline(paragraph: string, headline: string): boolean {
  const h = headline.trim();
  if (paragraph === h) return true;
  if (!h.endsWith(':')) return false;
  const core = h.slice(0, -1).trimEnd();
  return paragraph === `${core}.` || (paragraph.startsWith(`${core} `) && !paragraph.slice(core.length).includes('\n'));
}

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
export function parseEmailText(text: string, headline?: string, signer?: string): ParsedEmail {
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
    if (!out.headline && ((h && isHeadline(t, h)) || t === HEADLINE_PLACEHOLDER || isHeadline(t, HEADLINE_PLACEHOLDER))) {
      // A lead-in reads back as written, colon and all: the range follows it on Designed.
      out.headline = h && isHeadline(t, h) ? h : t;
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
  // The sign-off: the last paragraph, when it's a short line that ends no sentence (the agent's name),
  // or when it is the signer's name, which may end in a period ("Kimani C.", "Sam Valk Jr.").
  const tail = out.outro.length ? out.outro : out.intro;
  const last = tail.at(-1);
  const isSigner = Boolean(last && signer?.trim() && last.split('\n').at(-1)?.trim() === signer.trim());
  if (last && last.length <= 60 && (isSigner || !/[.!?:]$/.test(last))) out.signOff = tail.pop()!;
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
  /** "$2,112" (shown as "$2,112 / SF"), where the type shows one (a condo with the home's size). */
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
      perSqft: rate ? psf(rate) : null,
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
  /** "Nov 2026". */
  month: string;
  /** "100 Barclay Street #17L". */
  title: string;
  /** "3 bd, 3 ba · 2,000 SF". */
  sub: string;
  /** "$4.23M – $4.92M"; null without a range. */
  range: string | null;
  /** "($2,112 – $2,457 / SF)", only when the home has a size (never on a co-op). */
  perSqft: string | null;
  email: ParsedEmail;
  anchor: DesignedComp | null;
  others: DesignedComp[];
  /** The signature: the name, title, email, phone and headshot from Casa's roster, when it knows the agent (server/agent-card.ts). */
  agent: { name: string; title?: string | null; office: string; email: string | null; phone?: string | null; photo?: string | null };
  /** "Talk it through" (seller), "Plan the offer" (buyer). */
  cta: string;
  subject: string;
  /** The home's StreetEasy page, when known: the title links there. */
  titleUrl?: string | null;
  /** The home's own photo, for the hero; without it, the hero is the text alone, dark on white. */
  homePhoto?: string | null;
  /**
   * On Send's preview only (never in what's copied): each of the agent's words
   * carries `data-edit`, so Send can make it editable in place (NW-079 b).
   */
  editable?: boolean;
}

// Email-safe: no Object Sans, which only the app embeds (the design pass's decision 2, 2026-11-06: Helvetica Bold
// stands in where the canvas shows Object Sans Heavy). A font the reader's mail can't load falls back unpredictably.
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
/** The section headers: one style for all four (the design pass). */
const HEADER = `font-size:10px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:${INK};`;
const EYEBROW = 'font-size:10px;font-weight:bold;letter-spacing:.24em;text-transform:uppercase;';
const MUTED = '#888680';
/** The tight gradients under text on a photo: barely taller than the text (the design pass, item 6). */
const FADE_DOWN = 'background-color:rgba(15,15,15,.55);background-image:linear-gradient(180deg,rgba(15,15,15,.88) 0%,rgba(15,15,15,.7) 50%,rgba(15,15,15,0) 100%);';
const FADE_UP = 'background-color:rgba(15,15,15,.55);background-image:linear-gradient(0deg,rgba(15,15,15,.88) 0%,rgba(15,15,15,.7) 50%,rgba(15,15,15,0) 100%);';
const ON_PHOTO = 'color:#ffffff;';

/** The one escape: everything typed or read reaches the HTML through it, in text and attributes alike. */
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A link we write: https only, else none (http only from the local dev server, so a copy there keeps its photos). */
export const safeUrl = (url: string | null | undefined): string | null =>
  (url && /^(?:https:\/\/|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/)[^\s"<>]+$/i.test(url) ? url : null);
const lines = (s: string) => esc(s).replace(/\n/g, '<br>');

function swatch(status: ListingStatus, size = 8): string {
  return `<span style="display:inline-block;width:${size}px;height:${size}px;background:${SWATCH[status]};${status === 'active' || status === 'off_market' || size < 8 ? `border:1px solid ${INK};` : ''}box-sizing:border-box;vertical-align:middle;margin:0 6px 2px 0;"></span>`;
}

/**
 * Text Gmail would otherwise autolink (an address, "Floor 17") in an anchor of
 * our own: no underline, to the StreetEasy page when there is one (NW-082).
 * Without a page it's an anchor with no href, which links nowhere.
 */
function quiet(text: string, url: string | null | undefined, style: string, color = INK): string {
  const href = safeUrl(url);
  return `<a${href ? ` href="${esc(href)}"` : ''} style="${style}color:${color};text-decoration:none;">${esc(text)}</a>`;
}

/** A phone as the agent typed it, linked to call when it's a US number (10 digits, or 11 with the 1). */
export function phoneLink(phone: string, style: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const href = digits.length === 10 ? `tel:+1${digits}` : null;
  return `<a${href ? ` href="${href}"` : ''} style="${style}color:${INK};text-decoration:none;">${esc(phone)}</a>`;
}

/** What Send's preview makes editable: `data-edit` on the agent's words, only when asked. */
type EditKind = 'greeting' | 'headline' | 'para' | 'comp' | 'closing';
const editAttr = (on: boolean | undefined, kind: EditKind, extra = '') => (on ? ` data-edit="${kind}"${extra}` : '');

/**
 * A photo with text on it (rule 7 relaxed for it, the design pass's decision 1): the photo is the cell's
 * background, and the cell carries the ink `bgcolor`, so a stripped or blocked photo leaves white text on black.
 * `top` and `bottom` sit on tight gradients at the photo's top and foot.
 */
function onPhoto(photo: string | null, h: number, top: { html: string; h: number; pad: string }, bottom: { html: string; h: number; pad: string }): string {
  const bg = photo ? ` background="${esc(photo)}"` : '';
  const bgStyle = photo ? `background-image:url('${esc(photo)}');background-size:cover;background-position:center;background-repeat:no-repeat;` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr>`
    + `<td${bg} bgcolor="#0f0f0f" height="${h}" valign="top" style="${CELL}background-color:#0f0f0f;${bgStyle}height:${h}px;padding:0;vertical-align:top;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">`
    + `<tr><td height="${top.h}" valign="top" style="${CELL}${FADE_DOWN}${ON_PHOTO}height:${top.h}px;padding:${top.pad};vertical-align:top;">${top.html}</td></tr>`
    + `<tr><td height="${h - top.h - bottom.h}" style="${CELL}height:${h - top.h - bottom.h}px;font-size:0;line-height:0;">&nbsp;</td></tr>`
    + `<tr><td height="${bottom.h}" valign="bottom" style="${CELL}${FADE_UP}${ON_PHOTO}height:${bottom.h}px;padding:${bottom.pad};vertical-align:bottom;">${bottom.html}</td></tr>`
    + '</table></td></tr></table>';
}

/** The price at the left and "$2,112 / SF" at the right, on one line, white on the photo. */
function priceLine(c: DesignedComp, priceSize: number, sfSize: number): string {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
    + `<td style="${CELL}${ON_PHOTO}vertical-align:baseline;font-size:${priceSize}px;font-weight:bold;letter-spacing:-.02em;line-height:1.1;white-space:nowrap;">${esc(c.price)}</td>`
    + (c.perSqft ? `<td align="right" style="${CELL}${ON_PHOTO}text-align:right;vertical-align:baseline;font-size:${sfSize}px;font-weight:bold;white-space:nowrap;">${esc(c.perSqft)}<span style="font-weight:normal;">&nbsp;/ SF</span></td>` : '')
    + '</tr></table>';
}

const statusLine = (c: DesignedComp, size: number, pad: string) =>
  `<div style="font-size:${size}px;color:#6f6d68;padding:${pad};">${swatch(c.status)}${esc(c.sub)}</div>`;

const compPara = (c: DesignedComp, size: number, pad: string, editable?: boolean) =>
  (c.paragraph || editable
    ? `<div${editAttr(editable, 'comp', c.id ? ` data-comp="${esc(c.id)}"` : '')} style="font-size:${size}px;line-height:1.55;padding:${pad};">${c.paragraph ? lines(c.paragraph) : ''}</div>`
    : '');

/**
 * One comp's card, built from one pattern for the closest match and the sales nearby (the design pass, items
 * 6 and 7): the address over the photo's top, the price and $/SF over its foot, each on a tight gradient; under
 * the photo, the status line and the client's paragraph. The closest match is full width with a 2px ink border,
 * "THE CLOSEST MATCH" and the ★ above its photo; a nearby card is half size.
 */
export function compCard(c: DesignedComp, anchor: boolean, editable?: boolean): string {
  const photo = safeUrl(c.photo);
  const s = anchor
    ? { photoH: 330, addr: 22, price: 26, sf: 15, fade: 64, side: 18, status: 12, para: 14, border: `2px solid ${INK}` }
    : { photoH: 190, addr: 15, price: 18, sf: 12, fade: 46, side: 12, status: 11, para: 13, border: `1px solid ${INK}` };
  const address = `<div style="font-size:${s.addr}px;font-weight:bold;letter-spacing:-.02em;line-height:1.15;">${quiet(c.name, c.url, `font-size:${s.addr}px;font-weight:bold;`, '#ffffff')}</div>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;border:${s.border};">`
    + (anchor ? `<tr><td style="${CELL}padding:12px ${s.side}px 10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`
      + `<td style="${CELL}${HEADER}vertical-align:middle;">The closest match</td>`
      + `<td align="right" style="${CELL}text-align:right;vertical-align:middle;color:#e8b923;font-size:28px;line-height:1;">★</td>`
      + '</tr></table></td></tr>' : '')
    + `<tr><td style="${CELL}padding:0;">${onPhoto(photo, s.photoH,
      { html: address, h: s.fade, pad: `${anchor ? 14 : 12}px ${s.side}px 0` },
      { html: priceLine(c, s.price, s.sf), h: s.fade, pad: `0 ${s.side}px ${anchor ? 16 : 10}px` })}</td></tr>`
    + `<tr><td style="${CELL}padding:0 0 ${c.paragraph || editable ? 0 : anchor ? 16 : 16}px;">`
    + statusLine(c, s.status, `${anchor ? 12 : 14}px ${s.side}px 0`)
    + compPara(c, s.para, `${anchor ? 8 : 10}px ${s.side}px 16px`, editable)
    + '</td></tr></table>';
}

/** The old name: one comp's box is its card now. */
export const compBox = (c: DesignedComp, anchor: boolean) => compCard(c, anchor);

/**
 * A listing on the market (the design pass, item 8): a 137px square photo at the left; to its right the address
 * with the ask at the right, the status line, then the agent's note from the photo's middle down (200
 * characters at most, enforced where it's written: mail clients can't clamp lines).
 */
export function marketRow(c: DesignedComp, first: boolean, editable?: boolean): string {
  const photo = safeUrl(c.photo);
  const picture = photo
    ? `<img src="${esc(photo)}" alt="${esc(c.name)}" width="137" height="137" style="display:block;width:137px;height:137px;object-fit:cover;border:0;">`
    : `<div style="width:137px;height:137px;${HATCH}font-size:0;line-height:0;">&nbsp;</div>`;
  const ask = c.price.replace(/\s*ask$/, '');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;${first ? '' : ''}border-top:1px solid #dddbd5;"><tr>`
    + `<td width="137" valign="top" style="${CELL}width:137px;padding:14px 0;vertical-align:top;font-size:0;line-height:0;">${picture}</td>`
    + `<td valign="top" style="${CELL}padding:14px 0 14px 14px;vertical-align:top;">`
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
    + `<tr><td height="60" valign="top" style="${CELL}height:60px;vertical-align:top;">`
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
    + `<td style="${CELL}vertical-align:baseline;font-size:15px;font-weight:bold;line-height:1.2;">${quiet(c.name, c.url, 'font-size:15px;font-weight:bold;')}</td>`
    + `<td align="right" style="${CELL}text-align:right;vertical-align:baseline;font-size:15px;font-weight:bold;white-space:nowrap;padding-left:10px;">${esc(ask)} <span style="font-size:12px;font-weight:normal;color:#555550;">ask</span></td>`
    + '</tr></table>'
    + `<div style="font-size:11px;color:#555550;padding-top:4px;">${swatch(c.status, 7)}${esc(c.sub)}</div>`
    + '</td></tr>'
    + `<tr><td valign="top" style="${CELL}vertical-align:top;">${c.paragraph || editable ? `<div${editAttr(editable, 'comp', c.id ? ` data-comp="${esc(c.id)}" data-max="200"` : '')} style="font-size:13px;line-height:1.45;">${c.paragraph ? lines(c.paragraph) : ''}</div>` : ''}</td></tr>`
    + '</table></td></tr></table>';
}

const row = (inner: string, pad = '32px 32px 0') => `<tr><td style="${CELL}padding:${pad};">${inner}</td></tr>`;
const para = (text: string, style = '', attr = '') => `<p${attr} style="margin:0 0 10px;${style}">${lines(text)}</p>`;

/**
 * The designed email (the design pass's restyle, 2026-11-06): tables and inline
 * styles, 600px at most, centred by its own markup (NW-080). Top to bottom: the
 * black header; the hero, the home's photo with the address on it; the greeting
 * and the lead-in; the range on white; the agent's paragraph; the closest match;
 * the sales nearby, two up; the listings on the market, a row each; things to
 * consider; the sign-off; the signature; the black footer with the office.
 */
export function designedHtml(d: DesignedInput): string {
  const e = d.email;
  const ed = d.editable;
  const wordmark = (h: number, center = false) => `<img src="${esc(d.origin)}/assets/brand/casa-blanca-wordmark-white.png" alt="Casa Blanca" height="${h}" style="height:${h}px;width:auto;display:block;border:0;${center ? 'margin:0 auto;' : ''}">`;
  const out: string[] = [];
  out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td align="center" style="${CELL}text-align:center;padding:0;">`);
  out.push(`<table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse;background:#ffffff;color:${INK};font-family:${FONT};font-style:normal;">`);
  out.push(`<tr><td bgcolor="#0f0f0f" style="${CELL}background:#0f0f0f;padding:22px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`
    + `<td style="${CELL}vertical-align:middle;">${wordmark(18)}</td>`
    + `<td align="right" style="${CELL}text-align:right;vertical-align:middle;${EYEBROW}color:#aaa3cf;">Comp report</td></tr></table></td></tr>`);
  if (e.sample) out.push(`<tr><td bgcolor="#fbf0c4" style="${CELL}background:#fbf0c4;padding:10px 32px;font-size:11px;font-weight:bold;">${esc(SAMPLE_BANNER)}</td></tr>`);

  // The hero: the text on the photo (decided), or, without a photo, the same text dark on white.
  const homePhoto = safeUrl(d.homePhoto);
  const prepared = `Prepared for ${d.preparedFor} · ${d.month}`;
  if (homePhoto) {
    const text = `<div style="font-size:10px;font-weight:500;letter-spacing:.2em;text-transform:uppercase;color:#ffffff;">${esc(prepared)}</div>`
      + `<div style="font-size:36px;font-weight:bold;letter-spacing:-.03em;line-height:1.05;margin-top:8px;">${quiet(d.title, d.titleUrl, 'font-size:36px;font-weight:bold;', '#ffffff')}</div>`
      + (d.sub ? `<div style="font-size:13px;color:#d8d6d0;margin-top:8px;">${quiet(d.sub, d.titleUrl, 'font-size:13px;', '#d8d6d0')}</div>` : '');
    out.push(`<tr><td background="${esc(homePhoto)}" bgcolor="#0f0f0f" height="340" valign="bottom" style="${CELL}background-color:#0f0f0f;background-image:url('${esc(homePhoto)}');background-size:cover;background-position:center;background-repeat:no-repeat;height:340px;padding:0;vertical-align:bottom;">`
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">'
      + `<tr><td height="110" style="${CELL}height:110px;font-size:0;line-height:0;">&nbsp;</td></tr>`
      + `<tr><td height="230" valign="bottom" style="${CELL}${ON_PHOTO}background-color:rgba(15,15,15,.5);background-image:linear-gradient(180deg,rgba(15,15,15,0) 0%,rgba(15,15,15,.55) 40%,rgba(15,15,15,.9) 100%);height:230px;padding:0 32px 28px;vertical-align:bottom;">${text}</td></tr>`
      + '</table></td></tr>');
  } else {
    out.push(row(
      `<div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#6f6d68;">${esc(prepared)}</div>`
      + `<div style="font-size:32px;font-weight:bold;letter-spacing:-.03em;line-height:1.05;margin-top:8px;">${quiet(d.title, d.titleUrl, 'font-size:32px;font-weight:bold;')}</div>`
      + (d.sub ? `<div style="font-size:13px;color:#555550;margin-top:8px;">${quiet(d.sub, d.titleUrl, 'font-size:13px;', '#555550')}</div>` : ''),
    ));
  }

  // The greeting and the lead-in, then the range on white with $/SF at the right of the same line.
  const lead = [
    e.greeting ? para(e.greeting, 'margin:0 0 14px;', editAttr(ed, 'greeting')) : '',
    e.headline ? para(e.headline, 'margin:0;', editAttr(ed, 'headline')) : '',
  ].join('');
  if (lead) out.push(row(`<div style="font-size:14px;line-height:1.4;">${lead}</div>`, '36px 32px 0'));
  if (d.range) {
    out.push(row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
      + `<td style="${CELL}vertical-align:baseline;font-size:44px;font-weight:bold;letter-spacing:-.04em;line-height:1;white-space:nowrap;">${esc(d.range)}</td>`
      + (d.perSqft ? `<td align="right" style="${CELL}text-align:right;vertical-align:baseline;font-size:13px;color:#555550;white-space:nowrap;padding-left:12px;">${esc(d.perSqft)}</td>` : '')
      + '</tr></table>', '12px 32px 0'));
  }
  if (e.intro.length) out.push(row(`<div style="font-size:14px;line-height:1.55;">${e.intro.map((p) => para(p, '', editAttr(ed, 'para'))).join('')}</div>`, '28px 32px 0'));

  // The closest match, then the sales nearby two up, then the listings a row each.
  if (d.anchor) out.push(row(compCard(d.anchor, true, ed), '28px 32px 0'));
  const nearby = d.others.filter((c) => c.status === 'sold');
  const market = d.others.filter((c) => c.status !== 'sold');
  if (nearby.length) {
    const pairs: string[] = [];
    for (let i = 0; i < nearby.length; i += 2) {
      const [a, b] = [nearby[i]!, nearby[i + 1]];
      pairs.push(`<tr><td width="260" valign="top" style="${CELL}width:260px;vertical-align:top;padding:0 0 16px;">${compCard(a, false, ed)}</td>`
        + `<td width="16" style="${CELL}width:16px;font-size:0;line-height:0;">&nbsp;</td>`
        + `<td width="260" valign="top" style="${CELL}width:260px;vertical-align:top;padding:0 0 16px;">${b ? compCard(b, false, ed) : '&nbsp;'}</td></tr>`);
    }
    out.push(row(`<div style="${HEADER}padding-bottom:14px;">${d.anchor ? 'Also sold nearby' : 'Sold nearby'}</div>`
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;">${pairs.join('')}</table>`, '36px 32px 0'));
  }
  if (market.length) {
    out.push(row(`<div style="${HEADER}padding-bottom:14px;">On the market now · asking, not sold</div>`
      + market.map((c, i) => marketRow(c, i === 0, ed)).join(''), `${nearby.length ? 20 : 36}px 32px 0`));
  }

  // Things to consider, the agent's other paragraphs, then the sign-off.
  const after: string[] = [];
  if (e.consider.length) {
    after.push(`<div style="${HEADER}padding-bottom:10px;">Things to consider</div>`);
    after.push(...e.consider.map((p) => para(p, '', editAttr(ed, 'para'))));
  }
  after.push(...e.outro.map((p) => para(p, '', editAttr(ed, 'para'))));
  if (after.length) out.push(row(`<div style="font-size:14px;line-height:1.55;">${after.join('')}</div>`));
  const closing = e.signOff ?? `Best,\n${d.agent.name.split(/\s+/)[0] || '[your name]'}`;
  out.push(row(`<div style="font-size:14px;line-height:1.55;">${para(closing, 'margin:0;', editAttr(ed, 'closing'))}</div>`, '24px 32px 0'));

  // The signature: a square headshot, then the name, the company, the title, the email and the phone, all in ink.
  const name = d.agent.name || '[your name]';
  const phone = d.agent.phone?.trim() || null;
  const title = d.agent.title?.trim() || null;
  // The headshot is Casa's copy, served from this site: the origin makes it absolute for the client's mail.
  const headshot = d.agent.photo ? safeUrl(d.agent.photo.startsWith('/') ? `${d.origin}${d.agent.photo}` : d.agent.photo) : null;
  const mail = d.agent.email ? `mailto:${encodeURIComponent(d.agent.email).replace('%40', '@')}?subject=${encodeURIComponent(d.subject)}` : null;
  const small = 'font-size:12px;line-height:1.5;';
  out.push(`<tr><td style="${CELL}padding:32px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid #0f0f0f;"><tr>`
    + `<td width="92" valign="middle" style="${CELL}width:92px;padding:22px 16px 32px 0;vertical-align:middle;">${headshot
      ? `<img src="${esc(headshot)}" alt="${esc(name)}" width="92" height="92" style="display:block;width:92px;height:92px;object-fit:cover;border:0;">`
      : `<div style="width:92px;height:92px;${HATCH}"></div>`}</td>`
    + `<td valign="middle" style="${CELL}padding:22px 0 32px;vertical-align:middle;">`
    + `<div style="font-size:13px;font-weight:bold;line-height:1.4;">${esc(name)}</div>`
    + `<div style="${small}">Casa Blanca Real Estate</div>`
    + (title ? `<div style="${small}">${esc(title)}</div>` : '')
    + (d.agent.email ? `<div style="${small}">${quiet(d.agent.email, null, small)}</div>` : '')
    + (phone ? `<div style="${small}">${phoneLink(phone, small)}</div>` : '')
    + '</td>'
    + (mail ? `<td align="right" valign="middle" style="${CELL}text-align:right;padding:22px 0 32px 12px;vertical-align:middle;"><a href="${esc(mail)}" style="display:inline-block;background:#0f0f0f;color:#ffffff;text-decoration:none;font-size:12px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;padding:14px 20px;white-space:nowrap;">${esc(d.cta)}</a></td>` : '')
    + '</tr></table></td></tr>');

  // The footer: the wordmark centred, the office under it, then the disclaimer.
  out.push(`<tr><td bgcolor="#0f0f0f" style="${CELL}background:#0f0f0f;color:${MUTED};padding:24px 32px;font-size:11px;line-height:1.5;">${wordmark(16, true)}`
    + `<div style="${CELL}color:#d8d6d0;font-size:11px;text-align:center;margin-top:10px;">${quiet(d.agent.office, null, 'font-size:11px;', '#d8d6d0')}</div>`
    + (e.disclaimer ? `<div style="${CELL}color:#c0c2b5;font-size:10px;line-height:1.6;margin-top:10px;">${lines(e.disclaimer)}</div>` : '')
    + '</td></tr>');
  out.push('</table>');
  out.push('</td></tr></table>');
  return out.join('\n');
}

// ─── Full and Short, as they copy (NW-084 a) ─────────────────────────────────

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
    if (!headDone && head && isHeadline(t, head)) {
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
