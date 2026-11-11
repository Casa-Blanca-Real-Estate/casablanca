// Hubert and the client's facts (design pass, new-comp.md §3 "What he fills", 2026-11-11): the agent tells
// him about their client in the New comp window's Client info step ("pre-approved for $4M, lease ends in
// March"), and set_client_fact puts it in. Only what the agent said.
//
// Like set_home_fact (hubert-home.ts), nothing is written here: the edit is checked against the brief and the
// deal terms as last saved, and handed to the agent's open screen through the turn's stream, which writes it
// the way Client info's own fields would. Each changed fact is one entry of the trail, with Undo. None of it
// is ever an input to a number.
import { PACE_LABEL } from '../workspace/client.ts';
import { fairHousingFindings } from '../workspace/fair-housing.ts';
import { CLIENT_FIELDS, clientEntryOf, type ClientField, type ClientSet, type HubertHomeEdit } from '../workspace/home-edit.ts';
import type { Brief, ClientPace, DealTermsState, Entry } from '../workspace/state.ts';
import type { Queryable } from './db.ts';
import type { TrailEntry } from './hubert-trail.ts';
import { newYorkToday } from './links.ts';

const LABEL: Record<ClientField, string> = {
  financing: 'Financing', preApproved: 'Pre-approved', preApprovalAmount: 'Pre-approved for', pace: 'How soon', motivations: 'What’s moving them', notes: 'Notes on the client',
};

const BUYER_ONLY: readonly ClientField[] = ['financing', 'preApproved', 'preApprovalAmount'];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The Client info step's words for the pace, by side (the canvas). */
export function paceWords(side: 'buyer' | 'seller', pace: ClientPace): string {
  if (side === 'seller') return pace === 'asap' ? 'Needs to sell soon' : 'Can wait for the right price';
  return pace === 'asap' ? 'Ready to buy now' : 'Can wait for the right one';
}

function valueText(field: ClientField, value: unknown, side: 'buyer' | 'seller'): string | null {
  if (value === null || value === undefined) return null;
  if (field === 'financing') return value === 'cash' ? 'All cash' : 'Mortgage';
  if (field === 'preApproved') return value ? 'Yes' : 'Not yet';
  if (field === 'preApprovalAmount') return `$${Number(value).toLocaleString('en-US')}`;
  if (field === 'pace') return paceWords(side, value as ClientPace);
  const s = String(value);
  return s.length > 140 ? `${s.slice(0, 139).trimEnd()}…` : s;
}

function paceFrom(raw: string): ClientPace | null {
  const v = norm(raw);
  if (['asap', 'as soon as possible', 'ready to buy now', 'needs to sell soon', 'soon', 'now', 'urgent', 'fast'].includes(v)) return 'asap';
  if (['can wait', 'can wait', 'can wait for the right one', 'can wait for the right price', 'not in a rush', 'no rush'].includes(v) || v === norm(PACE_LABEL.can_wait)) return 'can_wait';
  return null;
}

function moneyFrom(raw: string): number | null {
  let s = raw.trim().toLowerCase().replace(/[$,\s]/g, '');
  let mult = 1;
  if (/m$/.test(s)) { mult = 1_000_000; s = s.slice(0, -1); } else if (/k$/.test(s)) { mult = 1_000; s = s.slice(0, -1); }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s) * mult);
  return n >= 1 && n <= 1_000_000_000 ? n : null;
}

export type ClientEditOutcome = { ok: true; edit: HubertHomeEdit; trail: TrailEntry[]; summary: string } | { ok: false; error: string };

/** set_client_fact: the client's facts the agent dictated, checked against the brief and deal terms as last saved. */
export async function setClientFacts(tx: Queryable, reportId: string, input: unknown): Promise<ClientEditOutcome> {
  if (!isObject(input) || !Array.isArray(input.changes) || !input.changes.length) {
    return { ok: false, error: 'Send changes: a list, one per fact about the client the agent named.' };
  }
  if (input.changes.length > CLIENT_FIELDS.length) return { ok: false, error: 'At most one change per fact.' };
  const row = (await tx.query<{ brief: Brief | null; terms: DealTermsState | null; sent: boolean }>(
    `select brief, state -> 'dealTerms' as terms, state -> 'send' ->> 'sentAt' is not null as sent from comp_report.reports where id = $1`, [reportId],
  )).rows[0];
  if (!row) return { ok: false, error: 'No such report.' };
  if (row.sent) return { ok: false, error: 'The agent marked this report’s email as sent. They reopen it on Done before its details change.' };
  const brief: Brief = row.brief ?? {};
  const terms = row.terms ?? null;
  const side = brief.audience?.value === 'seller' ? 'seller' : 'buyer';
  const asOf = newYorkToday();
  const client: ClientSet = {};
  const trail: TrailEntry[] = [];

  for (const c of input.changes) {
    if (!isObject(c) || typeof c.field !== 'string' || !(CLIENT_FIELDS as readonly string[]).includes(c.field)) {
      return { ok: false, error: `Each change names a field: ${CLIENT_FIELDS.join(', ')}.` };
    }
    const field = c.field as ClientField;
    if (field in client) return { ok: false, error: `Two changes to ${field}: send one.` };
    if (side === 'seller' && BUYER_ONLY.includes(field)) return { ok: false, error: 'Financing and pre-approval are a buyer’s: this is a seller’s report.' };
    const raw = typeof c.value === 'string' ? c.value : undefined;
    if (raw === undefined) return { ok: false, error: `Give the ${LABEL[field].toLowerCase()} as value (an empty value clears it).` };
    const before = clientEntryOf(brief, terms, field);
    let next: unknown = null;
    if (raw.trim()) {
      if (field === 'financing') {
        const v = norm(raw);
        next = /cash/.test(v) ? 'cash' : /mortgage|loan|financ/.test(v) ? 'mortgage' : null;
        if (!next) return { ok: false, error: 'Financing is all cash or a mortgage.' };
      } else if (field === 'preApproved') {
        const v = norm(raw);
        next = ['yes', 'true', 'y'].includes(v) ? true : ['no', 'not yet', 'false', 'n'].includes(v) ? false : null;
        if (next === null) return { ok: false, error: 'Pre-approved is yes or not yet (or empty for not known).' };
      } else if (field === 'preApprovalAmount') {
        next = moneyFrom(raw);
        if (next === null) return { ok: false, error: 'The pre-approval is an amount in dollars, like 4000000 or 4M.' };
      } else if (field === 'pace') {
        next = paceFrom(raw);
        if (!next) return { ok: false, error: `How soon is “${paceWords(side, 'asap')}” (asap) or “${paceWords(side, 'can_wait')}” (can_wait).` };
      } else {
        const text = raw.trim();
        if (text.length > (field === 'notes' ? 2000 : 500)) return { ok: false, error: `The ${LABEL[field].toLowerCase()} is too long.` };
        const hard = fairHousingFindings(text).find((f) => f.level === 'hard');
        if (hard) return { ok: false, error: `“${hard.term}” can’t be saved: it reads as a preference on ${hard.basis} (fair housing). Ask the agent to say it another way.` };
        next = text;
      }
    }
    if (JSON.stringify(next) === JSON.stringify(before?.value ?? null)) continue;
    (client as Record<string, unknown>)[field] = next === null ? null : { value: next, asOf };
    trail.push({
      kind: 'home', target: 'The client', field: `client.${field}`, label: LABEL[field],
      before: valueText(field, before?.value, side), after: valueText(field, next, side),
      undo: { edit: { client: { [field]: before } }, left: next },
    });
  }
  // A pre-approval amount says they're pre-approved; Client info shows the amount only then.
  const wasApproved = clientEntryOf(brief, terms, 'preApproved');
  if (client.preApprovalAmount && !('preApproved' in client) && wasApproved?.value !== true) {
    client.preApproved = { value: true, asOf };
    trail.unshift({
      kind: 'home', target: 'The client', field: 'client.preApproved', label: LABEL.preApproved,
      before: valueText('preApproved', wasApproved?.value, side), after: 'Yes',
      undo: { edit: { client: { preApproved: wasApproved } }, left: true },
    });
  }
  if (!trail.length) return { ok: false, error: 'Nothing to change: the client’s facts already read that way.' };
  return { ok: true, edit: { set: {}, client }, trail, summary: trail.map((t) => `${t.label}: ${t.after ?? 'cleared'}`).join('; ') };
}

/** The client's facts as the agent has them, in words, for get_view on the Client info step. */
export function clientDetailsOf(brief: Brief | null, terms: DealTermsState | null): Record<string, string> {
  const b = brief ?? {};
  const side = b.audience?.value === 'seller' ? 'seller' : 'buyer';
  const out: Record<string, string> = {};
  for (const f of CLIENT_FIELDS) {
    if (side === 'seller' && BUYER_ONLY.includes(f)) continue;
    const e = clientEntryOf(b, terms, f) as Entry<unknown> | null;
    const text = e ? valueText(f, e.value, side) : null;
    if (text) out[f] = text;
  }
  return out;
}
