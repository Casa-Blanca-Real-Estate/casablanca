// copy-to-test (Dispatch 23 item 4, NW-090 b): a real report copied into the
// test user's account, so a session can exercise the screens and the engine on
// real shapes and numbers, never on real words or addresses.
//
// It always applies item 3's allowlist (views.ts) first: the copy is built from
// the redacted read, so no source text reaches this module at all. Then every
// text field is written as a fixed placeholder, never a left-out key the
// client could crash on: a string is [redacted], and a number, a date or a
// closed value the screens switch on is a named constant below, chosen so the
// Gate's checks (checkCall, checkTarget) pass for a practice agent. Comp facts
// that pass (prices, sizes, dates) are copied as they are.
//
// Two transactions: the source is read as the inspect actor, and the copy is
// written as the test user under its own row-level security. Nothing is
// copied, re-encoded or derived from imports.content: the copy's one import is
// a CSV generated from the pass facts and the placeholders. Every comp becomes
// a typed-in comp (source 'agent') on its own property, keyed
// pk1|redacted-<new report>-<n>, so it never attaches to another report's
// property. No geocodes, no coordinates, no messages and no narratives.
import { createHash } from 'node:crypto';
import { EXPORT_SCHEMA, PARSER_VERSION } from '../../engine/index.ts';
import { withActor, type PoolLike } from '../db.ts';
import type { SessionUser } from '../session.ts';
import { SAMPLE_EXPORT } from '../sample/barclay-17l-export.ts';
import { asUser } from '../api/reports.ts';
import { COLUMNS, emailHasher, NUMERIC_FACTS, readView, REDACTED, redact, VIEW_SPECS } from './views.ts';

/** The placeholders the copy writes where the source had text. */
export const PLACEHOLDER = {
  text: REDACTED,
  date: '2000-01-01',
  at: '2000-01-01T00:00:00.000Z',
  /** The Gate's why for a practice agent: at least 100 characters. */
  why: `${REDACTED} — a placeholder why, written by copy-to-test so the Gate's check passes for the practice test user.`,
  callLow: 950_000,
  callHigh: 1_050_000,
  target: 1_000_000,
} as const;

/** A number at a text path, by the field it belongs to: values the engine and the screens accept. */
export const PLACEHOLDER_NUMBERS: Record<string, number> = {
  areaSqft: 1_000, beds: 2, baths: 1, rooms: 3, floor: 5, askingPrice: 1_000_000, commonCharges: 1_000, taxes: 1_000,
  outdoorSqft: 100, yearBuilt: 2000, price: 1_000_000, depositPercent: 10, downPaymentPercent: 20, ratePercent: 6,
  termYears: 30, sellerTarget: 1_000_000, preApprovalAmount: 900_000, listedOrOffered: 1_000_000, contract: 1_000_000,
  sold: 1_000_000, low: PLACEHOLDER.callLow, base: PLACEHOLDER.target, high: PLACEHOLDER.callHigh,
};
const DEFAULT_NUMBER = 1;

/** A closed value at a text path the screens switch on: a constant, never the source's. */
const PLACEHOLDER_CHOICES: Record<string, string> = {
  audience: 'buyer', financing: 'mortgage', kind: 'condo', condition: 'good', laundry: 'none_listed', outdoorKind: 'none',
  owner: 'client', format: 'full', length: 'full', result: 'range',
};
const BOOLEANS = new Set(['centralAir', 'dishwasher', 'fireplace', 'corner', 'newDevelopment', 'sponsorUnit', 'hdfc',
  'preApproved', 'estimate', 'sample', 'approx', 'skipped', 'late', 'useTemplate', 'clientFlowSeen']);
const DATES = new Set(['asOf', 'targetClosing']);
const TIMES = new Set(['at', 'sentAt', 'copiedAt', 'startedAt', 'finishedAt', 'createdAt']);

/**
 * A redacted text subtree as the copy writes it. `field` is the key it sits
 * under; an Entry's `value` takes its placeholder from the entry's own name.
 */
export function placeholders(v: unknown, field = '', parent = ''): unknown {
  if (Array.isArray(v)) return v.map((x) => placeholders(x, field, parent));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, placeholders(x, k, field)]));
  }
  if (v === null) return null;
  const name = field === 'value' ? parent : field;
  if (DATES.has(field)) return PLACEHOLDER.date;
  if (TIMES.has(field)) return PLACEHOLDER.at;
  if (BOOLEANS.has(name)) return false;
  if (name in PLACEHOLDER_NUMBERS) return PLACEHOLDER_NUMBERS[name];
  if (name in PLACEHOLDER_CHOICES) return PLACEHOLDER_CHOICES[name];
  return typeof v === 'number' ? DEFAULT_NUMBER : PLACEHOLDER.text;
}

type Obj = Record<string, any>;

/** The copy's export: one row per comp, from its pass facts, addresses [redacted]. */
export function copyCsv(rows: { status: string; facts: Obj; propertyType: 'condo' | 'coop' }[]): string {
  const header = SAMPLE_EXPORT.csv.slice(0, SAMPLE_EXPORT.csv.indexOf('\r\n')).split(',');
  const status = (s: string) => ({ sold: 'SOLD', in_contract: 'IN CONTRACT', active: 'ACTIVE', off_market: 'OFF MARKET' }[s] ?? 'SOLD');
  const date = (iso: unknown) => {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${m}/${d}/${y}`;
  };
  const num = (f: Obj | undefined) => (typeof f?.value === 'number' ? String(f.value) : '');
  const cell = (c: string) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  const lines = rows.map((r, i) => {
    const byName: Record<string, string> = {
      Address: REDACTED, Unit: `R${i + 1}`, 'Listing Status': status(r.status), 'Status Date': date(r.facts.status_date?.value),
      'Property Type': r.propertyType === 'coop' ? 'Co-op' : 'Condo', Beds: num(r.facts.beds), Baths: num(r.facts.baths),
      Sqft: num(r.facts.area_sqft), Floor: num(r.facts.floor), 'Sale Price': num(r.facts.sale_price),
      'Listing Price': num(r.facts.list_price), 'Common Charges': num(r.facts.common_charges_monthly),
      'Monthly Taxes': num(r.facts.taxes_monthly), 'Maintenance Fees': num(r.facts.maintenance_monthly),
      'Days on Market': num(r.facts.days_on_market),
    };
    return header.map((h) => cell(byName[h] ?? '')).join(',');
  });
  return [header.join(','), ...lines].join('\r\n') + '\r\n';
}

/** A comp's typed-in fields (engine/parser/manual.ts) from its pass facts. */
function manualFields(status: string, facts: Obj): Obj {
  const v = (f: Obj | undefined) => (typeof f?.value === 'number' || typeof f?.value === 'string' ? f.value : undefined);
  const price = v(facts.sale_price) ?? v(facts.list_price);
  const fields: Obj = { address: REDACTED, status };
  const put = (k: string, x: unknown) => { if (x !== undefined) fields[k] = x; };
  put('price', price);
  put('date', v(facts.status_date));
  put('area_sqft', v(facts.area_sqft));
  put('floor', v(facts.floor));
  put('beds', v(facts.beds));
  put('baths', v(facts.baths));
  put('common_charges_monthly', v(facts.common_charges_monthly));
  put('taxes_monthly', v(facts.taxes_monthly));
  put('maintenance_monthly', v(facts.maintenance_monthly));
  return fields;
}

/** Only the facts that pass: the numbers and dates (views.ts NUMERIC_FACTS). */
function passFacts(facts: Obj | null | undefined): Obj {
  const out: Obj = {};
  for (const k of NUMERIC_FACTS) {
    const f = facts?.[k];
    if (f && typeof f === 'object' && (typeof f.value === 'number' || (typeof f.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.value)))) out[k] = f;
  }
  return out;
}

export interface CopyResult {
  reportId: string;
  comps: number;
}

/**
 * Reads the source as the inspect actor (one read-only transaction), redacts
 * it, and writes the copy as the test user (another). The new report's id is
 * the caller's, generated before the audit row was written.
 */
export async function copyToTest(pool: PoolLike, sourceId: string, newId: string, testUser: SessionUser, key: string): Promise<CopyResult> {
  const opts = { text: false, hash: emailHasher(key) };
  const read = await withActor(pool, { kind: 'inspect' }, async (tx) => {
    const report = (await tx.query(
      `select property_type, mode, brief, agent_call, target, state from comp_report.reports where id = $1 and status <> 'deleted'`,
      [sourceId],
    )).rows[0];
    const comps = await readView(tx, 'comps', { reportId: sourceId, days: 7 });
    return { report, comps };
  });
  if (!read.report) throw new Error('copy-to-test: the source report went away');
  const report = redact({ obj: COLUMNS.reports! }, read.report, opts) as Obj;
  const comps = (redact(VIEW_SPECS.comps, read.comps, opts) as { comps: Obj[] }).comps;

  const propertyType: 'condo' | 'coop' = report.property_type === 'coop' ? 'coop' : 'condo';
  const ids = new Map<string, string>();

  return withActor(pool, asUser(testUser), async (tx) => {
    const state: Obj = {};
    const s = (report.state ?? {}) as Obj;
    for (const k of ['intake', 'send', 'outcomes', 'reveal'] as const) if (s[k] !== undefined) state[k] = placeholders(s[k], k);
    if (s.dealTerms) state.dealTerms = placeholders(s.dealTerms, 'dealTerms');
    for (const k of ['reached', 'stepsAt', 'hubertSeen'] as const) if (s[k] !== undefined && s[k] !== REDACTED) state[k] = s[k];

    const call = report.agent_call && typeof report.agent_call === 'object'
      ? { ...(placeholders(report.agent_call) as Obj), low: PLACEHOLDER.callLow, high: PLACEHOLDER.callHigh, skipped: false, note: PLACEHOLDER.why, at: PLACEHOLDER.at }
      : null;
    const target = report.target && typeof report.target === 'object'
      ? { ...(placeholders(report.target) as Obj), price: { value: PLACEHOLDER.target, asOf: PLACEHOLDER.date }, owner: 'client' }
      : null;

    await tx.query(
      `insert into comp_report.reports (id, owner_email, title, property_type, mode, brief, agent_call, target, state)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [newId, testUser.email, PLACEHOLDER.text, propertyType, report.mode === 'practice' ? 'practice' : 'full',
        JSON.stringify(placeholders(report.brief ?? {})), call && JSON.stringify(call), target && JSON.stringify(target), JSON.stringify(state)],
    );

    const csv = copyCsv(comps.map((c) => ({ status: c.evidence_class, facts: passFacts(c.observation?.facts), propertyType })));
    const bytes = Buffer.from(csv, 'utf8');
    await tx.query(
      `insert into comp_report.imports (report_id, filename, format, content, content_sha256, as_of, parser_version, export_schema, comp_count, warnings)
       values ($1, 'copy-to-test.csv', 'csv', $2, $3, $4, $5, $6, $7, '[]')`,
      [newId, bytes, createHash('sha256').update(bytes).digest('hex'), PLACEHOLDER.date, PARSER_VERSION, EXPORT_SCHEMA, comps.length],
    );

    for (const [i, c] of comps.entries()) {
      const facts = passFacts(c.observation?.facts);
      const status = typeof c.evidence_class === 'string' && c.evidence_class !== REDACTED ? c.evidence_class : 'sold';
      const asOf = typeof c.observation?.as_of === 'string' && /^\d{4}-\d{2}-\d{2}/.test(c.observation.as_of)
        ? c.observation.as_of.slice(0, 10) : PLACEHOLDER.date;
      // A plain insert, no on conflict: unique to this copy, never another report's property.
      const propertyId = (await tx.query<{ id: string }>(
        `insert into comp_report.properties (property_key, address) values ($1, $2) returning id`,
        [`pk1|redacted-${newId}-${i + 1}`, REDACTED],
      )).rows[0]!.id;
      const observationId = (await tx.query<{ id: string }>(
        `insert into comp_report.property_observations (property_id, report_id, source, as_of, facts, links, raw, parser_version)
         values ($1, $2, 'agent', $3, $4, '{}', $5, $6) returning id`,
        [propertyId, newId, asOf, JSON.stringify(facts), JSON.stringify(manualFields(status, facts)), PARSER_VERSION],
      )).rows[0]!.id;
      const overrides: Obj = {};
      for (const [k, o] of Object.entries((c.fact_overrides ?? {}) as Obj)) {
        if (o && typeof o === 'object' && o.value !== REDACTED) overrides[k] = { value: o.value, by: testUser.email, at: typeof o.at === 'string' && o.at !== REDACTED ? o.at : PLACEHOLDER.at };
      }
      const compId = (await tx.query<{ id: string }>(
        `insert into comp_report.report_comps (report_id, property_id, observation_id, evidence_class, is_anchor, note, tags, features, fact_overrides, client_line, removed_at, removed_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
        [newId, propertyId, observationId, status, c.is_anchor === true && !c.removed_at, c.note === null ? null : PLACEHOLDER.text,
          (Array.isArray(c.tags) ? c.tags : []).map(() => PLACEHOLDER.text), JSON.stringify(placeholders(c.features ?? {})),
          JSON.stringify(overrides), c.client_line == null ? null : JSON.stringify(placeholders(c.client_line)),
          typeof c.removed_at === 'string' ? c.removed_at : null, typeof c.removed_at === 'string' ? testUser.email : null],
      )).rows[0]!.id;
      ids.set(String(c.id), compId);
      for (const r of (c.reasons ?? []) as Obj[]) {
        await tx.query(
          `insert into comp_report.reasons (report_comp_id, report_id, tier, reason, reason_type, actor) values ($1, $2, $3, $4, $5, $6)`,
          [compId, newId, r.tier, PLACEHOLDER.text, r.reason_type, r.actor],
        );
      }
    }

    // Hubert's rounds are kept by comp: carried over to the copy's comps, as placeholders.
    const byComp = (m: unknown) => (m && typeof m === 'object'
      ? Object.fromEntries(Object.entries(m as Obj).flatMap(([k, x]) => {
        const to = k === 'overview' ? k : ids.get(k);
        return to ? [[to, placeholders(x, k)]] : [];
      }))
      : undefined);
    const extra: Obj = {};
    if (s.reviews !== undefined) extra.reviews = byComp(s.reviews);
    if (s.clientRounds !== undefined) extra.clientRounds = byComp(s.clientRounds);
    if (Object.keys(extra).length) {
      await tx.query(`update comp_report.reports set state = state || $2::jsonb where id = $1`, [newId, JSON.stringify(extra)]);
    }
    return { reportId: newId, comps: comps.length };
  });
}
