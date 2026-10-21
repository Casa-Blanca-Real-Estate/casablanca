// Send and Done's words (Dispatch 14): the prototype's, with its buyer and
// seller variants (renderVals, "buyer ?"). Plain data and small functions.
import type { EmailLength } from '../../../workspace/email.ts';
import type { Intake, Outcomes } from '../../../workspace/state.ts';

/** Send's four tabs, Designed first (NW-079 a). Designed renders the Full draft; the other three are the writer's lengths. */
export type Format = 'full' | 'designed' | 'short' | 'text';

export const FORMATS: { id: Format; label: string }[] = [
  { id: 'designed', label: 'Designed' },
  { id: 'full', label: 'Full' },
  { id: 'short', label: 'Short' },
  { id: 'text', label: 'Text' },
];

export function lengthOf(f: Format): EmailLength {
  return f === 'designed' ? 'full' : f;
}

/** The tab showing: the stored format, else the stored length (before Dispatch 14), else Designed. */
export function formatOf(send: { format?: Format | undefined; length?: EmailLength | undefined }): Format {
  return send.format ?? send.length ?? 'designed';
}

export const COPY_LABEL: Record<Format, string> = {
  full: 'Copy the email',
  designed: 'Copy the designed email',
  short: 'Copy the email',
  text: 'Copy the text',
};

/** How Done names what went out. */
export const SENT_AS: Record<Format, string> = {
  full: 'the full email',
  designed: 'the designed email',
  short: 'the short email',
  text: 'a text message',
};

export const LENGTH_WORD: Record<EmailLength, string> = { full: 'full', short: 'short', text: 'text message' };

export const OFFICE = 'Casa Blanca · 10 Hubert St, Tribeca';

/** The designed email's range eyebrow. */
export function designedEyebrow(side: 'buyer' | 'seller', home: string): string {
  return side === 'buyer' ? `What ${home} is worth today` : 'What the sales support';
}

/** The designed email's button. */
export function designedCta(side: 'buyer' | 'seller'): string {
  return side === 'buyer' ? 'Plan the offer' : 'Talk it through';
}

/** Done's "How did it go?": the seller's list price or the buyer's offer, the contract, the sale. */
export function outcomeFields(side: 'buyer' | 'seller'): { key: keyof Outcomes; label: string; hint: string }[] {
  return [
    side === 'buyer'
      ? { key: 'listedOrOffered', label: 'Offered at', hint: 'When you offer' }
      : { key: 'listedOrOffered', label: 'Listed at', hint: 'When it lists' },
    { key: 'contract', label: 'Contract price', hint: 'At contract' },
    { key: 'sold', label: 'Sold for', hint: 'At closing' },
  ];
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-10-14" → "October 2026". */
export function monthOf(isoDay: string): string {
  const m = Number(isoDay.slice(5, 7));
  return `${MONTH_NAMES[m - 1] ?? ''} ${isoDay.slice(0, 4)}`.trim();
}

/** "3 bd · 3 ba · Floor 17", from what's known of the home. */
export function homeSub(intake: Intake): string {
  return [
    intake.beds ? `${intake.beds.value} bd` : null,
    intake.baths ? `${intake.baths.value} ba` : null,
    intake.floor ? `Floor ${intake.floor.value}` : null,
  ].filter(Boolean).join(' · ');
}

/** "Oct 9, 2026", in the agent's time zone. */
export function sentDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Done's line under "Sent": "To Jordan and Sam · Oct 9, 2026 · the designed email". */
export function sentLine(args: { client: string | undefined; sentAt: string; format: Format }): string {
  const to = args.client?.trim();
  return [to ? `To ${to}` : null, sentDay(args.sentAt), `Sent as ${SENT_AS[args.format]}`].filter(Boolean).join(' · ');
}

/** A typed-in amount: "$4,450,000", "4.45M", "4450000" → 4450000. Null when it isn't one. */
export function parseAmount(raw: string): number | null {
  const t = raw.trim().replace(/[$,\s]/g, '');
  const m = /^(\d+(?:\.\d+)?)([kKmM])?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] ? (m[2].toLowerCase() === 'm' ? 1e6 : 1e3) : 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
