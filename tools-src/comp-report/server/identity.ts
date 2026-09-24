// Verifying a Netlify Identity session on the server. The browser sends its
// access token as `Authorization: Bearer …`; we ask the site's own Identity
// endpoint who it belongs to. That call is the verification — Identity signs
// its tokens with a secret sites can't see, so there's nothing to check
// locally — and it also catches a deleted user whose token hasn't expired.
//
// Fails closed: if Identity can't be reached, the request is refused (503),
// never waved through on the token's unverified claims.
import { createHash } from 'node:crypto';
import { normalizeEmail } from './access.ts';

export interface IdentityUser {
  id: string;
  email: string;
  confirmed: boolean;
  provider: string | null;
  name: string | null;
}

export interface IdentityVerifier {
  verify(token: string): Promise<IdentityUser | null>;
}

export class IdentityUnavailable extends Error {}

const CACHE_MS = 60_000;
const CACHE_MAX = 1000;

/** The expiry claim, used only to keep the cache from outliving the token. */
function tokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function toIdentityUser(body: unknown): IdentityUser | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const email = normalizeEmail(b.email);
  if (typeof b.id !== 'string' || !email) return null;
  const app = (b.app_metadata ?? {}) as Record<string, unknown>;
  const meta = (b.user_metadata ?? {}) as Record<string, unknown>;
  const name = meta.full_name ?? meta.name;
  return {
    id: b.id,
    email,
    confirmed: typeof b.confirmed_at === 'string' && b.confirmed_at.length > 0,
    provider: typeof app.provider === 'string' ? app.provider : null,
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 200) : null,
  };
}

/** Where the site's Identity lives: the site's own URL, or the request's origin. */
export function identityUrlFor(req: Request, env: Record<string, string | undefined> = process.env): string {
  const origin = env.URL ? new URL(env.URL).origin : new URL(req.url).origin;
  return `${origin}/.netlify/identity`;
}

export function netlifyIdentityVerifier(
  identityUrl: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): IdentityVerifier {
  // Per warm instance: at most a minute, never past the token's own expiry.
  const cache = new Map<string, { user: IdentityUser; until: number }>();

  return {
    async verify(token: string): Promise<IdentityUser | null> {
      const key = createHash('sha256').update(token).digest('base64url');
      const hit = cache.get(key);
      if (hit && hit.until > now()) return hit.user;
      cache.delete(key);

      let res: Response;
      try {
        res = await fetchImpl(`${identityUrl}/user`, { headers: { Authorization: `Bearer ${token}` } });
      } catch (error) {
        throw new IdentityUnavailable(`Identity unreachable: ${error instanceof Error ? error.message : String(error)}`);
      }
      if ([400, 401, 403, 404].includes(res.status)) return null; // bad, expired or revoked token
      if (!res.ok) throw new IdentityUnavailable(`Identity answered ${res.status}`);

      const user = toIdentityUser(await res.json().catch(() => null));
      if (!user) return null;

      const expiry = tokenExpiryMs(token);
      const until = Math.min(now() + CACHE_MS, expiry ?? now() + CACHE_MS);
      if (cache.size >= CACHE_MAX) cache.clear();
      cache.set(key, { user, until });
      return user;
    },
  };
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]{16,8192})$/i.exec(header.trim());
  return match?.[1] ?? null;
}
