// Hubert's trail (Kimani, 2026-10-28): every change Hubert makes shows in the
// chat where he made it, with a way to the field he changed. The entries are
// built here, from his tools' results as they're stored in the transcript, so
// a reload, another tab or a later visit shows the same trail.
//
// A comp's entries come from edit_comp's result (server/hubert-comps.ts),
// which carries them. An email edit's come from the edit itself, so the
// conversations from before the trail show theirs too.
import type { HubertEmailEdit } from './hubert-email.ts';

export interface TrailEntry {
  /** What he changed: a comp on Sort, the email on Send or the home's details; or a sale he found, shown as a card to approve (HB-8). */
  kind: 'comp' | 'email' | 'home' | 'find';
  /** The comp's report comp id, for the jump to its row. */
  compId?: string;
  /** "200 Chambers Street #10A", "The email" or "The home". */
  target: string;
  /** The field, as the screens name it: tier, note, tags, price, size, date, floor, anchor, removed; subject, headline, …, body; the home's intake key (areaSqft, beds, …). */
  field: string;
  /** "Tier", "Next step". */
  label: string;
  /** As it was, and as he left it: short, for the chat. Null for none. */
  before: string | null;
  after: string | null;
  /**
   * Undo on a comp's entry (hubert-plan.md question 5): the agent's own edit
   * that puts the field back as it was, and the field's value as Hubert left
   * it. Undo shows only while the comp still reads that way
   * (workspace/trail-undo.ts): once it's undone, or changed since, it's gone.
   * On a home entry, the edit is the intake's entries as they were
   * (workspace/home-edit.ts), on the same rule.
   */
  undo?: { edit: Record<string, unknown>; left: unknown };
  /** A sale he found: its StreetEasy link, for the agent to open and check before approving. */
  url?: string;
}

/** A source Hubert read on the web (web_search, read_page): shown under his reply, with its link. */
export interface TrailSource {
  title: string;
  url: string;
}

const EMAIL_LABEL: Record<string, string> = {
  subject: 'Subject', headline: 'Headline', chosen: 'How you chose the comps', consider: 'Things to consider',
  next_step: 'Next step', signed: 'Signed',
};

const short = (text: string, n = 140) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);

/** An email edit as trail entries: one per field, one for the body's passages. */
export function emailTrail(edit: HubertEmailEdit): TrailEntry[] {
  const out: TrailEntry[] = edit.changes.map((c) => ({
    kind: 'email', target: 'The email', field: c.field, label: EMAIL_LABEL[c.field] ?? c.field,
    before: null, after: c.text ? short(c.text) : null,
  }));
  if (edit.bodyEdits.length) {
    const first = edit.bodyEdits[0]!;
    out.push({
      kind: 'email', target: 'The email', field: 'body',
      label: edit.bodyEdits.length === 1 ? 'Body' : `Body (${edit.bodyEdits.length} passages)`,
      before: short(first.find), after: first.replace ? short(first.replace) : null,
    });
  }
  return out;
}

/** The trail and sources in one tool result, as stored. Nothing for an error or a read-only tool. */
export function trailOf(name: string, result: Record<string, unknown>): { changes: TrailEntry[]; sources: TrailSource[] } {
  const none = { changes: [], sources: [] };
  if (result.is_error || typeof result.content !== 'string') return none;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(result.content) as Record<string, unknown>;
  } catch {
    return none;
  }
  if (!parsed || typeof parsed !== 'object') return none;
  if (name === 'edit_email' && parsed.edit) return { changes: emailTrail(parsed.edit as HubertEmailEdit), sources: [] };
  if ((name === 'edit_comp' || name === 'show_comp_link' || name === 'set_home_fact') && Array.isArray(parsed.trail)) return { changes: parsed.trail as TrailEntry[], sources: [] };
  if ((name === 'web_search' || name === 'read_page') && Array.isArray(parsed.results)) {
    const sources = (parsed.results as Array<Record<string, unknown>>)
      .filter((r) => typeof r.url === 'string' && /^https:\/\//.test(r.url as string))
      .map((r) => ({ title: typeof r.title === 'string' && r.title ? short(r.title, 90) : (r.url as string), url: r.url as string }));
    return { changes: [], sources };
  }
  return none;
}
