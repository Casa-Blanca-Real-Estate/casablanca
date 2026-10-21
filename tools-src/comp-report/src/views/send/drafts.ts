// Send's state, as plain functions (Dispatch 18): the agent's edited drafts,
// one per length; the subject, its own field; what a copy and Mark as sent
// store; and what the footer says. useSendEmail calls these; the tests call
// them without a browser.
import type { EmailLength } from '../../../workspace/email.ts';
import type { SendDraft, SendState } from '../../../workspace/state.ts';
import { fingerprint } from '../workspace/model.ts';
import type { Format } from './copy.ts';

export const LENGTHS: EmailLength[] = ['full', 'short', 'text'];

export type Drafts = Partial<Record<EmailLength, SendDraft>>;

/** What a draft was edited from: the body alone. The subject is its own field and changes no draft (NW-083 a). */
export const bodyPrint = (text: string) => fingerprint(text);

/** Before Dispatch 18 a draft's fingerprint took the subject with the body. */
const legacyPrint = (e: { subject: string; text: string }) => fingerprint(`${e.subject}\n${e.text}`);

/**
 * Each length's draft. The stored ones as they are; an old single draft
 * (`send.draft`) goes to the length whose email it was edited from, current
 * again under the new fingerprint, or, when it matches none, to the length it
 * was open at, out of date as it was before.
 */
export function draftsOf(send: SendState, emailFor: (len: EmailLength) => { subject: string; text: string }): Drafts {
  const drafts: Drafts = { ...send.drafts };
  const old = send.draft;
  if (!old) return drafts;
  const at = LENGTHS.find((len) => legacyPrint(emailFor(len)) === old.basedOn || bodyPrint(emailFor(len).text) === old.basedOn);
  if (at) {
    drafts[at] ??= { ...old, basedOn: bodyPrint(emailFor(at).text) };
  } else {
    drafts[send.length ?? 'full'] ??= old;
  }
  return drafts;
}

/** Send with one length's draft set, or dropped; the others kept, and the old single draft folded in. */
export function withDraft(send: SendState, drafts: Drafts, len: EmailLength, draft: SendDraft | undefined): SendState {
  const next: SendState = { ...send, drafts: { ...drafts } };
  delete next.draft;
  if (draft) next.drafts![len] = draft;
  else delete next.drafts![len];
  if (!Object.keys(next.drafts!).length) delete next.drafts;
  return next;
}

/** The subject: the agent's, else an old draft's, else the template's. */
export function subjectOf(send: SendState, drafts: Drafts, template: string): string {
  return send.subject?.value ?? send.draft?.subject ?? drafts.full?.subject ?? drafts.short?.subject ?? template;
}

/** Editing the subject stores `send.subject` and touches no draft. */
export function setSubject(send: SendState, value: string, today: string): SendState {
  return { ...send, subject: { value, asOf: today } };
}

/** A copy with the Copy button: when, and which tab, for Mark as sent to record. */
export function afterCopy(send: SendState, format: Format, at: string): SendState {
  return { ...send, copiedAt: at, copiedFormat: format };
}

/**
 * Marked as sent (NW-086 a): with or without a copy, since a hand copy sets
 * nothing. It records the tab last copied, else the one open. It logs nothing:
 * the copy log is the Copy button's.
 */
export function sentState(send: SendState, open: Format, at: string): SendState {
  return { ...send, format: send.copiedFormat ?? open, sentAt: at };
}

export interface Foot {
  note: string | null;
  /** Mark as sent is there: not on a report that isn't the agent's. */
  markSent: boolean;
  /** Which button leads: Copy, then Mark as sent once it's copied (NW-086 a). */
  primary: 'copy' | 'sent';
}

/** Send's footer: the line beside Copy and Mark as sent, and which leads. */
export function footOf(args: { off: boolean; copiedAt?: string | undefined; sentAt?: string | undefined; sentDay?: string }): Foot {
  if (args.off) {
    return { note: 'This report is read-only, so it can’t be marked as sent.', markSent: false, primary: 'copy' };
  }
  if (args.sentAt) return { note: `Marked as sent ${args.sentDay ?? ''}.`.replace(' .', '.'), markSent: true, primary: 'copy' };
  if (args.copiedAt) return { note: 'Copied. Sent it? Mark it as sent.', markSent: true, primary: 'sent' };
  return { note: 'Copy it, send it, then mark it as sent.', markSent: true, primary: 'copy' };
}
