// /api/comp-report/workspace — the walkthrough's state for one report (CR-3a).
//   GET   ?report=<uuid>   everything the walkthrough needs to rebuild itself:
//                          the report, the brief, the call, the target, the
//                          intake and deal terms, every import (the file, for
//                          the browser's own parse), every comp's judgment and
//                          where its record comes from, and the link reads
//   PATCH {reportId, title?, brief?, call?, target?, state?, sampleData?, propertyType?}
//                          saves what the agent entered. Each field given
//                          replaces the stored one; sampleData can only be set;
//                          propertyType is the Co-op/Condo toggle (Dispatch 14).
//                          The call follows the Gate's rule for the agent's level
//
// The owner or an admin can read a report; only its owner can change it.
// Every query is scoped by owner as well as by row-level security (§12).
import { cleanListingExtract, cleanPhotoUrls, type ParseWarning } from '../../engine/index.ts';
import { loadGeocodes, reportBuildings, type GeocodeView } from '../buildings.ts';
import type { CompJudgment, CompSource } from '../../workspace/state.ts';
import { withActor, type Queryable } from '../db.ts';
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { requireUser, type AuthDeps, type SessionUser } from '../session.ts';
import { asUser, requirePool } from './reports.ts';

export interface WorkspaceImport {
  id: string;
  filename: string | null;
  format: 'csv' | 'xlsx';
  asOf: string;
  parserVersion: string;
  exportSchema: string;
  compCount: number;
  warnings: unknown[];
  sample: boolean;
  createdAt: string;
  createdBy: string;
  contentBase64: string;
}

/** A StreetEasy page the agent asked the tool to read, as the browser shows it (links.ts). */
export interface LinkReadView {
  id: string;
  purpose: 'comp' | 'subject';
  url: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  error: string | null;
  errorMessage: string | null;
  /** The comp it made, once done. */
  reportCompId: string | null;
  asOf: string | null;
  /** What the page said: kept for the home (its details fill from it) and for a failed read ("type it in" starts from it). */
  extract: Record<string, unknown> | null;
  warnings: ParseWarning[];
  confirmedAt: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface WorkspaceData {
  report: { id: string; title: string; propertyType: 'condo' | 'coop'; ownerEmail: string; sampleData: boolean; updatedAt: string };
  brief: Record<string, unknown>;
  call: Record<string, unknown> | null;
  target: Record<string, unknown> | null;
  state: Record<string, unknown>;
  imports: WorkspaceImport[];
  comps: CompJudgment[];
  /** Every link read not cleared away: the home's, and the comps' (§6.2). */
  reads: LinkReadView[];
  /** Where the home and each comp's building stand, for distance (Dispatch 11). */
  geocodes: GeocodeView[];
  /** The assistant's transcript so far, as a count: the step rail marks step 5 by it. */
  messageCount: number;
}

const iso = (d: Date | string) => new Date(d).toISOString();

/** The report, or 404. `write` insists on ownership: admins can read any report, but change only their own. */
export async function reportFor(tx: Queryable, user: SessionUser, reportId: string, write: boolean) {
  const { rows } = await tx.query<{ id: string; owner_email: string }>(
    `select id, owner_email from comp_report.reports where id = $1 and (owner_email = $2 or $3)`,
    [reportId, user.email, !write && user.role === 'admin'],
  );
  if (!rows[0]) throw new HttpError(404, 'not_found', 'No such report.');
  return rows[0];
}

/**
 * Every comp in the report with the agent's judgment of it — tier, anchor,
 * reviewed, every reason oldest first — and where its record comes from: the
 * comp's newest observation (§12). An export's comp is read from the stored
 * file; a link's from what its page said; a typed-in one from what was typed.
 */
export async function loadJudgments(tx: Queryable, reportId: string): Promise<CompJudgment[]> {
  const comps = (await tx.query<{
    id: string; property_key: string; evidence_class: CompJudgment['evidenceClass']; tier: 'primary' | 'secondary' | 'excluded' | null;
    is_anchor: boolean; reviewed_at: Date | null;
    source: 'se_export' | 'se_pdf' | 'listing' | 'agent' | null; import_id: string | null; raw: unknown; as_of: string | null; links: string[] | null;
    read_id: string | null; confirmed_at: Date | null;
    note: string | null; tags: string[] | null; features: Record<string, string[]> | null; removed_at: Date | null;
    fact_overrides: CompJudgment['factOverrides'] | null;
  }>(
    `select rc.id, p.property_key, rc.evidence_class, rc.tier, rc.is_anchor, rc.reviewed_at,
            rc.note, rc.tags, rc.features, rc.removed_at, rc.fact_overrides,
            o.source, o.import_id, o.raw, o.as_of::text as as_of, o.links,
            lr.id as read_id, lr.confirmed_at
       from comp_report.report_comps rc
       join comp_report.properties p on p.id = rc.property_id
       left join comp_report.property_observations o on o.id = rc.observation_id
       left join comp_report.link_reads lr on lr.observation_id = rc.observation_id and lr.report_id = rc.report_id
      where rc.report_id = $1 order by rc.created_at, rc.id`,
    [reportId],
  )).rows;

  const reasons = (await tx.query<{
    report_comp_id: string; tier: CompJudgment['tier'] & string; reason: string; reason_type: CompJudgment['reasons'][number]['reasonType'];
    actor: string; created_at: Date; created_by: string; sample: boolean;
  }>(
    `select report_comp_id, tier, reason, reason_type, actor, created_at, created_by, sample
       from comp_report.reasons where report_id = $1 order by id`,
    [reportId],
  )).rows;

  const source = (c: (typeof comps)[number]): CompSource => {
    if (c.source === 'listing' && c.raw && c.as_of) {
      return { kind: 'listing', extract: cleanExtract(c.raw), asOf: c.as_of, url: c.links?.[0] ?? null, readId: c.read_id, confirmedAt: c.confirmed_at ? iso(c.confirmed_at) : null };
    }
    if (c.source === 'agent' && c.raw && c.as_of) return { kind: 'manual', fields: c.raw, asOf: c.as_of };
    return { kind: 'export', importId: c.import_id };
  };

  return comps.map((c) => ({
    reportCompId: c.id,
    propertyKey: c.property_key,
    evidenceClass: c.evidence_class,
    tier: c.tier,
    anchor: c.is_anchor,
    reviewedAt: c.reviewed_at ? iso(c.reviewed_at) : null,
    reasons: reasons
      .filter((r) => r.report_comp_id === c.id)
      .map((r) => ({ tier: r.tier, reason: r.reason, reasonType: r.reason_type, actor: r.actor, at: iso(r.created_at), by: r.created_by, sample: r.sample })),
    source: source(c),
    note: c.note,
    tags: c.tags ?? [],
    features: c.features ?? {},
    removedAt: c.removed_at ? iso(c.removed_at) : null,
    factOverrides: c.fact_overrides ?? {},
    photos: c.source === 'listing' ? listingPhotos(c.raw) : [],
  }));
}

/**
 * A stored extract as it leaves the server: its photos cleaned again
 * (cleanListingExtract), so one stored before Dispatch 16 cleaned them on the
 * way in, with an off-list host or a userinfo URL, never reaches the browser.
 */
function cleanExtract(raw: unknown): unknown {
  return isObject(raw) ? cleanListingExtract(raw) : raw;
}

/**
 * A listing comp's photos for Sort's card (NW-020 a, Dispatch 20): from the
 * stored extract, hero first, through cleanPhotoUrls once more: https on
 * StreetEasy's image hosts only, at most 8. Linked, never fetched here.
 */
export function listingPhotos(raw: unknown): string[] {
  if (!isObject(raw)) return [];
  return cleanPhotoUrls([raw['heroImageUrl'], ...(Array.isArray(raw['photos']) ? raw['photos'] : [])]);
}

/** The report's link reads, oldest first, less the failed ones the agent cleared away. */
export async function loadReads(tx: Queryable, reportId: string): Promise<LinkReadView[]> {
  const rows = (await tx.query<{
    id: string; purpose: LinkReadView['purpose']; url: string; status: LinkReadView['status']; error: string | null; error_message: string | null;
    report_comp_id: string | null; as_of: string | null; extract: Record<string, unknown> | null; warnings: ParseWarning[] | null;
    confirmed_at: Date | null; created_at: Date; started_at: Date | null; finished_at: Date | null;
  }>(
    `select id, purpose, url, status, error, error_message, report_comp_id, as_of::text as as_of,
            case when purpose = 'subject' or status = 'failed' then extract end as extract,
            warnings, confirmed_at, created_at, started_at, finished_at
       from comp_report.link_reads
      where report_id = $1 and dismissed_at is null
      order by seq`,
    [reportId],
  )).rows;
  const at = (d: Date | null) => (d ? iso(d) : null);
  return rows.map((r) => ({
    id: r.id, purpose: r.purpose, url: r.url, status: r.status, error: r.error, errorMessage: r.error_message,
    reportCompId: r.report_comp_id, asOf: r.as_of, extract: r.extract ? cleanListingExtract(r.extract) : null, warnings: r.warnings ?? [],
    confirmedAt: at(r.confirmed_at), createdAt: iso(r.created_at), startedAt: at(r.started_at), finishedAt: at(r.finished_at),
  }));
}

export async function loadWorkspace(tx: Queryable, user: SessionUser, reportId: string): Promise<WorkspaceData> {
  await reportFor(tx, user, reportId, false);
  const report = (await tx.query<{
    id: string; title: string; property_type: 'condo' | 'coop'; owner_email: string; sample_data: boolean; updated_at: Date;
    brief: Record<string, unknown>; agent_call: Record<string, unknown> | null; target: Record<string, unknown> | null; state: Record<string, unknown>;
  }>(
    `select id, title, property_type, owner_email, sample_data, updated_at, brief, agent_call, target, state
       from comp_report.reports where id = $1`,
    [reportId],
  )).rows[0]!;

  const imports = (await tx.query<{
    id: string; filename: string | null; format: 'csv' | 'xlsx'; as_of: Date | string; parser_version: string; export_schema: string;
    comp_count: number; warnings: unknown[]; sample: boolean; created_at: Date; created_by: string; content: Buffer;
  }>(
    `select id, filename, format, as_of::text as as_of, parser_version, export_schema, comp_count, warnings, sample,
            created_at, created_by, content
       from comp_report.imports where report_id = $1 order by created_at, id`,
    [reportId],
  )).rows;

  const messageCount = Number((await tx.query<{ n: string }>(
    `select count(*) as n from comp_report.messages where report_id = $1 and role = 'user'`,
    [reportId],
  )).rows[0]?.n ?? 0);

  return {
    report: {
      id: report.id, title: report.title, propertyType: report.property_type, ownerEmail: report.owner_email,
      sampleData: report.sample_data, updatedAt: iso(report.updated_at),
    },
    brief: report.brief ?? {},
    call: report.agent_call,
    target: report.target,
    state: report.state ?? {},
    imports: imports.map((i) => ({
      id: i.id, filename: i.filename, format: i.format, asOf: String(i.as_of), parserVersion: i.parser_version,
      exportSchema: i.export_schema, compCount: i.comp_count, warnings: i.warnings, sample: i.sample,
      createdAt: iso(i.created_at), createdBy: i.created_by, contentBase64: Buffer.from(i.content).toString('base64'),
    })),
    comps: await loadJudgments(tx, reportId),
    reads: await loadReads(tx, reportId),
    geocodes: await loadGeocodes(tx, (await reportBuildings(tx, reportId)).map((b) => b.key)),
    messageCount,
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const MONEY_MAX = 10_000_000_000;
const money = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v < MONEY_MAX;

function checkSize(field: string, value: unknown, max: number) {
  if (JSON.stringify(value).length > max) throw new HttpError(413, 'too_large', `${field} is too large.`);
}

/** The Gate's why, for an agent still in practice (D-11, Dispatch 14): at least this many characters. */
export const PRACTICE_WHY_MIN = 100;

/**
 * The call: a low and a high the agent gives, or a skip. Both recorded with
 * when. The Gate (Dispatch 14): an agent still in practice can't skip, and
 * gives a why of at least 100 characters; a graduated (full) agent may skip.
 */
function checkCall(call: unknown, capability: 'practice' | 'full') {
  if (call === null) return;
  if (!isObject(call)) throw new HttpError(400, 'bad_call', 'The call is an object or null.');
  const { low, high, skipped } = call;
  if (skipped !== undefined && typeof skipped !== 'boolean') throw new HttpError(400, 'bad_call', 'skipped is true or false.');
  if (!skipped) {
    if (!money(low) || !money(high)) throw new HttpError(400, 'bad_call', 'Give the call as a low and a high, in whole dollars.');
    if ((low as number) > (high as number)) throw new HttpError(400, 'bad_call', 'The low is above the high.');
  }
  if (typeof call.at !== 'string') throw new HttpError(400, 'bad_call', 'The call needs the time it was given.');
  if (call.note !== undefined && (typeof call.note !== 'string' || call.note.length > 2000)) {
    throw new HttpError(400, 'bad_call', 'Keep the why under 2,000 characters.');
  }
  if (capability === 'practice') {
    if (skipped) throw new HttpError(400, 'gate_required', 'Give your low, high and why: the comps show after that.');
    const why = typeof call.note === 'string' ? call.note.trim() : '';
    if (why.length < PRACTICE_WHY_MIN) throw new HttpError(400, 'gate_why', `Say why in at least ${PRACTICE_WHY_MIN} characters.`);
  }
}

function checkTarget(target: unknown) {
  if (target === null) return;
  if (!isObject(target) || !isObject(target.price) || !money(target.price.value)) {
    throw new HttpError(400, 'bad_target', 'Give the target as a price in whole dollars.');
  }
}

export function handleWorkspace(req: Request, deps: AuthDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET', 'PATCH');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);

    if (req.method === 'GET') {
      const reportId = new URL(req.url).searchParams.get('report') ?? '';
      if (!UUID.test(reportId)) throw new HttpError(400, 'bad_report', 'Which report?');
      return json(await withActor(pool, asUser(user), (tx) => loadWorkspace(tx, user, reportId)));
    }

    const body = await readJsonObject(req, 256 * 1024);
    const reportId = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
    if (!reportId) throw new HttpError(400, 'bad_report', 'Which report?');

    const sets: string[] = [];
    const values: unknown[] = [reportId, user.email];
    const set = (column: string, value: unknown) => {
      values.push(value === null ? null : JSON.stringify(value));
      sets.push(`${column} = $${values.length}::jsonb`);
    };
    if ('title' in body) {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (title.length < 1 || title.length > 200) throw new HttpError(400, 'bad_title', 'Give the report a title of up to 200 characters.');
      values.push(title);
      sets.push(`title = $${values.length}`);
    }
    if ('brief' in body) {
      if (!isObject(body.brief)) throw new HttpError(400, 'bad_brief', 'The brief is an object.');
      checkSize('The brief', body.brief, 16 * 1024);
      set('brief', body.brief);
    }
    if ('call' in body) {
      checkCall(body.call, user.capability);
      set('agent_call', body.call);
    }
    if ('propertyType' in body) {
      if (body.propertyType !== 'condo' && body.propertyType !== 'coop') throw new HttpError(400, 'bad_property_type', 'A co-op or a condo.');
      values.push(body.propertyType);
      sets.push(`property_type = $${values.length}`);
    }
    if ('target' in body) {
      checkTarget(body.target);
      set('target', body.target);
    }
    if ('state' in body) {
      if (!isObject(body.state)) throw new HttpError(400, 'bad_state', 'The state is an object.');
      checkSize('The intake', body.state, 64 * 1024);
      set('state', body.state);
    }
    if (body.sampleData === true) sets.push('sample_data = true');
    if (!sets.length) throw new HttpError(400, 'nothing_to_save', 'Nothing to save.');

    const updatedAt = await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, true);
      const { rows } = await tx.query<{ updated_at: Date }>(
        `update comp_report.reports set ${sets.join(', ')} where id = $1 and owner_email = $2 returning updated_at`,
        values,
      );
      return rows[0]?.updated_at;
    });
    if (!updatedAt) throw new HttpError(404, 'not_found', 'No such report.');
    return json({ saved: true, updatedAt: iso(updatedAt) });
  });
}
