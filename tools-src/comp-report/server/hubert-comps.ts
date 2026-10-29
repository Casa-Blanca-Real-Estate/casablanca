// Hubert and the comps (Kimani, 2026-10-21 and 2026-10-28): he carries out the
// agent's thinking, never does it for them. When the agent tells him what to
// change on a comp (its tier, its note, its tags, or a corrected price, size,
// date or floor), edit_comp saves it through the same PATCH the agent's own
// edits use (api/comps.ts patchComp): the same checks, the same reason
// history, with the reason marked as the assistant's. The result carries the
// trail (server/hubert-trail.ts) the chat shows under his reply.
//
// Unlike the email, which Send's autosave owns, the comps are the server's:
// the edit is written here, and the agent's screen reloads them when the turn
// says a comp changed (api/turn.ts).
import type { CompRecord, Tier } from '../engine/index.ts';
import type { WorkspaceComp } from '../workspace/engine-input.ts';
import { noteOf, OVERRIDE_KEYS, type OverrideKey } from '../workspace/state.ts';
import { address } from '../workspace/summary.ts';
import { patchComp } from './api/comps.ts';
import { queueReads } from './api/links.ts';
import { checkListingLink, readLimit, titleFromLink } from './links.ts';
import type { Queryable } from './db.ts';
import type { Action } from './logs.ts';
import { HttpError } from './http.ts';
import type { TrailEntry } from './hubert-trail.ts';
import { neutralNumbers } from './numbers.ts';
import type { SessionUser } from './session.ts';

const TIERS: Tier[] = ['primary', 'secondary', 'excluded'];
const TIER_WORD: Record<Tier, string> = { primary: '1st tier', secondary: '2nd tier', excluded: 'Excluded' };
const FACT_LABEL: Record<OverrideKey, string> = { price: 'Price', size: 'Size', date: 'Date', floor: 'Floor' };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const short = (text: string, n = 140) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#]+/g, ' ').replace(/\s+/g, ' ').trim();

/** A fact as the chat shows it: "$1,250,000", "1,020 sq ft", "2026-07-14", "Floor 5". */
function factText(key: OverrideKey, record: CompRecord): string | null {
  const f = record.facts;
  const v = key === 'price'
    ? (record.status.evidence_class === 'sold' ? f.sale_price?.value : f.list_price?.value) ?? null
    : key === 'size' ? f.area_sqft?.value ?? null
    : key === 'date' ? f.status_date?.value ?? null
    : f.floor?.value ?? null;
  return v === null ? null : shown(key, v);
}

function shown(key: OverrideKey, v: number | string): string {
  if (key === 'price') return `$${Number(v).toLocaleString('en-US')}`;
  if (key === 'size') return `${Number(v).toLocaleString('en-US')} sq ft`;
  if (key === 'floor') return `Floor ${v}`;
  return String(v);
}

/** The comp the agent means, by the name get_numbers gives it. */
function findComp(comps: WorkspaceComp[], name: string): WorkspaceComp | string {
  const want = norm(name);
  if (!want) return 'Name the comp as get_numbers gives it.';
  const exact = comps.filter((c) => norm(address(c)) === want);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return `Two comps are named “${name}”. Ask the agent which one.`;
  const loose = comps.filter((c) => norm(address(c)).startsWith(want) || want.startsWith(norm(address(c))));
  if (loose.length === 1) return loose[0]!;
  return loose.length
    ? `“${name}” could be ${loose.map(address).join(' or ')}. Ask the agent which one.`
    : `No comp in the report is named “${name}”. Call get_numbers and use a comp's name as it gives it.`;
}

export type CompEditOutcome = { ok: true; summary: string; trail: TrailEntry[]; actions: Action[] } | { ok: false; error: string };

/** edit_comp: the agent's change to one comp, checked and saved. */
export async function editCompForAgent(tx: Queryable, user: SessionUser, reportId: string, input: unknown): Promise<CompEditOutcome> {
  if (!isObject(input) || typeof input.comp !== 'string' || !isObject(input.changes)) {
    return { ok: false, error: 'Send the comp (its name as get_numbers gives it) and the changes.' };
  }
  const n = await neutralNumbers(tx, reportId);
  if (!n) return { ok: false, error: 'No such report.' };
  const comp = findComp(n.comps, input.comp);
  if (typeof comp === 'string') return { ok: false, error: comp };
  const j = comp.judgment;
  if (!j) return { ok: false, error: 'That comp can’t be changed here.' };
  if (j.removedAt) return { ok: false, error: 'The agent took that comp out of the report. They put it back first.' };

  const ch = input.changes;
  const body: Record<string, unknown> = {};
  const trail: TrailEntry[] = [];
  const target = address(comp);
  const entry = (field: string, label: string, before: string | null, after: string | null, undo?: TrailEntry['undo']) =>
    trail.push({ kind: 'comp', compId: j.reportCompId, target, field, label, before, after, ...(undo ? { undo } : {}) });

  if (ch.tier !== undefined) {
    if (typeof ch.tier !== 'string' || !TIERS.includes(ch.tier as Tier)) return { ok: false, error: 'The tier is primary, secondary or excluded.' };
    if (comp.unsortable) return { ok: false, error: `That comp can’t be sorted: ${comp.unsortable}` };
    const tier = ch.tier as Tier;
    if (tier !== j.tier) {
      body.tier = tier;
      // Undo puts the tier back, and the star with it; a comp that wasn't sorted can't be unsorted, so it has none.
      const undo = j.tier ? { edit: j.anchor ? { anchor: true } : { tier: j.tier }, left: tier } : undefined;
      entry('tier', 'Tier', j.tier ? TIER_WORD[j.tier] : 'Not sorted', TIER_WORD[tier], undo);
      // The ★ comp is 1st tier: 2nd or Excluded takes the star off (patchComp), and the trail says so.
      if (j.anchor && tier !== 'primary') entry('anchor', 'Star (closest comp)', '★', null);
    }
  }
  if (ch.note !== undefined) {
    if (typeof ch.note !== 'string') return { ok: false, error: 'The note is text (empty clears it).' };
    const note = ch.note.trim();
    const before = noteOf(j);
    if (note !== (before ?? '')) {
      body.note = note || null;
      entry('note', 'Why it’s a comp', before ? short(before) : null, note ? short(note) : null, { edit: { note: before }, left: note || null });
    }
  }
  const add = ch.add_tags, remove = ch.remove_tags;
  if (add !== undefined || remove !== undefined) {
    if ((add !== undefined && !Array.isArray(add)) || (remove !== undefined && !Array.isArray(remove))) {
      return { ok: false, error: 'add_tags and remove_tags are lists of tags.' };
    }
    const current = j.tags ?? [];
    const out = new Set((remove ?? []).map((t) => String(t).toLowerCase()));
    const next = current.filter((t) => !out.has(t.toLowerCase()));
    for (const t of add ?? []) if (typeof t === 'string' && !next.some((x) => x.toLowerCase() === t.toLowerCase())) next.push(t);
    if (next.join('\n') !== current.join('\n')) {
      body.tags = next;
      entry('tags', 'Tags', current.length ? current.join(', ') : null, next.length ? next.join(', ') : null, { edit: { tags: current }, left: next });
    }
  }
  const overrides: Record<string, unknown> = {};
  for (const key of OVERRIDE_KEYS) {
    if (ch[key] === undefined) continue;
    const v = ch[key];
    if (key === 'date' ? typeof v !== 'string' : typeof v !== 'number') {
      return { ok: false, error: key === 'date' ? 'The date is YYYY-MM-DD.' : `The ${key} is a whole number.` };
    }
    overrides[key] = v;
    const was = j.factOverrides?.[key]?.value ?? null;
    entry(key, FACT_LABEL[key], factText(key, comp.record), shown(key, v as number | string), { edit: { factOverrides: { [key]: was } }, left: v });
  }
  if (Array.isArray(ch.restore_facts)) {
    for (const key of ch.restore_facts) {
      if (!(OVERRIDE_KEYS as readonly unknown[]).includes(key)) return { ok: false, error: 'restore_facts lists price, size, date or floor.' };
      if (overrides[key as string] !== undefined) return { ok: false, error: `Set the ${key} or put the source's back, not both.` };
      if (!j.factOverrides?.[key as OverrideKey]) continue;
      overrides[key as string] = null;
      const source = comp.original ? factText(key as OverrideKey, comp.original) : null;
      const was = j.factOverrides[key as OverrideKey]!.value;
      entry(key as string, `${FACT_LABEL[key as OverrideKey]} (StreetEasy's back)`, factText(key as OverrideKey, comp.record), source,
        { edit: { factOverrides: { [key]: was } }, left: null });
    }
  }
  if (Object.keys(overrides).length) body.factOverrides = overrides;
  if (!Object.keys(body).length) return { ok: false, error: 'Nothing to change: the comp already reads that way.' };

  // A refused edit leaves the transcript's transaction usable: the save runs in a savepoint.
  await tx.query('savepoint hubert_edit_comp');
  let actions: Action[];
  try {
    actions = await patchComp(tx, user, reportId, j.reportCompId, body, 'assistant');
    await tx.query('release savepoint hubert_edit_comp');
  } catch (error) {
    await tx.query('rollback to savepoint hubert_edit_comp');
    if (error instanceof HttpError) return { ok: false, error: error.message };
    throw error;
  }
  return { ok: true, summary: trail.map((t) => `${t.label}: ${t.after ?? 'cleared'}`).join('; '), trail, actions };
}

export type LinkAddOutcome = { ok: true; summary: string; trail: TrailEntry[] } | { ok: false; error: string };

/**
 * add_comp_link (Kimani, 2026-10-29, HB-8): a sale Hubert found on the web,
 * added the only way a sale comes in: its StreetEasy link, read like the
 * agent's own paste and within their daily reads. It lands on Sort
 * unconfirmed, counting in nothing, with a note asking the agent to check the
 * link first: the right unit, a sale and not an asking price, current.
 */
export async function addCompLinkForAgent(tx: Queryable, user: SessionUser, reportId: string, input: unknown): Promise<LinkAddOutcome> {
  if (!isObject(input) || typeof input.url !== 'string') return { ok: false, error: 'Send the StreetEasy listing link.' };
  const check = checkListingLink(input.url);
  if (!check.ok) return { ok: false, error: `${check.reason} Only a StreetEasy listing link can add a comp.` };
  const done = await queueReads(tx, user, reportId, [check.url], 'comp', readLimit(user.role), 'hubert');
  if (done.refused.length) return { ok: false, error: done.refused[0]!.reason };
  if (!done.queued.length) return { ok: false, error: 'That link is already in the report, or being read. Point the agent to it on Sort.' };
  const target = titleFromLink(check.url) ?? check.url.replace(/^https:\/\//, '');
  return {
    ok: true,
    summary: `Reading ${target} from StreetEasy. It will show on Sort as a comp to confirm, counting in nothing until the agent confirms it.`,
    trail: [{
      kind: 'link', target, field: 'added', label: 'Added from StreetEasy: check the link, then confirm',
      before: null, after: check.url, url: check.url,
    }],
  };
}
