// /api/comp-report/reports
//   GET              the signed-in user's own reports, newest first (200 at most)
//   GET  ?archived=1 the ones they archived
//   GET  ?id=<uuid>  one report: the owner's, or any for an admin or mentor (read-only)
//   GET  ?scope=all[&owner=<email>]  admins and mentors: everyone's (NW-088 a); ignored for anyone else
//   GET  ?scope=all&mentees=1        a mentor: only their mentees' (api/mentees.ts)
//   POST {title, propertyType?}  create a report
//   PATCH {id, action: 'archive' | 'restore' | 'delete'}  the owner's own report only;
//                    delete is for sample reports (Kimani, 2026-10-22), and is final
//
// Every query names its owner explicitly as well as running under row-level
// security (§12: scoped both ways).
import { withActor, type PoolLike } from '../db.ts';
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { normalizeEmail } from '../access.ts';
import { requireUser, type AuthDeps, type SessionUser } from '../session.ts';
import { readsEveryReport, reportFor } from './workspace.ts';

export interface ReportSummary {
  id: string;
  title: string;
  propertyType: 'condo' | 'coop';
  mode: 'practice' | 'full';
  status: 'active' | 'archived' | 'deleted';
  ownerEmail: string;
  /** The owner's name, on Everyone's reports (null when Identity gave none). */
  ownerName?: string | null;
  /** Filled with sample data at some point: badged as a sample report (Dispatch 07). */
  sampleData: boolean;
  createdAt: string;
  updatedAt: string;
  /** The reports list (Dispatch 14): the client's name, the side, and where the report has got to. */
  client?: string | null;
  side?: 'buyer' | 'seller' | null;
  stage?: ReportStage;
  /** Comps still without a tier, while the report is on Sort. */
  unsorted?: number;
}

export type ReportStage = 'sort' | 'findings' | 'send' | 'sent';

interface ReportRow {
  id: string;
  title: string;
  property_type: 'condo' | 'coop';
  mode: 'practice' | 'full';
  status: 'active' | 'archived' | 'deleted';
  owner_email: string;
  sample_data: boolean;
  created_at: Date;
  updated_at: Date;
  client?: string | null;
  side?: 'buyer' | 'seller' | null;
  stage?: ReportStage;
  unsorted?: number | string;
  owner_name?: string | null;
}

const COLUMNS = 'id, title, property_type, mode, status, owner_email, sample_data, created_at, updated_at';

function summary(r: ReportRow): ReportSummary {
  return {
    id: r.id,
    title: r.title,
    propertyType: r.property_type,
    mode: r.mode,
    status: r.status,
    ownerEmail: r.owner_email,
    sampleData: r.sample_data,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    ...(r.owner_name !== undefined ? { ownerName: r.owner_name } : {}),
    ...(r.stage ? { client: r.client ?? null, side: r.side ?? null, stage: r.stage, unsorted: Number(r.unsorted ?? 0) } : {}),
  };
}

export function requirePool(deps: AuthDeps): PoolLike {
  if (!deps.pool) {
    throw new HttpError(503, 'database_not_configured', 'Saved reports need the database, which isn\'t set up yet.');
  }
  return deps.pool;
}

export const asUser = (user: SessionUser) => ({ kind: 'user' as const, email: user.email, role: user.role });

export function handleReports(req: Request, deps: AuthDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET', 'POST', 'PATCH');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);

    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('id');
      if (id !== null) {
        if (!UUID.test(id)) throw new HttpError(400, 'bad_id');
        const report = await withActor(pool, asUser(user), async (tx) => {
          await reportFor(tx, user, id, false);
          const { rows } = await tx.query<ReportRow>(`select ${COLUMNS} from comp_report.reports where id = $1`, [id]);
          return rows[0];
        });
        if (!report) throw new HttpError(404, 'not_found', 'No such report.');
        return json({ report: summary(report) });
      }
      const params = new URL(req.url).searchParams;
      const status = params.get('archived') === '1' ? 'archived' : 'active';
      // Everyone's reports (NW-088 a, NB-23 A): admins and mentors only. From anyone else
      // scope=all is ignored and they get their own. The owner clause stays in the SQL.
      const everyone = params.get('scope') === 'all' && readsEveryReport(user);
      let owner: string | null = null;
      if (everyone && params.has('owner')) {
        owner = normalizeEmail(params.get('owner'));
        if (owner === null || owner !== params.get('owner')) throw new HttpError(400, 'bad_owner', 'Give the owner as a lower-case email address.');
      }
      const mentees = everyone && user.role === 'mentor' && params.get('mentees') === '1';
      const reports = await withActor(pool, asUser(user), async (tx) => {
        // Client, side and stage for every row in one query (Dispatch 14): the stage is how far the
        // report has got — sent, then on Send, then past the Gate, else still sorting.
        const { rows } = await tx.query<ReportRow>(
          `select ${COLUMNS.split(', ').map((c) => `r.${c}`).join(', ')},
                  nullif(btrim(coalesce(r.brief->'clientName'->>'value', r.state->'send'->'clientName'->>'value')), '') as client,
                  case when r.brief->'audience'->>'value' in ('buyer', 'seller') then r.brief->'audience'->>'value' end as side,
                  case
                    when r.state->'send'->>'sentAt' is not null then 'sent'
                    when r.state->>'reached' = 'send' or r.state->'send'->'headline' is not null then 'send'
                    when r.agent_call is not null then 'findings'
                    else 'sort'
                  end as stage,
                  (select nullif(btrim(u.name), '') from comp_report.users u where u.email = r.owner_email) as owner_name,
                  (select count(*) from comp_report.report_comps rc
                    where rc.report_id = r.id and rc.removed_at is null and rc.tier is null) as unsorted
             from comp_report.reports r
            where ($3 or r.owner_email = $1) and ($4::text is null or r.owner_email = $4) and r.status = $2
              and (not $5 or r.owner_email in (select m.agent_email from comp_report.mentees m
                                                 where m.mentor_email = $1 and m.removed_at is null))
            order by r.updated_at desc limit 200`,
          [user.email, status, everyone, owner, mentees],
        );
        return rows;
      });
      return json({ reports: reports.map(summary) });
    }

    const body = await readJsonObject(req);
    if (req.method === 'PATCH') return json(await changeStatus(pool, user, body));
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length < 1 || title.length > 200) {
      throw new HttpError(400, 'bad_title', 'Give the report a title of up to 200 characters.');
    }
    const propertyType = body.propertyType ?? 'condo';
    if (propertyType !== 'condo' && propertyType !== 'coop') {
      throw new HttpError(400, 'bad_property_type', 'Property type is condo or coop.');
    }
    const created = await withActor(pool, asUser(user), async (tx) => {
      const { rows } = await tx.query<ReportRow>(
        `insert into comp_report.reports (owner_email, title, property_type)
         values ($1, $2, $3) returning ${COLUMNS}`,
        [user.email, title, propertyType],
      );
      return rows[0];
    });
    if (!created) throw new HttpError(500, 'not_created');
    return json({ report: summary(created) }, 201);
  });
}

const NEXT: Record<'archive' | 'restore', { from: ReportSummary['status']; to: ReportSummary['status'] }> = {
  archive: { from: 'active', to: 'archived' },
  restore: { from: 'archived', to: 'active' },
};

/** Archive, restore or delete the owner's own report: an admin reading someone else's can't. */
async function changeStatus(pool: PoolLike, user: SessionUser, body: Record<string, unknown>) {
  const id = body.id;
  if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(400, 'bad_id');
  const action = body.action;
  if (action !== 'archive' && action !== 'restore' && action !== 'delete') {
    throw new HttpError(400, 'bad_action', 'The action is archive, restore or delete.');
  }
  return withActor(pool, asUser(user), async (tx) => {
    const { rows } = await tx.query<ReportRow>(
      `select ${COLUMNS} from comp_report.reports where id = $1 and owner_email = $2 and status <> 'deleted' for update`,
      [id, user.email],
    );
    const report = rows[0];
    if (!report) throw new HttpError(404, 'not_found', 'No such report.');
    if (action === 'delete') {
      if (!report.sample_data) {
        throw new HttpError(409, 'not_sample', 'Only a sample report can be deleted. Archive this one instead.');
      }
    } else if (report.status !== NEXT[action].from) {
      throw new HttpError(409, 'bad_state', action === 'archive' ? 'This report is already archived.' : 'This report isn’t archived.');
    }
    const to = action === 'delete' ? 'deleted' : NEXT[action].to;
    const updated = await tx.query<ReportRow>(
      `update comp_report.reports set status = $2, updated_at = now() where id = $1 returning ${COLUMNS}`,
      [id, to],
    );
    return { report: summary(updated.rows[0]!) };
  });
}
