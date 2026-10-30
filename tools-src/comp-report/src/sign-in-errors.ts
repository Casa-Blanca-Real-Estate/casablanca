// When Identity can't complete a sign-in, it sends the browser back with
// #error=…&error_description=… instead of tokens (GoTrue's redirectErrors).
// The commonest cause is our own gate: identity-validate, identity-signup or
// identity-login refused the account, which Identity reports only as "Failed
// to handle signup webhook", whichever of the three it was.
//
// The description comes from the URL, so anyone can put anything there: the
// notice is chosen from fixed wording and never echoes it.

export const NOT_AUTHORISED_NOTICE =
  'That Google account isn\'t a Casa Blanca one. Google may have picked a personal account: continue with Google again ' +
  'and choose your @casa-blanca.com account. Not on casa-blanca.com? Ask Kimani to add you.';
export const INVITE_ONLY_NOTICE = 'Sign-up is by invitation only right now. Ask an admin to invite you.';
export const CANCELLED_NOTICE = 'Sign-in was cancelled.';
export const FAILED_NOTICE = 'Sign-in didn\'t complete. Try again; if it keeps happening, tell Kimani.';

/** The notice for an Identity error return, or null if the hash isn't one. */
export function signInErrorNotice(hash: string): string | null {
  if (!/^#error=/.test(hash)) return null;
  const params = new URLSearchParams(hash.slice(1));
  const error = params.get('error') ?? '';
  const description = params.get('error_description') ?? '';
  if (/webhook in time frame/i.test(description)) return FAILED_NOTICE; // our gate didn't answer in time: worth a retry
  if (/webhook/i.test(description)) return NOT_AUTHORISED_NOTICE; // our gate said no (server_error)
  if (/signups? not allowed/i.test(description)) return INVITE_ONLY_NOTICE; // registration is invite-only
  if (error === 'access_denied') return CANCELLED_NOTICE; // cancelled at Google
  return FAILED_NOTICE;
}

/**
 * Tells the server what came back (Dispatch 22b): POST /api/comp-report/signin-error, with no
 * sign-in. The server keeps only codes from its own closed lists, never the text. Fire and forget.
 */
export function reportSignInError(hash: string): void {
  if (!/^#error=/.test(hash)) return;
  const params = new URLSearchParams(hash.slice(1));
  const body = JSON.stringify({
    error: (params.get('error') ?? '').slice(0, 64),
    error_description: (params.get('error_description') ?? '').slice(0, 300),
  });
  fetch('/api/comp-report/signin-error', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body })
    .catch(() => undefined);
}
