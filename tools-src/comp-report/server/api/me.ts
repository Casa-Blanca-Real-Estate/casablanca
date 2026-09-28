// GET /api/comp-report/me — who is signed in, and whether the database is there.
import type { PoolLike } from '../db.ts';
import { allowMethods, json, respond } from '../http.ts';
import { requireUser, type AuthDeps } from '../session.ts';

export function databaseState(pool: PoolLike | null): 'ready' | 'not_configured' {
  return pool ? 'ready' : 'not_configured';
}

export function handleMe(req: Request, deps: AuthDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET');
    const user = await requireUser(req, deps);
    return json({ user, database: databaseState(deps.pool) });
  });
}
