// GET  /api/comp-report/capability — everyone who has signed in, with their level, for the Access panel
// POST /api/comp-report/capability {email, capability, reason?} — an admin sets an agent's level
// (Dispatch 14's follow-up, in Dispatch 22b): practice (new, writes first) or full (graduated).
// Moving to full records who unlocked them, when, and the admin's reason (up to 200 characters);
// moving to practice clears all three. Only those four columns change, on that one row. Each
// change is a capability_change row in the sign-in log, written after the update commits; if
// that write fails it's a console.error and the change stands.
import { normalizeEmail } from '../access.ts';
import { withActor } from '../db.ts';
import { allowMethods, HttpError, json, readJsonObject, respond } from '../http.ts';
import { logAccess } from '../logs.ts';
import { requireUser, type AuthDeps } from '../session.ts';
import { asUser, requirePool } from './reports.ts';

export const MAX_UNLOCK_REASON = 200;

export function handleCapability(req: Request, deps: AuthDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET', 'POST');
    const user = await requireUser(req, deps);
    if (user.role !== 'admin') throw new HttpError(403, 'admins_only', 'Only admins set an agent’s level.');
    const pool = requirePool(deps);
    if (req.method === 'GET') {
      const people = await withActor(pool, asUser(user), async (tx) => (await tx.query<{
        email: string; name: string | null; role: string; status: string; capability: 'practice' | 'full'; last_seen_at: Date | null;
      }>(
        `select email, nullif(btrim(name), '') as name, role, status, capability, last_seen_at from comp_report.users
          where status = 'active' order by last_seen_at desc nulls last limit 500`,
      )).rows);
      return json({
        people: people.map((p) => ({
          email: p.email, name: p.name, role: p.role, capability: p.capability,
          lastSeenAt: p.last_seen_at ? new Date(p.last_seen_at).toISOString() : null,
        })),
      });
    }
    const body = await readJsonObject(req, 4 * 1024);
    const email = normalizeEmail(body.email);
    if (!email) throw new HttpError(400, 'bad_email', 'Whose level?');
    const capability = body.capability;
    if (capability !== 'practice' && capability !== 'full') throw new HttpError(400, 'bad_capability', 'The level is practice or full.');
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length > MAX_UNLOCK_REASON) throw new HttpError(400, 'bad_reason', `Keep the reason under ${MAX_UNLOCK_REASON} characters.`);

    const updated = await withActor(pool, asUser(user), async (tx) => {
      const { rows } = await tx.query<{ email: string; capability: 'practice' | 'full'; unlocked_by: string | null; unlocked_at: Date | null; unlocked_reason: string | null }>(
        capability === 'full'
          ? `update comp_report.users set capability = 'full', unlocked_by = $2, unlocked_at = now(), unlocked_reason = $3
              where email = $1 returning email, capability, unlocked_by, unlocked_at, unlocked_reason`
          : `update comp_report.users set capability = 'practice', unlocked_by = null, unlocked_at = null, unlocked_reason = null
              where email = $1 returning email, capability, unlocked_by, unlocked_at, unlocked_reason`,
        capability === 'full' ? [email, user.email, reason || null] : [email],
      );
      return rows[0];
    });
    if (!updated) throw new HttpError(404, 'not_found', 'No one with that address has signed in yet.');
    const logged = await logAccess(pool, { kind: 'capability_change', source: 'server', email, byEmail: user.email, capability });
    if (!logged) console.error('comp-report: a capability change went unlogged', JSON.stringify({ email, by: user.email, capability }));
    return json({
      user: {
        email: updated.email,
        capability: updated.capability,
        unlockedBy: updated.unlocked_by,
        unlockedAt: updated.unlocked_at ? new Date(updated.unlocked_at).toISOString() : null,
        unlockedReason: updated.unlocked_reason,
      },
    });
  });
}
