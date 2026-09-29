// /api/comp-report/allowlist — admins decide who beyond Casa's domain may use
// the comp report, and with which role (design §13). Admins only. A grant is
// agent, mentor or external: admin comes from CR_ADMIN_EMAILS alone.
//   GET                           every entry, current ones first
//   POST {email, role?, note?}    grant access or change a grant; granting a
//                                 removed entry again restores it
//   DELETE ?email=<address>       remove a grant, effective on that person's
//                                 next request
//
// Inviting someone from outside Casa takes two steps: the grant here, then the
// invitation from Netlify → Identity → Invite users. The sign-up gate and the
// per-request check both read this table.
import { GRANTABLE_ROLES, normalizeEmail } from '../access.ts';
import { withActor, type Role } from '../db.ts';
import { allowMethods, HttpError, json, readJsonObject, respond } from '../http.ts';
import { requireUser, type AuthDeps } from '../session.ts';
import { asUser, requirePool } from './reports.ts';

const MAX_NOTE = 500;

export interface AllowlistEntry {
  email: string;
  role: Role;
  note: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  revokedAt: string | null;
  revokedBy: string | null;
}

interface EntryRow {
  email: string;
  role: Role;
  note: string | null;
  created_at: Date;
  created_by: string;
  updated_at: Date;
  updated_by: string;
  revoked_at: Date | null;
  revoked_by: string | null;
}

const COLUMNS = 'email, role, note, created_at, created_by, updated_at, updated_by, revoked_at, revoked_by';

function entry(r: EntryRow): AllowlistEntry {
  return {
    email: r.email,
    role: r.role,
    note: r.note,
    createdAt: new Date(r.created_at).toISOString(),
    createdBy: r.created_by,
    updatedAt: new Date(r.updated_at).toISOString(),
    updatedBy: r.updated_by,
    revokedAt: r.revoked_at === null ? null : new Date(r.revoked_at).toISOString(),
    revokedBy: r.revoked_by,
  };
}

export function handleAllowlist(req: Request, deps: AuthDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET', 'POST', 'DELETE');
    const user = await requireUser(req, deps);
    if (user.role !== 'admin') throw new HttpError(403, 'admins_only', 'Only admins manage who can use the comp report.');
    const pool = requirePool(deps);

    if (req.method === 'GET') {
      const rows = await withActor(pool, asUser(user), async (tx) =>
        (await tx.query<EntryRow>(
          `select ${COLUMNS} from comp_report.allowlist
            order by revoked_at is not null, updated_at desc limit 500`,
        )).rows);
      return json({ entries: rows.map(entry) });
    }

    if (req.method === 'DELETE') {
      const email = normalizeEmail(new URL(req.url).searchParams.get('email'));
      if (!email) throw new HttpError(400, 'bad_email', 'Which email address?');
      if (email === user.email) throw new HttpError(400, 'own_access', 'You can\'t remove your own access.');
      const row = await withActor(pool, asUser(user), async (tx) =>
        (await tx.query<EntryRow>(
          `update comp_report.allowlist set revoked_at = now(), revoked_by = comp_report.actor()
            where email = $1 and revoked_at is null
            returning ${COLUMNS}`,
          [email],
        )).rows[0]);
      if (!row) throw new HttpError(404, 'not_found', 'That address has no access to remove.');
      return json({ entry: entry(row) });
    }

    const body = await readJsonObject(req);
    const email = normalizeEmail(body.email);
    if (!email) throw new HttpError(400, 'bad_email', 'Enter one email address.');
    if (email === user.email) throw new HttpError(400, 'own_access', 'You can\'t change your own access.');
    const role = body.role ?? 'external';
    if (role === 'admin') {
      throw new HttpError(400, 'bad_role', 'Admins are set in Netlify (CR_ADMIN_EMAILS), not here.');
    }
    if (!GRANTABLE_ROLES.includes(role as Role)) throw new HttpError(400, 'bad_role', 'The role is external, mentor or agent.');
    if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
      throw new HttpError(400, 'bad_note', 'The note is text.');
    }
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
    if (note && note.length > MAX_NOTE) throw new HttpError(400, 'bad_note', `Keep the note under ${MAX_NOTE} characters.`);

    const row = await withActor(pool, asUser(user), async (tx) =>
      (await tx.query<EntryRow>(
        `insert into comp_report.allowlist (email, role, note) values ($1, $2, $3)
         on conflict (email) do update
           set role = excluded.role, note = excluded.note, revoked_at = null, revoked_by = null
         returning ${COLUMNS}`,
        [email, role, note],
      )).rows[0]);
    if (!row) throw new HttpError(500, 'not_saved');
    return json({ entry: entry(row) });
  });
}
