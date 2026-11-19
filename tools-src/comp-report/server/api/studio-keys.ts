// GET /api/studio/keys — the agent CMS's and the profile-pic roster's tokens,
// handed to the Studio's team once they're signed in, so nobody pastes them.
//   → {cms: string | null, pics: string | null}
// Kimani (2026-11-05): "I do not want to have to put in a CMS token every
// single time I need to use the CMS." The functions behind those tools still
// check their own shared secrets (agent-store.mjs, agent-pics.mts), so the
// import script and the CLI keep working; this only decides who may be given
// them: the Studio's team (SessionUser.team: a comp report admin, the built-in
// list in server/access.ts, or a team grant from the Access panel). Never a
// guest, never the test user, never an agent. See docs/agent-cms/security-model.md §2.
import { isStudioTeam } from '../access.ts';
import { allowMethods, HttpError, json, respond } from '../http.ts';
import { requireUser, type AuthDeps } from '../session.ts';

export { STUDIO_TEAM } from '../access.ts';

export function handleStudioKeys(req: Request, deps: AuthDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET');
    const user = await requireUser(req, deps);
    const team = isStudioTeam(user, user.team);
    if (user.guest || user.test || !team) throw new HttpError(403, 'not_team', 'Only the Studio team is given the CMS token.');
    const env = deps.env ?? process.env;
    return json({ cms: env.CB_CMS_TOKEN?.trim() || null, pics: env.CB_PICS_TOKEN?.trim() || null });
  });
}
