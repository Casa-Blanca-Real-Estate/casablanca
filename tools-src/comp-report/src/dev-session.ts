// DEV ONLY — never in a production build (see session.ts). Stands in for
// Netlify Identity under `npm run dev:comp-report`: you type an email, and the
// dev server's stub verifier accepts it as that user. The access rule still
// applies, so a non-Casa email is refused exactly as in production.
import type { SessionProvider, SessionState } from './session.ts';

const KEY = 'cr-dev-session';

const toToken = (email: string) =>
  'dev.' + btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const devSession: SessionProvider = {
  dev: true,
  async start(): Promise<SessionState> {
    const email = sessionStorage.getItem(KEY);
    return email ? { status: 'signed-in', email, name: null } : { status: 'signed-out' };
  },
  async token() {
    const email = sessionStorage.getItem(KEY);
    return email ? toToken(email) : null;
  },
  signInWithGoogle() {
    const email = prompt('Dev sign-in — which email?', 'ana@casa-blanca.com');
    if (email) {
      sessionStorage.setItem(KEY, email.trim().toLowerCase());
      location.reload();
    }
  },
  async signInWithPassword(email: string) {
    sessionStorage.setItem(KEY, email.trim().toLowerCase());
    return { status: 'signed-in', email: email.trim().toLowerCase(), name: null };
  },
  async acceptInvite() {
    return { status: 'signed-out', notice: 'Invites need Netlify Identity; not available in dev.' };
  },
  async sendPasswordReset() {},
  async setPassword() {},
  async signOut() {
    sessionStorage.removeItem(KEY);
  },
};
