// Hubert's edits to the home's details (set_home_fact, server/hubert-home.ts)
// and to the client's facts (set_client_fact, server/hubert-client.ts): what
// the agent dictated, as the entries to write. Plain data, like the rest of
// workspace/: the server builds the edit, the browser applies it to the
// intake, brief and deal terms its autosave owns (the way edit_email's edit
// reaches Send), and Undo applies the entries as they were.
import { withBuyerFinance } from './client.ts';
import type { Brief, ClientFacts, ClientPace, DealTermsState, Entry, Intake } from './state.ts';

/** The client's facts Hubert may set, each its new entry or null to clear it (the New comp window's Client info). */
export interface ClientSet {
  financing?: Entry<'cash' | 'mortgage'> | null;
  preApproved?: Entry<boolean> | null;
  preApprovalAmount?: Entry<number> | null;
  pace?: Entry<ClientPace> | null;
  motivations?: Entry<string> | null;
  notes?: Entry<string> | null;
}
export type ClientField = keyof ClientSet;
export const CLIENT_FIELDS: readonly ClientField[] = ['financing', 'preApproved', 'preApprovalAmount', 'pace', 'motivations', 'notes'];
const TERMS_FIELDS = ['financing', 'preApproved', 'preApprovalAmount'] as const;

/** Each changed field's new entry, or null to clear it. */
export interface HubertHomeEdit {
  set: Partial<Record<keyof Intake, Intake[keyof Intake] | null>>;
  /** The client's facts (set_client_fact): the brief's and the buyer's deal terms'. */
  client?: ClientSet;
}

/** The intake with the edit's entries written in. */
export function applyHomeSet(intake: Intake, set: HubertHomeEdit['set']): Intake {
  const next: Intake = { ...intake };
  for (const [key, entry] of Object.entries(set) as [keyof Intake, Intake[keyof Intake] | null][]) {
    if (entry === null || entry === undefined) delete next[key];
    else (next as Record<string, unknown>)[key] = entry;
  }
  return next;
}

/** The client's fact as it stands now: the brief's, or the buyer's deal terms'. */
export function clientEntryOf(brief: Brief, terms: DealTermsState | null | undefined, field: ClientField): Entry<unknown> | null {
  if ((TERMS_FIELDS as readonly string[]).includes(field)) {
    return terms?.template === 'buyer_traditional' ? ((terms[field as (typeof TERMS_FIELDS)[number]] as Entry<unknown> | undefined) ?? null) : null;
  }
  const c = brief.client ?? {};
  if (field === 'pace') return c.urgency?.pace ?? null;
  return (c[field as 'motivations' | 'notes'] as Entry<unknown> | undefined) ?? null;
}

/** The brief and deal terms with the client edit written in: the pre-approval as Client info's fields write it. */
export function applyClientSet(brief: Brief, terms: DealTermsState | null, set: ClientSet): { brief: Brief; terms: DealTermsState | null } {
  let nextTerms = terms;
  const termsChange: Pick<DealTermsState, 'financing' | 'preApproved' | 'preApprovalAmount'> = {};
  for (const k of TERMS_FIELDS) {
    if (!(k in set)) continue;
    (termsChange as Record<string, unknown>)[k] = set[k] ?? undefined;
  }
  if (Object.keys(termsChange).length) nextTerms = withBuyerFinance(terms, termsChange);
  let client: ClientFacts = { ...(brief.client ?? {}) };
  if ('pace' in set) {
    const { pace: _drop, ...urgency } = client.urgency ?? {};
    const nextUrgency = set.pace ? { ...urgency, pace: set.pace } : urgency;
    const { urgency: _u, ...rest } = client;
    client = Object.keys(nextUrgency).length ? { ...rest, urgency: nextUrgency } : rest;
  }
  for (const k of ['motivations', 'notes'] as const) {
    if (!(k in set)) continue;
    const v = set[k];
    if (v) client[k] = v;
    else delete client[k];
  }
  const nextBrief: Brief = { ...brief };
  if (Object.keys(client).length) nextBrief.client = client;
  else delete nextBrief.client;
  return { brief: nextBrief, terms: nextTerms };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Whether a home entry's Undo still applies: the field still reads as Hubert left it. A client entry's field is "client.<field>". */
export function homeUndoStands(
  entry: { kind: string; field: string; undo?: { left: unknown } },
  intake: Intake,
  client?: { brief: Brief; terms: DealTermsState | null },
): boolean {
  if (entry.kind !== 'home' || !entry.undo) return false;
  if (entry.field.startsWith('client.')) {
    if (!client) return false;
    return same(clientEntryOf(client.brief, client.terms, entry.field.slice(7) as ClientField)?.value, entry.undo.left);
  }
  return same((intake as Record<string, { value?: unknown } | undefined>)[entry.field]?.value, entry.undo.left);
}
