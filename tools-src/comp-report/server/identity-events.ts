// The sign-up and log-in gate. Netlify Identity calls the identity-validate,
// identity-signup and identity-login functions with the user it's about to
// admit; a 2xx lets them in, anything else refuses (GoTrue retries a refusal
// a few times, then shows the user a 422). Since GoTrue's March 2026 fix
// these fire for Google sign-ups too — CR-1 is to prove that live with a
// non-Casa Google account (Dispatch 05 §4).
//
// This is the first of the two checks. The per-request check (session.ts)
// holds regardless, so a refusal here missing is never an open door.
import { decide, normalizeEmail, type AccessConfig } from './access.ts';
import { withActor, type PoolLike, type Role } from './db.ts';

export interface GateDeps {
  access: AccessConfig;
  pool: PoolLike | null;
}

export async function handleIdentityEvent(req: Request, deps: GateDeps): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const body = (await req.json().catch(() => null)) as { event?: unknown; user?: Record<string, unknown> } | null;
  const event = typeof body?.event === 'string' ? body.event : 'unknown';
  const email = normalizeEmail(body?.user?.email);
  const appMetadata = (body?.user?.app_metadata ?? {}) as Record<string, unknown>;
  const provider = typeof appMetadata.provider === 'string' ? appMetadata.provider : 'unknown';

  let allowlistRole: Role | null = null;
  if (email && deps.pool) {
    try {
      allowlistRole = await withActor(deps.pool, { kind: 'system', does: `identity-${event}` }, async (tx) => {
        const { rows } = await tx.query<{ role: Role }>(
          'select role from comp_report.allowlist where email = $1 and revoked_at is null',
          [email],
        );
        return rows[0]?.role ?? null;
      });
    } catch (error) {
      // The domain rule still stands without the database; allowlisted
      // outsiders are refused until it's back (fail closed).
      console.error('comp-report identity gate: allowlist unavailable', error);
    }
  }

  const decision = email ? decide(email, deps.access, allowlistRole) : { allowed: false, via: null };
  // One line per decision, readable in the function log. Someone refused isn't a user, so their
  // line carries only their address's domain (CR-1.1): enough to tell a personal Google account
  // from a Casa address on another domain, and nothing more about them.
  console.log(JSON.stringify(decision.allowed
    ? { gate: 'comp-report', event, email, provider, allowed: true, via: decision.via }
    : { gate: 'comp-report', event, domain: email ? email.slice(email.lastIndexOf('@') + 1) : null, provider, allowed: false }));

  return decision.allowed
    ? new Response(null, { status: 204 })
    : new Response('This account is not authorised for the Casa Blanca comp report.', { status: 403 });
}
