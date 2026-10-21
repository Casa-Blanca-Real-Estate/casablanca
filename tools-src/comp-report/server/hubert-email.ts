// Hubert and the email on Send (2026-10-21; dev notes dn_mviipah6rs3v and
// dn_mvij3r5x4g0f): get_email reads the email as the agent last saw it, and
// edit_email changes its words when the agent asks.
//
// What he reads is what Send wrote down as it showed the email
// (`state.send.seen`) and the agent's own lines. Never the client note, which
// Send tells the agent Hubert doesn't see.
//
// What he changes is words, never styling: the subject, the headline, the
// agent's lines and exact passages of the body's plain text, the text the
// designed email is laid out from. The edit is checked here and then handed
// to the agent's open Send screen through the turn's stream (api/turn.ts),
// where Send applies it the way the agent's own typing would be — its draft,
// its fingerprint, QA again — and the agent can undo it. Nothing here writes
// the report: Send's autosave owns `state`, so the two never race.
import { DISCLAIMER } from '../workspace/frame.ts';
import type { SendState } from '../workspace/state.ts';
import type { Queryable } from './db.ts';

export const EMAIL_FIELDS = ['subject', 'headline', 'chosen', 'consider', 'next_step', 'signed'] as const;
export type EmailField = (typeof EMAIL_FIELDS)[number];

/** An edit Hubert made, as Send applies it. */
export interface HubertEmailEdit {
  changes: { field: EmailField; text: string }[];
  bodyEdits: { find: string; replace: string }[];
  /** The tab's length the body edits were made against. */
  length: 'full' | 'short' | 'text' | null;
}

const LIMIT: Record<EmailField, number> = { subject: 300, headline: 400, chosen: 2_000, consider: 2_000, next_step: 2_000, signed: 200 };
const LINE_OF: Record<Exclude<EmailField, 'subject' | 'headline'>, 'chosen' | 'consider' | 'nextStep' | 'signOff'> = {
  chosen: 'chosen', consider: 'consider', next_step: 'nextStep', signed: 'signOff',
};

async function sendOf(tx: Queryable, reportId: string): Promise<{ send: SendState; revealed: boolean } | null> {
  const row = (await tx.query<{ send: SendState | null; revealed: boolean }>(
    `select state -> 'send' as send, agent_call is not null as revealed from comp_report.reports where id = $1`,
    [reportId],
  )).rows[0];
  return row ? { send: row.send ?? {}, revealed: row.revealed } : null;
}

/** get_email: the email as the agent sees it, and the lines it's written from. */
export async function emailFor(tx: Queryable, reportId: string) {
  const r = await sendOf(tx, reportId);
  if (!r) return null;
  const { send } = r;
  const seen = send.seen;
  if (!r.revealed || !seen) {
    return { on_send: false, note: r.revealed ? "The agent hasn't opened Send yet." : 'The email waits for the agent’s number on Findings.' };
  }
  return {
    on_send: true,
    tab: seen.format,
    length: seen.length,
    subject: seen.subject,
    headline: seen.headline,
    body: seen.text,
    agent_lines: {
      chosen: send.chosen?.value ?? '',
      consider: send.consider?.value ?? '',
      next_step: send.nextStep?.value ?? '',
      signed: send.signOff?.value ?? '',
    },
    marked_as_sent: Boolean(send.sentAt),
    seen_at: seen.at,
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (text: string, find: string) => text.split(find).length - 1;

export type EditOutcome = { ok: true; edit: HubertEmailEdit; summary: string[] } | { ok: false; error: string };

/** edit_email: the edit, checked against the email as the agent sees it. Nothing is written here. */
export async function editEmail(tx: Queryable, reportId: string, input: unknown): Promise<EditOutcome> {
  if (!isObject(input) || !Array.isArray(input.changes) || !Array.isArray(input.body_edits)) {
    return { ok: false, error: 'Send changes and body_edits, each a list (either may be empty).' };
  }
  const r = await sendOf(tx, reportId);
  if (!r) return { ok: false, error: 'No such report.' };
  if (!r.revealed) return { ok: false, error: 'The email waits for the agent’s number on Findings: there is nothing to edit yet.' };
  if (r.send.sentAt) return { ok: false, error: 'The agent marked this email as sent. They reopen it on Done before it can change.' };

  const changes: HubertEmailEdit['changes'] = [];
  const summary: string[] = [];
  if (input.changes.length > EMAIL_FIELDS.length) return { ok: false, error: 'At most one change per field.' };
  for (const c of input.changes) {
    if (!isObject(c) || !EMAIL_FIELDS.includes(c.field as EmailField) || typeof c.text !== 'string') {
      return { ok: false, error: `Each change is a field (${EMAIL_FIELDS.join(', ')}) and its text.` };
    }
    const field = c.field as EmailField;
    const text = c.text.trim();
    if (changes.some((x) => x.field === field)) return { ok: false, error: `Two changes to ${field}: send one.` };
    if (text.length > LIMIT[field]) return { ok: false, error: `The ${field} is too long (${LIMIT[field]} characters at most).` };
    if ((field === 'subject' || field === 'headline') && !text) return { ok: false, error: `The ${field} can't be empty.` };
    if (field === 'headline' && text.includes('\n')) return { ok: false, error: 'The headline is one line.' };
    changes.push({ field, text });
    summary.push(field in LINE_OF && !text ? `cleared ${field}` : `set ${field}`);
  }

  const bodyEdits: HubertEmailEdit['bodyEdits'] = [];
  const seen = r.send.seen;
  if (input.body_edits.length) {
    if (!seen) return { ok: false, error: "The agent hasn't opened Send yet, so there's no body to edit. Change their lines instead." };
    if (input.body_edits.length > 20) return { ok: false, error: 'At most 20 body edits at a time.' };
    let body = seen.text;
    for (const e of input.body_edits) {
      if (!isObject(e) || typeof e.find !== 'string' || typeof e.replace !== 'string' || !e.find) {
        return { ok: false, error: 'Each body edit is an exact passage to find and its replacement.' };
      }
      const find = e.find, replace = e.replace;
      if (find.length > 4_000 || replace.length > 4_000) return { ok: false, error: 'A body edit is too long.' };
      const n = count(body, find);
      if (n !== 1) {
        return { ok: false, error: n ? `“${find.slice(0, 60)}” appears ${n} times in the body: quote more of it.` : `“${find.slice(0, 60)}” isn't in the body. Call get_email and quote it exactly.` };
      }
      body = body.replace(find, () => replace);
      bodyEdits.push({ find, replace });
    }
    if (seen.text.includes(DISCLAIMER) && !body.includes(DISCLAIMER)) {
      return { ok: false, error: 'That would change the disclaimer, which stays as it is.' };
    }
    if (body.length > 60_000) return { ok: false, error: 'The email would be too long.' };
    summary.push(`${bodyEdits.length} edit${bodyEdits.length === 1 ? '' : 's'} to the ${seen.length === 'text' ? 'text message' : `${seen.length} email`}'s body`);
  }
  if (!changes.length && !bodyEdits.length) return { ok: false, error: 'Nothing to change: send at least one change or body edit.' };
  return { ok: true, edit: { changes, bodyEdits, length: bodyEdits.length ? seen!.length : null }, summary };
}

/** The edit inside an edit_email tool result, for the turn to hand to Send. */
export function editFromResult(block: Record<string, unknown>): HubertEmailEdit | null {
  if (block.is_error || typeof block.content !== 'string') return null;
  try {
    const parsed = JSON.parse(block.content) as { edit?: HubertEmailEdit };
    return parsed.edit ?? null;
  } catch {
    return null;
  }
}
