// /api/comp-report/reports
//   GET              the signed-in agent's reports, newest first
//   GET  ?id=<uuid>  one report
//   POST {title, propertyType?}  create a report
//
// Every query names its owner explicitly as well as running under row-level
// security (§12: scoped both ways).
import { withActor, type PoolLike } from '../db.ts';
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { requireUser, type AuthDeps, type SessionUser } from '../session.ts';

export interface ReportSummary {
  id: string;
  title: string;
  propertyType: 'condo' | 'coop';
  mode: 'practice' | 'full';
  status: 'active' | 'archived';
  ownerEmail: string;
  createdAt: string;
  updatedAt: string;
}

interface ReportRow {
  id: string;
  title: string;
  property_type: 'condo' | 'coop';
  mode: 'practice' | 'full';
  status: 'active' | 'archived';
  owner_email: string;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = 'id, title, property_type, mode, status, owner_email, created_at, updated_at';

function summary(r: ReportRow): ReportSummary {
  return {
    id: r.id,
    title: r.title,
    propertyType: r.property_type,
    mode: r.mode,
    status: r.status,
    ownerEmail: r.owner_email,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
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
    allowMethods(req, 'GET', 'POST');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);

    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('id');
      if (id !== null) {
        if (!UUID.test(id)) throw new HttpError(400, 'bad_id');
        const report = await withActor(pool, asUser(user), async (tx) => {
          const { rows } = await tx.query<ReportRow>(
            `select ${COLUMNS} from comp_report.reports where id = $1 and (owner_email = $2 or $3)`,
            [id, user.email, user.role === 'admin'],
          );
          return rows[0];
        });
        if (!report) throw new HttpError(404, 'not_found', 'No such report.');
        return json({ report: summary(report) });
      }
      const reports = await withActor(pool, asUser(user), async (tx) => {
        const { rows } = await tx.query<ReportRow>(
          `select ${COLUMNS} from comp_report.reports
            where owner_email = $1 and status = 'active'
            order by updated_at desc limit 200`,
          [user.email],
        );
        return rows;
      });
      return json({ reports: reports.map(summary) });
    }

    const body = await readJsonObject(req);
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
