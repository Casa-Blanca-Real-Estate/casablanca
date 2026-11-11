// The home's line and the target, as START and the New comp window's Basics read them: a StreetEasy link
// (checked) or an address typed in, and the target's label by whose it is and the side.
//
// The target keeps D-4: Hubert doesn't see it until his own math is done, it's
// never in the email, and it stays editable on Findings. It's one number,
// labelled by whose it is and the side (Dispatch 21, NW-070): the client's by
// default. Edit details follows the owner Findings set.
import type { Audience, TargetOwner } from '../../../workspace/state.ts';
import { checkListingLink, type LinkCheck } from '../../../workspace/links.ts';
import { splitTitle } from '../workspace/model.ts';

export type PropertyType = 'coop' | 'condo';

const LINKISH = /^(https?:\/\/|www\.|streeteasy)/i;

export const TYPE_LABEL: Record<PropertyType, string> = { coop: 'Co-op', condo: 'Condo' };

export const TARGET_TIP = 'Hubert, the AI assistant, doesn’t see this, so it can’t sway his read of the comps. It’s never in your client’s email and doesn’t change any number. Findings shows it against the range, and you can change it there.';

const TARGET_LABEL: Record<TargetOwner, Record<Audience, string>> = {
  // A buyer's own number is their budget (Kimani, 2026-10-22).
  client: { buyer: 'Client’s budget', seller: 'Client’s target price' },
  agent: { buyer: 'Your offer target', seller: 'Your list price' },
  both: { buyer: 'Shared target', seller: 'Shared target' },
};

/** The target's label, one scheme by whose it is and the side (NW-070). The client's is the default. */
/** Set on step 1 when the agent left Co-op or Condo alone: the home's page, once read, decides it. */
export const typeFromPageKey = (reportId: string) => `cr-type-from-page:${reportId}`;

export function targetLabel(side: Audience, owner: TargetOwner = 'client'): string {
  return TARGET_LABEL[owner][side];
}

/** A pasted link that checks out, as the clean link the tool reads (NW-004); otherwise null. */
export function cleanLink(text: string): string | null {
  const v = readHomeLine(text);
  return v.kind === 'link' && v.check.ok && v.check.url !== text ? v.check.url : null;
}

/** What's in the home's line: a StreetEasy link (checked), an address typed in, or nothing yet. */
export type HomeLineValue =
  | { kind: 'empty' }
  | { kind: 'link'; check: LinkCheck }
  | { kind: 'typed'; address: string; unit: string | null; title: string };

function unitLabel(unit: string): string {
  const u = unit.trim();
  return u.startsWith('#') ? u : `#${u}`;
}

export function readHomeLine(text: string): HomeLineValue {
  const t = text.trim();
  if (!t) return { kind: 'empty' };
  if (LINKISH.test(t)) return { kind: 'link', check: checkListingLink(t) };
  const split = splitTitle(t);
  const address = split?.address ?? t;
  const unit = split?.unit ?? null;
  return { kind: 'typed', address, unit, title: `${address.split(',')[0]!.trim()}${unit ? ` ${unitLabel(unit)}` : ''}` };
}

/** The line can make a report: a good link, or an address of a few letters. */
export function homeLineReady(v: HomeLineValue): boolean {
  return (v.kind === 'link' && v.check.ok) || (v.kind === 'typed' && v.address.trim().length >= 3);
}

/** "$4,250,000", or what's typed while it doesn't read as a price. */
export function targetText(price: number | null | undefined): string {
  return price ? `$${price.toLocaleString('en-US')}` : '';
}
