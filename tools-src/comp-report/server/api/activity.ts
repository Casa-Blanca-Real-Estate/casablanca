// POST /api/comp-report/activity — the browser's half of the activity log (Dispatch 22b, NW-099).
//   {name, sessionId, reportId?}   name is screen.<id> (SCREEN_IDS) or error.<code> (ERROR_CODES)
//
// Closed lists, not a pattern: a practice agent with devtools can't forge call.given or store
// text of their choosing. What someone did is the server's to record (logs.ts, logActivity).
// The kind comes from the name, the email from the session, and a report the caller can't
// read is dropped, not stored. 60 events a minute and 2,000 a day per person, counted from
// their own rows under an advisory lock, so parallel requests can't slip past together.
import { ERROR_CODES } from '../../src/error-codes.ts';
import { SCREEN_IDS } from '../../src/views/workspace/screens.ts';
import { withActor } from '../db.ts';
import { allowMethods, HttpError, readBoundedJsonObject, respond, UUID } from '../http.ts';
import { requireUser, type AuthDeps } from '../session.ts';
import { asUser, requirePool } from './reports.ts';

export const MAX_ACTIVITY_BODY = 2 * 1024;
export const PER_MINUTE = 60;
export const PER_DAY = 2000;

const NAMES = new Map<string, 'screen' | 'error'>([
  ...SCREEN_IDS.map((id) => [`screen.${id}`, 'screen'] as const),
  ...ERROR_CODES.map((code) => [`error.${code}`, 'error'] as const),
]);

export function handleActivity(req: Request, deps: AuthDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'POST');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);
    const body = await readBoundedJsonObject(req, MAX_ACTIVITY_BODY);
    const name = typeof body.name === 'string' ? body.name : '';
    const kind = NAMES.get(name);
    if (!kind) throw new HttpError(400, 'bad_name', 'Not an event this log takes.');
    const sessionId = typeof body.sessionId === 'string' && UUID.test(body.sessionId) ? body.sessionId.toLowerCase() : null;
    if (!sessionId) throw new HttpError(400, 'bad_session', 'The session id is a UUID.');
    if (body.reportId !== undefined && (typeof body.reportId !== 'string' || !UUID.test(body.reportId))) {
      throw new HttpError(400, 'bad_report', 'The report id is a UUID.');
    }
    const asked = typeof body.reportId === 'string' ? body.reportId : null;

    const stored = await withActor(pool, asUser(user), async (tx) => {
      await tx.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`comp_report.activity:${user.email}`]);
      const { rows } = await tx.query<{ minute: number; day: number }>(
        `select count(*) filter (where at > now() - interval '1 minute')::int as minute,
                count(*)::int as day
           from comp_report.activity
          where user_email = $1 and kind in ('screen', 'error') and at > now() - interval '1 day'`,
        [user.email],
      );
      if ((rows[0]?.minute ?? 0) >= PER_MINUTE || (rows[0]?.day ?? 0) >= PER_DAY) return false;
      const reportId = asked && (await tx.query<{ ok: boolean }>('select comp_report.can_read_report($1) as ok', [asked])).rows[0]?.ok
        ? asked
        : null;
      await tx.query(
        `insert into comp_report.activity (user_email, report_id, session_id, kind, name) values ($1, $2, $3, $4, $5)`,
        [user.email, reportId, sessionId, kind, name],
      );
      return true;
    });
    if (!stored) throw new HttpError(429, 'too_many_events', 'Too many events; this one wasn’t kept.');
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  });
}
