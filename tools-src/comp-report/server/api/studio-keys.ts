// GET /api/studio/keys — the agent CMS's and the profile-pic roster's tokens,
// handed to the Studio's team once they're signed in, so nobody pastes them.
//   → {cms: string | null, pics: string | null}
// Kimani (2026-11-05): "I do not want to have to put in a CMS token every
// single time I need to use the CMS." The functions behind those tools still
// check their own shared secrets (agent-store.mjs, agent-pics.mts), so the
// import script and the CLI keep working; this only decides who may be given
// them: a comp report admin (CR_ADMIN_EMAILS) or one of the Studio's old team
// emails (STUDIO_TEAM, the same list assets/studio-auth.js holds). Never a
// guest, never the test user, never an agent. See docs/agent-cms/security-model.md §2.
import { allowMethods, HttpError, json, respond } from '../http.ts';
import { requireUser, type AuthDeps } from '../session.ts';

/** The Studio's team by email: keep in step with TEAM in assets/studio-auth.js. */
export const STUDIO_TEAM: readonly string[] = [
  'creative@email.casa-blanca.com', 'derek@casa-blanca.com', 'd.prestly@casa-blanca.com', 'emma@casa-blanca.com', 'erez@casa-blanca.com',
];

export function handleStudioKeys(req: Request, deps: AuthDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET');
    const user = await requireUser(req, deps);
    const team = user.role === 'admin' || STUDIO_TEAM.includes(user.email.toLowerCase());
    if (user.guest || user.test || !team) throw new HttpError(403, 'not_team', 'Only the Studio team is given the CMS token.');
    const env = deps.env ?? process.env;
    return json({ cms: env.CB_CMS_TOKEN?.trim() || null, pics: env.CB_PICS_TOKEN?.trim() || null });
  });
}
