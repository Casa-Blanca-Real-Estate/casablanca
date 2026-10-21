// Guest mode in the browser (server/guest.ts has the rules). Hidden: there is
// no button. Open the comp report with ?guest=<key> once and this browser is a
// guest until it signs out; ?guest=off leaves. The key goes to the API as the
// token, and the server decides: on production, or with a wrong key, every
// call is refused and the sign-in screen comes back.
import type { SessionProvider, SessionState } from './session.ts';

const KEY = 'cr-guest-key';
export const GUEST_LABEL = 'Guest';

function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function forget() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode: nothing was kept */
  }
}

/** Takes ?guest= off the address (it's a secret), keeping the key or forgetting it. True while a key is kept. */
export function takeGuestKeyFromUrl(): boolean {
  const params = new URLSearchParams(location.search);
  const given = params.get('guest');
  if (given !== null) {
    params.delete('guest');
    const rest = params.toString();
    history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
    if (given === 'off' || !given.trim()) forget();
    else {
      try {
        localStorage.setItem(KEY, given.trim());
      } catch {
        /* private mode: guest mode needs storage */
      }
    }
  }
  return stored() !== null;
}

/** Leaves guest mode, e.g. when the server refuses the key. */
export const leaveGuestMode = forget;

/**
 * The session with guest mode in front of it: a guest while a key is kept,
 * and the usual sign-in (base) for everything else, so leaving guest mode
 * lands on a sign-in screen that works.
 */
export function withGuestMode(base: SessionProvider): SessionProvider {
  return {
    dev: base.dev,
    get guest() {
      return stored() !== null;
    },
    async start(): Promise<SessionState> {
      return stored() ? { status: 'signed-in', email: GUEST_LABEL, name: GUEST_LABEL } : base.start();
    },
    async token() {
      const key = stored();
      return key ? `guest.${key}` : base.token();
    },
    signInWithGoogle() {
      forget();
      base.signInWithGoogle();
    },
    async signInWithPassword(email, password) {
      forget();
      return base.signInWithPassword(email, password);
    },
    acceptInvite: (token, password) => base.acceptInvite(token, password),
    sendPasswordReset: (email) => base.sendPasswordReset(email),
    setPassword: (password) => base.setPassword(password),
    async signOut() {
      if (stored()) forget();
      else await base.signOut();
    },
  };
}
