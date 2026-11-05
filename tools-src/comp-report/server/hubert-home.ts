// Hubert and the home's details (hubert-plan.md "Tools next" 3): the agent
// dictates them, in the New report window or later, and set_home_fact puts
// them in. Only what the agent said: he never fills a detail from his own
// reading, the web or a listing's text.
//
// Like the email, the intake is the browser's: it lives in reports.state,
// which the workspace's autosave writes whole. So nothing is written here: the
// edit is checked against the intake as last saved (the chat saves before
// each request), and handed to the agent's open screen through the turn's
// stream (api/turn.ts), which writes it the way the agent's own typing would.
// Each changed field is one entry of the trail, with Show and Undo.
import { LAUNDRY_STATES } from '../engine/index.ts';
import { CONDITION_TO_LABEL, FEATURE_GROUPS, OUTDOOR_TO_LABEL } from '../workspace/features.ts';
import type { HubertHomeEdit } from '../workspace/home-edit.ts';
import type { Entry, Intake } from '../workspace/state.ts';
import type { Queryable } from './db.ts';
import type { TrailEntry } from './hubert-trail.ts';
import { newYorkToday } from './links.ts';

type Kind = 'number' | 'text' | 'yesno' | 'choice' | 'list';

interface Field {
  label: string;
  kind: Kind;
  /** A number's rule, in the words the agent will hear if it's broken. */
  check?: (n: number) => boolean;
  says?: string;
  /** A choice's stored values and their labels; a list's options. */
  choices?: Record<string, string>;
  options?: readonly string[];
  max?: number;
  unit?: 'sqft' | 'money' | 'monthly';
}

const whole = (lo: number, hi: number) => (n: number) => Number.isInteger(n) && n >= lo && n <= hi;
const halves = (lo: number, hi: number) => (n: number) => Number.isInteger(n * 2) && n >= lo && n <= hi;
const options = (...keys: string[]) => FEATURE_GROUPS.filter((g) => keys.includes(g.key)).flatMap((g) => g.options);

const LAUNDRY_LABEL: Record<(typeof LAUNDRY_STATES)[number], string> = {
  installed: 'Washer/dryer in the unit', permitted: 'Allowed, none installed', prohibited: 'Not allowed', none_listed: 'None in the unit (not known if allowed)',
};

/** What he may set: the details screen's fields, minus the home's address (step 1 owns it) and its type. */
export const HOME_FIELDS = {
  areaSqft: { label: 'Interior size', kind: 'number', check: whole(1, 100_000), says: 'whole square feet above zero', unit: 'sqft' },
  beds: { label: 'Beds', kind: 'number', check: whole(0, 30), says: 'a whole number' },
  baths: { label: 'Baths', kind: 'number', check: halves(0, 30), says: 'a number, halves allowed' },
  rooms: { label: 'Rooms', kind: 'number', check: halves(0, 60), says: 'a number, halves allowed' },
  floor: { label: 'Floor', kind: 'number', check: whole(-5, 200), says: 'a whole number' },
  askingPrice: { label: 'Asking price', kind: 'number', check: whole(1, 1_000_000_000), says: 'whole dollars above zero', unit: 'money' },
  commonCharges: { label: 'Common charges or maintenance', kind: 'number', check: whole(0, 1_000_000), says: 'whole dollars a month', unit: 'monthly' },
  taxes: { label: 'Taxes', kind: 'number', check: whole(0, 1_000_000), says: 'whole dollars a month', unit: 'monthly' },
  outdoorSqft: { label: 'Outdoor size', kind: 'number', check: whole(1, 100_000), says: 'whole square feet above zero', unit: 'sqft' },
  yearBuilt: { label: 'Year built', kind: 'number', check: (n) => whole(1700, Number(newYorkToday().slice(0, 4)) + 5)(n), says: 'a year, like 1929' },
  neighborhood: { label: 'Neighborhood', kind: 'text', max: 80 },
  notes: { label: 'Notes', kind: 'text', max: 4000 },
  dishwasher: { label: 'Dishwasher', kind: 'yesno' },
  centralAir: { label: 'Central air', kind: 'yesno' },
  fireplace: { label: 'Working fireplace', kind: 'yesno' },
  corner: { label: 'Corner unit', kind: 'yesno' },
  newDevelopment: { label: 'New development', kind: 'yesno' },
  laundry: { label: 'Washer/dryer', kind: 'choice', choices: LAUNDRY_LABEL },
  outdoorKind: { label: 'Private outdoor space', kind: 'choice', choices: OUTDOOR_TO_LABEL },
  condition: { label: 'Unit condition', kind: 'choice', choices: CONDITION_TO_LABEL },
  views: { label: 'Views', kind: 'list', options: options('views') },
  exposures: { label: 'Exposure', kind: 'list', options: options('exposure') },
  building: { label: 'The building’s features', kind: 'list', options: options('building', 'wellness', 'shared_outdoor') },
  policies: { label: 'Policies', kind: 'list', options: options('policies') },
} satisfies Record<string, Field> as Record<string, Field>;

export const HOME_FIELD_KEYS = Object.keys(HOME_FIELDS) as (keyof Intake)[];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const short = (text: string, n = 140) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** A value as the chat shows it: "1,240 sq ft", "$1,250,000", "$2,100 a month", "Yes", "Doorman, Gym". */
export function homeValueText(field: Field, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (field.kind === 'number') {
    const n = Number(value).toLocaleString('en-US');
    return field.unit === 'sqft' ? `${n} sq ft` : field.unit === 'money' ? `$${n}` : field.unit === 'monthly' ? `$${n} a month` : n;
  }
  if (field.kind === 'yesno') return value ? 'Yes' : 'No';
  if (field.kind === 'choice') return field.choices?.[String(value)] ?? String(value);
  if (field.kind === 'list') return Array.isArray(value) ? (value.length ? value.join(', ') : null) : String(value);
  return short(String(value));
}

/** "1,240", "$1.25M"-free: a dictated number as digits, with commas, a dollar sign or "sq ft" allowed around it. */
function numberFrom(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[$,\s]/g, '').replace(/(sqft|sq\.?ft\.?|ft²|ft|squarefeet|amonth|\/mo|permonth)$/, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

function choiceFrom(field: Field, raw: string): string | null {
  const want = norm(raw);
  for (const [value, label] of Object.entries(field.choices ?? {})) {
    if (norm(value) === want || norm(label) === want) return value;
  }
  return null;
}

function optionFrom(field: Field, raw: string): string | null {
  const want = norm(raw);
  return field.options?.find((o) => norm(o) === want) ?? null;
}

export type HomeEditOutcome = { ok: true; edit: HubertHomeEdit; trail: TrailEntry[]; summary: string } | { ok: false; error: string };

/** set_home_fact: the details the agent dictated, checked against the intake as last saved. Nothing is written here. */
export async function setHomeFacts(tx: Queryable, reportId: string, input: unknown): Promise<HomeEditOutcome> {
  if (!isObject(input) || !Array.isArray(input.changes) || !input.changes.length) {
    return { ok: false, error: 'Send changes: a list, one per detail the agent named.' };
  }
  if (input.changes.length > HOME_FIELD_KEYS.length) return { ok: false, error: 'At most one change per detail.' };
  const row = (await tx.query<{ intake: Intake | null; sent: boolean }>(
    `select state -> 'intake' as intake, state -> 'send' ->> 'sentAt' is not null as sent from comp_report.reports where id = $1`, [reportId],
  )).rows[0];
  if (!row) return { ok: false, error: 'No such report.' };
  if (row.sent) return { ok: false, error: 'The agent marked this report’s email as sent. They reopen it on Done before its details change.' };
  const intake: Intake = row.intake ?? {};
  const asOf = newYorkToday();
  const set: HubertHomeEdit['set'] = {};
  const trail: TrailEntry[] = [];
  const was = (key: keyof Intake) => (intake[key] ?? null) as Entry<unknown> | null;

  for (const c of input.changes) {
    if (!isObject(c) || typeof c.field !== 'string' || !(c.field in HOME_FIELDS)) {
      return { ok: false, error: `Each change names a field: ${HOME_FIELD_KEYS.join(', ')}.` };
    }
    const key = c.field as keyof Intake;
    const f = HOME_FIELDS[key]!;
    if (key in set) return { ok: false, error: `Two changes to ${key}: send one.` };
    const value = typeof c.value === 'string' ? c.value : undefined;
    const add = Array.isArray(c.add) ? c.add.filter((x): x is string => typeof x === 'string') : [];
    const remove = Array.isArray(c.remove) ? c.remove.filter((x): x is string => typeof x === 'string') : [];
    if (c.estimate !== undefined && f.kind !== 'number') return { ok: false, error: `Only a number can be an estimate, not the ${f.label.toLowerCase()}.` };
    if ((add.length || remove.length) && f.kind !== 'list' && key !== 'notes') {
      return { ok: false, error: `add and remove are for lists (views, exposures, building, policies) and the notes. Give the ${f.label.toLowerCase()} as value.` };
    }
    if (value === undefined && !add.length && !remove.length) return { ok: false, error: `Give the ${f.label.toLowerCase()} as value (an empty value clears it).` };

    const before = was(key);
    let next: unknown;
    if (value !== undefined && !value.trim() && !add.length) {
      next = null; // an empty value clears it
    } else if (f.kind === 'number') {
      const n = numberFrom(value ?? '');
      if (n === null || !f.check!(n)) return { ok: false, error: `The ${f.label.toLowerCase()} is ${f.says}.` };
      next = n;
    } else if (f.kind === 'text') {
      let text = value?.trim() ?? '';
      // Notes: "add to my notes" goes under what's there, never over it.
      if (key === 'notes' && add.length) text = [String(before?.value ?? '').trim(), ...add.map((a) => a.trim())].filter(Boolean).join('\n');
      if (text.length > f.max!) return { ok: false, error: `The ${f.label.toLowerCase()} is too long (${f.max} characters at most).` };
      next = text;
    } else if (f.kind === 'yesno') {
      const v = norm(value ?? '');
      if (['yes', 'true', 'y'].includes(v)) next = true;
      else if (['no', 'false', 'n'].includes(v)) next = false;
      else return { ok: false, error: `The ${f.label.toLowerCase()} is yes or no (or empty for not known).` };
    } else if (f.kind === 'choice') {
      const v = choiceFrom(f, value ?? '');
      if (!v) return { ok: false, error: `The ${f.label.toLowerCase()} is one of: ${Object.values(f.choices!).join('; ')}.` };
      next = v;
    } else {
      const pick = (list: string[]) => {
        const out: string[] = [];
        for (const raw of list) {
          const o = optionFrom(f, raw);
          if (!o) return `“${raw}” isn’t on the ${f.label.toLowerCase()} list: ${f.options!.join(', ')}.`;
          if (!out.includes(o)) out.push(o);
        }
        return out;
      };
      const base = value !== undefined ? pick(value.split(/\s*,\s*/).filter(Boolean)) : ((before?.value as string[] | undefined) ?? []);
      if (typeof base === 'string') return { ok: false, error: base };
      const plus = pick(add), minus = pick(remove);
      if (typeof plus === 'string') return { ok: false, error: plus };
      if (typeof minus === 'string') return { ok: false, error: minus };
      const list = [...base.filter((o) => !minus.includes(o)), ...plus.filter((o) => !base.includes(o))];
      next = list.length ? list : null;
    }

    const estimate = f.kind === 'number' && c.estimate === true;
    if (JSON.stringify(next) === JSON.stringify(before?.value ?? null) && Boolean(before?.estimate) === estimate) continue;
    set[key] = next === null ? null : ({ value: next, asOf, ...(estimate ? { estimate: true } : {}) } as Intake[keyof Intake]);
    const undoSet: HubertHomeEdit['set'] = { [key]: before };
    // As the pickers do: no outdoor space, no outdoor size; and the pickers' exposure replaces CR-3's line of text.
    if (key === 'outdoorKind' && (next === null || next === 'none') && intake.outdoorSqft) {
      set.outdoorSqft = null;
      undoSet.outdoorSqft = intake.outdoorSqft;
    }
    if (key === 'exposures' && intake.exposure) {
      set.exposure = null;
      undoSet.exposure = intake.exposure;
    }
    const after = homeValueText(f, next);
    trail.push({
      kind: 'home', target: 'The home', field: key, label: estimate ? `${f.label} (your estimate)` : f.label,
      before: homeValueText(f, before?.value), after, undo: { edit: undoSet, left: next },
    });
  }
  if (!trail.length) return { ok: false, error: 'Nothing to change: the home already reads that way.' };
  return { ok: true, edit: { set }, trail, summary: trail.map((t) => `${t.label}: ${t.after ?? 'cleared'}`).join('; ') };
}

/** The edit inside a set_home_fact tool result, for the turn to hand to the agent's screen. */
export function homeEditFromResult(block: Record<string, unknown>): HubertHomeEdit | null {
  if (block.is_error || typeof block.content !== 'string') return null;
  try {
    const parsed = JSON.parse(block.content) as { edit?: HubertHomeEdit };
    return parsed.edit ?? null;
  } catch {
    return null;
  }
}

/** The home's details as the agent has entered them, in words, for get_view. */
export function homeDetailsOf(intake: Intake | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of HOME_FIELD_KEYS) {
    const e = intake?.[key] as Entry<unknown> | undefined;
    // The notes whole: he reads them (NOTES_TIP); the trail's text is short.
    const text = e ? (key === 'notes' ? String(e.value) : homeValueText(HOME_FIELDS[key]!, e.value)) : null;
    if (text) out[key] = `${text}${e!.estimate ? ' (the agent’s estimate)' : ''}${e!.from === 'listing' ? ' (from its StreetEasy page)' : ''}`;
  }
  return out;
}
