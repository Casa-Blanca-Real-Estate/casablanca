// POST /api/comp-report/signin-error — what Google or Identity handed back in the sign-in URL
// (#error=…), sent by the sign-in screen with no sign-in (Dispatch 22b, casa-r12-2), so a
// Google-side block can be told from our own gate refusing.
//   {error, error_description?, provider?}
//
// An open door: 06's advice is to have none, and casa-r12-2 asked for this one. So nothing the
// caller sends is stored as text. `error` and `provider` come through closed lists (anything
// else is `other`); the description is matched against the two the sign-in screen already
// knows (src/sign-in-errors.ts) and stored as a code. Bodies over 1 KB get 413 before they're
// parsed. No IP (Netlify's context.ip, never X-Forwarded-For) means nothing is stored. The
// answer is the same empty 204 whether the row was stored, dropped or over the limit.
import { allowMethods, HttpError, readBoundedJsonObject, respond } from '../http.ts';
import { closed, closedProvider, ipFrom, logFromOpenDoor, SIGN_IN_ERRORS } from '../logs.ts';
import type { PoolLike } from '../db.ts';
import type { GateContext } from '../identity-events.ts';

export const MAX_SIGNIN_ERROR_BODY = 1024;

export interface SignInErrorDeps {
  pool: PoolLike | null;
}

/** The two descriptions the sign-in screen tells apart, as codes; the text itself is never kept. */
export function errorCodeFor(description: unknown): 'gate_webhook' | 'signups_not_allowed' | 'other' {
  const text = typeof description === 'string' ? description : '';
  if (/webhook/i.test(text)) return 'gate_webhook';
  if (/signups? not allowed/i.test(text)) return 'signups_not_allowed';
  return 'other';
}

const noContent = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export function handleSignInError(req: Request, deps: SignInErrorDeps, context?: GateContext | null): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'POST');
    let body: Record<string, unknown>;
    try {
      body = await readBoundedJsonObject(req, MAX_SIGNIN_ERROR_BODY);
    } catch (error) {
      if (error instanceof HttpError && error.status === 413) throw error;
      return noContent();
    }
    const ip = ipFrom(context);
    if (!ip) return noContent();
    await logFromOpenDoor(deps.pool, 'signin_error', ip, {
      kind: 'signin_error',
      source: 'public',
      provider: closedProvider(body.provider),
      error: closed(body.error, SIGN_IN_ERRORS),
      errorCode: errorCodeFor(body.error_description),
    });
    return noContent();
  });
}
