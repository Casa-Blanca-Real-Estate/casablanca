// The Studio sign-in, enforced (CR-9). assets/studio-auth.js hides a Studio
// page until the server says who's there; it's a door, not a lock. This is the
// lock for the functions written before the comp report: the carousels'
// Claude, StreetEasy import and saved sessions, the headshot library, the image
// proxy, the brand library and the dashboard's workshop and changelog.
//
// It asks the same question /api/comp-report/me answers, with the same code
// (requireUser: Identity, the access rule, a disabled account, a preview's
// guest), so a visit the Studio lets in is a visit these functions answer.
// studio-auth.js adds the token to these calls; see STUDIO_FUNCTIONS there.
//
// Not here, on purpose: agent-store, agent-copy and agent-pics keep their own
// tokens (CB_CMS_TOKEN, CB_PICS_TOKEN), which the roster import script uses
// from outside any browser; feedback stays open to post; the comp report's and
// the dev notebook's functions have their own checks.
import { HttpError } from '../comp-report/server/http.ts';
import { requireUser, type AuthDeps, type SessionUser } from '../comp-report/server/session.ts';

/** The old dev sign-in's list, as studio-auth.js keeps it: with an admin or a preview's guest, the Studio's team. */
export const TEAM_EMAILS: readonly string[] = [
  'creative@email.casa-blanca.com',
  'derek@casa-blanca.com',
  'emma@casa-blanca.com',
  'erez@casa-blanca.com',
];

export function isTeam(user: SessionUser): boolean {
  return user.role === 'admin' || user.guest || TEAM_EMAILS.includes(user.email.toLowerCase());
}

export interface GateOptions {
  /** Headers every refusal carries: the function's own CORS, so the browser can read the answer. */
  headers?: Record<string, string>;
  /** Only the Studio's team (isTeam), as the page's own editing controls are. */
  team?: boolean;
}

/**
 * Null when the request is from someone signed in to the Studio (and on the
 * team, when asked); otherwise the refusal to send back, as JSON
 * `{error, message}` with the comp report's codes (401 signed_out, 403 …).
 */
export async function studioRefusal(req: Request, deps: AuthDeps, opts: GateOptions = {}): Promise<Response | null> {
  try {
    const user = await requireUser(req, deps);
    if (opts.team && !isTeam(user)) {
      throw new HttpError(403, 'team_only', 'Only the Studio team can change this.');
    }
    return null;
  } catch (error) {
    const refusal = error instanceof HttpError ? error : null;
    if (!refusal) console.error('studio gate: unhandled error', error);
    return new Response(
      JSON.stringify({
        error: refusal?.code ?? 'internal',
        message: refusal?.message ?? 'Something went wrong on our side.',
      }),
      {
        status: refusal?.status ?? 500,
        headers: { ...(opts.headers ?? {}), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      },
    );
  }
}
