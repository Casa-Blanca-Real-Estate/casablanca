// The browser side of sign-in: Netlify Identity through @netlify/identity.
// Casa agents use Google; invited outsiders use email and password (§13).
// The access token goes to our API as an Authorization header on every call —
// the functions verify it with Identity themselves (server/session.ts).
//
// Under the local dev server (npm run dev:comp-report) there is no Identity,
// so a dev sign-in stands in for it. It exists only in dev builds:
// import.meta.env.DEV is false in the production bundle and that branch — and
// the module behind it — is compiled out.
import {
  acceptInvite, getSettings, getUser, handleAuthCallback, login, logout, oauthLogin,
  refreshSession, requestPasswordRecovery, updateUser,
} from '@netlify/identity';

export type SessionState =
  | { status: 'loading' }
  | { status: 'unavailable' } // Identity isn't switched on for this site yet
  | { status: 'signed-out'; notice?: string }
  | { status: 'invite'; token: string } // an invitation link: set a password to accept
  | { status: 'recovery' } // a password-reset link: signed in, set a new password
  | { status: 'signed-in'; email: string; name: string | null };

export interface SessionProvider {
  dev: boolean;
  start(): Promise<SessionState>;
  token(): Promise<string | null>;
  signInWithGoogle(): void;
  signInWithPassword(email: string, password: string): Promise<SessionState>;
  acceptInvite(token: string, password: string): Promise<SessionState>;
  sendPasswordReset(email: string): Promise<void>;
  setPassword(password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AUTH_HASH = /^#(access_token|confirmation_token|recovery_token|invite_token|email_change_token)=/;

function readCookie(name: string): string | null {
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function signedIn(user: { email?: string; name?: string } | null): SessionState {
  return user?.email ? { status: 'signed-in', email: user.email, name: user.name ?? null } : { status: 'signed-out' };
}

const identity: SessionProvider = {
  dev: false,

  async start() {
    // Until Identity is enabled, its endpoint 404s and there's nothing to sign in with.
    try {
      await getSettings();
    } catch {
      return { status: 'unavailable' };
    }
    if (AUTH_HASH.test(location.hash)) {
      try {
        const result = await handleAuthCallback();
        history.replaceState(null, '', location.pathname + location.search); // tokens out of the URL
        if (result?.type === 'invite' && result.token) return { status: 'invite', token: result.token };
        if (result?.type === 'recovery') return { status: 'recovery' };
      } catch {
        history.replaceState(null, '', location.pathname + location.search);
        return { status: 'signed-out', notice: "That sign-in link didn't work — it may have expired. Try again." };
      }
    }
    return signedIn(await getUser());
  },

  async token() {
    try {
      await refreshSession(); // renews the access token when it's near expiry
    } catch {
      /* fall through to whatever token there is; the server decides */
    }
    return readCookie('nf_jwt');
  },

  signInWithGoogle() {
    oauthLogin('google');
  },

  async signInWithPassword(email, password) {
    return signedIn(await login(email, password));
  },

  async acceptInvite(token, password) {
    return signedIn(await acceptInvite(token, password));
  },

  async sendPasswordReset(email) {
    await requestPasswordRecovery(email);
  },

  async setPassword(password) {
    await updateUser({ password });
  },

  async signOut() {
    await logout();
  },
};

let provider: SessionProvider = identity;
if (import.meta.env.DEV) {
  provider = (await import('./dev-session.ts')).devSession;
}

export const session: SessionProvider = provider;
