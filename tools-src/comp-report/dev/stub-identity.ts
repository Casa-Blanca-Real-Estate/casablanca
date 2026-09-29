// DEV ONLY — stands in for Netlify Identity on the local dev server. Accepts
// the `dev.<base64url email>` tokens that src/dev-session.ts makes. Imported
// only by dev/api-plugin.ts; no deployed function can reach it.
import { normalizeEmail } from '../server/access.ts';
import type { IdentityUser, IdentityVerifier } from '../server/identity.ts';

export const devVerifier: IdentityVerifier = {
  async verify(token: string): Promise<IdentityUser | null> {
    if (!token.startsWith('dev.')) return null;
    const email = normalizeEmail(Buffer.from(token.slice(4), 'base64url').toString('utf8'));
    return email ? { id: `dev-${email}`, email, confirmed: true, provider: 'email', name: null } : null;
  },
  // Dev sign-ins stand in for password accounts, on an Identity that requires
  // email confirmation, as production's must.
  async emailConfirmationRequired() {
    return true;
  },
};
