// GET /api/comp-report/access-log?view=signin|timeline|audit[&user=<email>][&report=<uuid>]
// The only reader of the sign-in log and the activity log (Dispatch 22b). Admins only.
//   signin    sign-ins (gate rows, unverified), sessions started, refusals, and the errors
//             Google or Identity handed back
//   timeline  one report: what was done in it, and who else read it (report is required)
//   audit     who loaded everyone's reports, and who changed an agent's level
// Every query names its kinds and filters in its WHERE clause (both layers, §12) and returns
// the last 100 lines. Every value is a closed-list code, an address, a time or a count: the
// panel shows them as plain text.
import { normalizeEmail } from '../access.ts';
import { withActor, type Queryable } from '../db.ts';
import { allowMethods, HttpError, json, respond, UUID } from '../http.ts';
import { requireUser, type AuthDeps } from '../session.ts';
import { asUser, requirePool } from './reports.ts';

export const LOG_LIMIT = 100;

export interface AccessLine {
  at: string;
  kind: 'gate' | 'session_start' | 'refused' | 'viewed_other' | 'viewed_list' | 'signin_error' | 'capability_change';
  /** gate rows come through an open door: unverified. session_start and refused come from a verified token. */
  verified: boolean;
  event: string | null;
  provider: string | null;
  allowed: boolean | null;
  via: string | null;
  reason: string | null;
  error: string | null;
  errorCode: string | null;
  capability: string | null;
  email: string | null;
  domain: string | null;
  byEmail: string | null;
  reportId: string | null;
  ownerEmail: string | null;
}

export interface ActivityLine {
  at: string;
  kind: 'screen' | 'action' | 'error';
  name: string;
  userEmail: string;
  sessionId: string | null;
  detail: Record<string, unknown>;
}

interface AccessRow {
  at: Date; kind: AccessLine['kind']; source: string; event: string | null; provider: string | null; allowed: boolean | null;
  via: string | null; reason: string | null; error: string | null; error_code: string | null; capability: string | null;
  email: string | null; domain: string | null; by_email: string | null; report_id: string | null; owner_email: string | null;
}

const ACCESS_COLUMNS = `at, kind, source, event, provider, allowed, via, reason, error, error_code, capability, email, domain,
  by_email, report_id, owner_email`;

const line = (r: AccessRow): AccessLine => ({
  at: new Date(r.at).toISOString(), kind: r.kind, verified: r.source === 'server', event: r.event, provider: r.provider,
  allowed: r.allowed, via: r.via, reason: r.reason, error: r.error, errorCode: r.error_code, capability: r.capability,
  email: r.email, domain: r.domain, byEmail: r.by_email, reportId: r.report_id, ownerEmail: r.owner_email,
});

async function signIns(tx: Queryable, user: string | null) {
  const { rows } = await tx.query<AccessRow>(
    `select ${ACCESS_COLUMNS} from comp_report.access_events
      where kind in ('gate', 'session_start', 'refused', 'signin_error') and ($1::text is null or email = $1)
        and (email is null or email not in (select email from comp_report.users where is_test))
      order by at desc, id desc limit ${LOG_LIMIT}`,
    [user],
  );
  return { lines: rows.map(line) };
}

async function audit(tx: Queryable, user: string | null) {
  const { rows } = await tx.query<AccessRow>(
    `select ${ACCESS_COLUMNS} from comp_report.access_events
      where kind in ('viewed_list', 'capability_change') and ($1::text is null or email = $1 or by_email = $1)
        and (email is null or email not in (select email from comp_report.users where is_test))
      order by at desc, id desc limit ${LOG_LIMIT}`,
    [user],
  );
  return { lines: rows.map(line) };
}

async function timeline(tx: Queryable, report: string, user: string | null) {
  const views = (await tx.query<AccessRow>(
    `select ${ACCESS_COLUMNS} from comp_report.access_events
      where kind = 'viewed_other' and report_id = $1 and ($2::text is null or by_email = $2)
      order by at desc, id desc limit ${LOG_LIMIT}`,
    [report, user],
  )).rows.map(line);
  const activity = (await tx.query<{ at: Date; kind: ActivityLine['kind']; name: string; user_email: string; session_id: string | null; detail: Record<string, unknown> }>(
    `select at, kind, name, user_email, session_id, detail from comp_report.activity
      where kind in ('screen', 'action', 'error') and report_id = $1 and ($2::text is null or user_email = $2)
      order by at desc, id desc limit ${LOG_LIMIT}`,
    [report, user],
  )).rows.map((r): ActivityLine => ({
    at: new Date(r.at).toISOString(), kind: r.kind, name: r.name, userEmail: r.user_email, sessionId: r.session_id, detail: r.detail,
  }));
  return { lines: views, activity };
}

export function handleAccessLog(req: Request, deps: AuthDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET');
    const user = await requireUser(req, deps);
    if (user.role !== 'admin') throw new HttpError(403, 'admins_only', 'The access log is for admins.');
    const pool = requirePool(deps);
    const params = new URL(req.url).searchParams;
    const view = params.get('view');
    let who: string | null = null;
    if (params.has('user')) {
      who = normalizeEmail(params.get('user'));
      if (!who || who !== params.get('user')) throw new HttpError(400, 'bad_user', 'Give the person as a lower-case email address.');
    }
    let report: string | null = null;
    if (params.has('report')) {
      report = params.get('report');
      if (!report || !UUID.test(report)) throw new HttpError(400, 'bad_report', 'Which report?');
    }
    if (view !== 'signin' && view !== 'timeline' && view !== 'audit') throw new HttpError(400, 'bad_view', 'The view is signin, timeline or audit.');
    if (view === 'timeline' && !report) throw new HttpError(400, 'bad_report', 'The timeline is of one report.');
    return json(await withActor(pool, asUser(user), (tx) => (
      view === 'signin' ? signIns(tx, who) : view === 'audit' ? audit(tx, who) : timeline(tx, report!, who)
    )));
  });
}
