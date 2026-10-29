// /api/comp-report/mentees — a mentor's own list of the agents they mentor (Kimani, 2026-10-27).
// A filter, not a permission: mentors read every report either way (NB-23 A), and Everyone's
// reports opens on their mentees when they have any. Mentors only.
//   GET                  {mentees: emails, agents: [{email, name}]}: the list, and who can be on it
//   PUT {emails: [...]}  replaces the list; a removed mentee keeps its row, stamped
import { normalizeEmail } from '../access.ts';
import { withActor, type Queryable } from '../db.ts';
import { allowMethods, HttpError, json, readJsonObject, respond } from '../http.ts';
import { requireUser, type AuthDeps } from '../session.ts';
import { asUser, requirePool } from './reports.ts';

const MAX_MENTEES = 200;

export interface MenteeAgent {
  email: string;
  name: string | null;
}

/** The active mentees' emails, for a mentor: the list the reports filter reads. */
export async function menteeEmails(tx: Queryable, mentorEmail: string): Promise<string[]> {
  const { rows } = await tx.query<{ agent_email: string }>(
    'select agent_email from comp_report.mentees where mentor_email = $1 and removed_at is null order by agent_email',
    [mentorEmail],
  );
  return rows.map((r) => r.agent_email);
}

/** Everyone a mentor can pick: active agents, by name. */
async function agents(tx: Queryable): Promise<MenteeAgent[]> {
  const { rows } = await tx.query<{ email: string; name: string | null }>(
    `select email, nullif(btrim(name), '') as name from comp_report.users
      where role = 'agent' and status = 'active' and not is_test order by lower(coalesce(nullif(btrim(name), ''), email))`,
  );
  return rows.map((r) => ({ email: r.email, name: r.name }));
}

export function handleMentees(req: Request, deps: AuthDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET', 'PUT');
    const user = await requireUser(req, deps);
    if (user.role !== 'mentor') throw new HttpError(403, 'mentors_only', 'Only mentors keep a list of mentees.');
    const pool = requirePool(deps);

    if (req.method === 'GET') {
      return json(await withActor(pool, asUser(user), async (tx) => ({ mentees: await menteeEmails(tx, user.email), agents: await agents(tx) })));
    }

    const body = await readJsonObject(req);
    if (!Array.isArray(body.emails) || body.emails.length > MAX_MENTEES) {
      throw new HttpError(400, 'bad_emails', `Give the mentees as a list of up to ${MAX_MENTEES} email addresses.`);
    }
    const wanted = new Set<string>();
    for (const raw of body.emails) {
      const email = normalizeEmail(raw);
      if (!email) throw new HttpError(400, 'bad_email', 'One of those isn’t an email address.');
      wanted.add(email);
    }
    return json(await withActor(pool, asUser(user), async (tx) => {
      const known = new Set((await agents(tx)).map((a) => a.email));
      const unknown = [...wanted].filter((e) => !known.has(e));
      if (unknown.length) throw new HttpError(400, 'not_an_agent', `${unknown[0]} isn’t an agent here.`);
      const list = [...wanted];
      await tx.query(
        `insert into comp_report.mentees (mentor_email, agent_email)
         select $1, unnest($2::text[])
         on conflict (mentor_email, agent_email) do update set removed_at = null where comp_report.mentees.removed_at is not null`,
        [user.email, list],
      );
      await tx.query(
        `update comp_report.mentees set removed_at = now()
          where mentor_email = $1 and removed_at is null and not (agent_email = any($2::text[]))`,
        [user.email, list],
      );
      return { mentees: await menteeEmails(tx, user.email) };
    }));
  });
}
