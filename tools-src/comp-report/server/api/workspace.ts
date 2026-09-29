// /api/comp-report/workspace — the walkthrough's state for one report (CR-3a).
//   GET   ?report=<uuid>   everything the walkthrough needs to rebuild itself:
//                          the report, the brief, the call, the target, the
//                          intake and deal terms, every import (the file, for
//                          the browser's own parse) and every comp's judgment
//   PATCH {reportId, brief?, call?, target?, state?, sampleData?}
//                          saves what the agent entered. Each field given
//                          replaces the stored one; sampleData can only be set
//
// The owner or an admin can read a report; only its owner can change it.
// Every query is scoped by owner as well as by row-level security (§12).
import type { CompJudgment } from '../../workspace/state.ts';
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

export interface WorkspaceData {
  report: { id: string; title: string; propertyType: 'condo' | 'coop'; ownerEmail: string; sampleData: boolean; updatedAt: string };
  brief: Record<string, unknown>;
  call: Record<string, unknown> | null;
  target: Record<string, unknown> | null;
  state: Record<string, unknown>;
  imports: WorkspaceImport[];
  comps: CompJudgment[];
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

/** Every comp in the report with the agent's judgment of it: tier, anchor, reviewed, and every reason, oldest first. */
export async function loadJudgments(tx: Queryable, reportId: string): Promise<CompJudgment[]> {
  const comps = (await tx.query<{
    id: string; property_key: string; evidence_class: 'sold' | 'in_contract' | 'active'; tier: 'primary' | 'secondary' | 'excluded' | null;
    is_anchor: boolean; reviewed_at: Date | null;
  }>(
    `select rc.id, p.property_key, rc.evidence_class, rc.tier, rc.is_anchor, rc.reviewed_at
       from comp_report.report_comps rc join comp_report.properties p on p.id = rc.property_id
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
    messageCount,
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const MONEY_MAX = 10_000_000_000;
const money = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v < MONEY_MAX;

function checkSize(field: string, value: unknown, max: number) {
  if (JSON.stringify(value).length > max) throw new HttpError(413, 'too_large', `${field} is too large.`);
}

/** The call: a low and a high the agent gives, or a skip. Both recorded with when. */
function checkCall(call: unknown) {
  if (call === null) return;
  if (!isObject(call)) throw new HttpError(400, 'bad_call', 'The call is an object or null.');
  const { low, high, skipped } = call;
  if (skipped !== undefined && typeof skipped !== 'boolean') throw new HttpError(400, 'bad_call', 'skipped is true or false.');
  if (!skipped) {
    if (!money(low) || !money(high)) throw new HttpError(400, 'bad_call', 'Give the call as a low and a high, in whole dollars.');
    if ((low as number) > (high as number)) throw new HttpError(400, 'bad_call', 'The low is above the high.');
  }
  if (typeof call.at !== 'string') throw new HttpError(400, 'bad_call', 'The call needs the time it was given.');
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
    if ('brief' in body) {
      if (!isObject(body.brief)) throw new HttpError(400, 'bad_brief', 'The brief is an object.');
      checkSize('The brief', body.brief, 16 * 1024);
      set('brief', body.brief);
    }
    if ('call' in body) {
      checkCall(body.call);
      set('agent_call', body.call);
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
