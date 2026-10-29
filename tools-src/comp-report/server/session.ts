// The per-request check (design §13): every comp report function calls
// requireUser() before doing anything, independent of what Identity decided
// at sign-up. It verifies the session with Identity, applies the access rule,
// and — once the database exists — provisions or refreshes the user's row,
// which is also where a disabled account gets stopped.
//
// Roles come from the access rule (admin list, allowlist grants, domain) on
// every request, and users.role mirrors the result. So granting or revoking a
// role means changing the allowlist, and it takes effect on the next request —
// not at the next sign-in, as roles inside the Identity token would.
import { decide, type AccessConfig } from './access.ts';
import { withActor, type PoolLike, type Role } from './db.ts';
import { HttpError } from './http.ts';
import { GUEST_EMAIL, GUEST_NAME, guestKeyMatches, isGuestToken, type GuestConfig } from './guest.ts';
import { bearerToken, IdentityUnavailable, type IdentityVerifier } from './identity.ts';
import { closedProvider, logAccess, REFUSAL_REASONS, type RefusalReason } from './logs.ts';

export type Capability = 'practice' | 'full';

export interface SessionUser {
  email: string;
  name: string | null;
  role: Role;
  capability: Capability;
  identityId: string;
  provider: string | null;
  /** false when there's no database yet: the user was admitted but not recorded. */
  persisted: boolean;
  /** Signed in through guest mode (server/guest.ts), not Identity: an agent with the sample data. */
  guest: boolean;
}

/** The sample data (Dispatch 07) is for admins, and for a guest walking a preview through. */
export function mayUseSample(user: SessionUser): boolean {
  return user.role === 'admin' || user.guest;
}

export interface AuthDeps {
  verifier: IdentityVerifier;
  access: AccessConfig;
  pool: PoolLike | null;
  /** Guest mode, when it's on for this request; absent or null, a guest token is refused. */
  guest?: GuestConfig | null;
}

const NOT_AUTHORISED = 'This account isn\'t authorised for the comp report. Sign in with your Casa Blanca Google account, or ask an admin to add you.';
const ADDRESS_UNVERIFIED = 'Password sign-in is switched off: Identity is confirming new accounts without checking their inbox. Sign in with Google, or ask an admin to turn email confirmation back on.';

// last_seen_at is refreshed at most this often, so reads don't each cost a write.
const SEEN_REFRESH_MS = 5 * 60_000;
// A request after this long away (or a first one) starts a session in the sign-in log. Its own
// condition: the refresh above writes nothing there.
const SESSION_GAP_MS = 30 * 60_000;

interface UserRow {
  email: string;
  name: string | null;
  role: Role;
  status: 'active' | 'disabled';
  capability: Capability;
  identity_id: string | null;
  identity_provider: string | null;
  last_seen_at: Date | string | null;
}

/**
 * The per-request check. A refusal of someone Identity verified is logged, then rethrown; a
 * request that starts a session is logged before it returns. Both writes are their own
 * transactions, after the check's, and a failed write changes nothing (logs.ts).
 */
export async function requireUser(req: Request, deps: AuthDeps): Promise<SessionUser> {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, 'signed_out', 'Sign in to continue.');
  if (isGuestToken(token)) return requireGuest(token, deps);

  const seen: Verified = { email: null, provider: null, started: false };
  try {
    const user = await requireIdentityUser(token, deps, seen);
    if (seen.started) {
      await logAccess(deps.pool, { kind: 'session_start', source: 'server', email: user.email, provider: closedProvider(user.provider) });
    }
    return user;
  } catch (error) {
    if (error instanceof HttpError && seen.email && (REFUSAL_REASONS as readonly string[]).includes(error.code)) {
      await logAccess(deps.pool, {
        kind: 'refused', source: 'server', reason: error.code as RefusalReason, email: seen.email, provider: closedProvider(seen.provider),
      });
    }
    throw error;
  }
}

/** What the check learned on the way, for the log: who Identity verified, and whether a session started. */
interface Verified {
  email: string | null;
  provider: string | null;
  started: boolean;
}

async function requireIdentityUser(token: string, deps: AuthDeps, seen: Verified): Promise<SessionUser> {

  let identity;
  try {
    identity = await deps.verifier.verify(token);
  } catch (error) {
    if (error instanceof IdentityUnavailable) {
      throw new HttpError(503, 'identity_unavailable', 'Sign-in can\'t be checked right now. Try again in a moment.');
    }
    throw error;
  }
  if (!identity) throw new HttpError(401, 'signed_out', 'Your session has ended. Sign in again.');
  seen.email = identity.email;
  seen.provider = identity.provider;
  if (!identity.confirmed) throw new HttpError(403, 'unconfirmed', 'Confirm your email address first.');

  // Whose address is proven (§13). Google has verified a Google account's
  // address. A password account's address counts only while Identity makes
  // people confirm it by email: with autoconfirm on, anyone could sign up as
  // any casa-blanca.com address and pass the access rule. The comp report uses
  // no other provider, so any other is refused. All of it fails closed.
  if (identity.provider !== 'google' && identity.provider !== 'email') {
    throw new HttpError(403, 'provider_not_allowed', 'Sign in with Google, or with the email account you were invited with.');
  }
  if (identity.provider === 'email') {
    let required: boolean;
    try {
      required = await deps.verifier.emailConfirmationRequired();
    } catch (error) {
      if (error instanceof IdentityUnavailable) {
        throw new HttpError(503, 'identity_unavailable', 'Sign-in can\'t be checked right now. Try again in a moment.');
      }
      throw error;
    }
    if (!required) throw new HttpError(403, 'address_unverified', ADDRESS_UNVERIFIED);
  }

  const email = identity.email;

  // No database yet (Kimani's action): the admin list and the domain rule alone.
  if (!deps.pool) {
    const decision = decide(email, deps.access, null);
    if (!decision.allowed || !decision.role) throw new HttpError(403, 'not_authorised', NOT_AUTHORISED);
    return {
      email,
      name: identity.name,
      role: decision.role,
      capability: 'full',
      identityId: identity.id,
      provider: identity.provider,
      persisted: false,
      guest: false,
    };
  }

  const row = await withActor(deps.pool, { kind: 'system', does: 'sign-in' }, async (tx) => {
    const grant = await tx.query<{ role: Role }>(
      'select role from comp_report.allowlist where email = $1 and revoked_at is null',
      [email],
    );
    const decision = decide(email, deps.access, grant.rows[0]?.role ?? null);
    if (!decision.allowed || !decision.role) throw new HttpError(403, 'not_authorised', NOT_AUTHORISED);

    const existing = (await tx.query<UserRow>(
      `select email, name, role, status, capability, identity_id, identity_provider, last_seen_at
         from comp_report.users where email = $1`,
      [email],
    )).rows[0];

    if (!existing) {
      // Two first requests can race here (the app fires several at once);
      // the loser reads the winner's row instead of failing.
      const inserted = await tx.query<UserRow>(
        `insert into comp_report.users (email, name, identity_provider, identity_id, role, last_seen_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (email) do nothing
         returning email, name, role, status, capability, identity_id, identity_provider, last_seen_at`,
        [email, identity.name, identity.provider, identity.id, decision.role],
      );
      if (inserted.rows[0]) {
        seen.started = true; // the race's winner starts the session; the loser doesn't log it twice
        return inserted.rows[0];
      }
      return (await tx.query<UserRow>(
        `select email, name, role, status, capability, identity_id, identity_provider, last_seen_at
           from comp_report.users where email = $1`,
        [email],
      )).rows[0];
    }

    const lastSeen = existing.last_seen_at ? new Date(existing.last_seen_at).getTime() : 0;
    // A session starts once, however many requests arrive together after the gap: the first to
    // move last_seen_at claims it, and the others' WHERE no longer matches once its lock is released.
    if (Date.now() - lastSeen > SESSION_GAP_MS) {
      const claimed = await tx.query(
        `update comp_report.users set last_seen_at = now()
          where email = $1 and (last_seen_at is null or last_seen_at < now() - interval '30 minutes')`,
        [email],
      );
      seen.started = Boolean(claimed.rowCount);
    }
    const stale = Date.now() - lastSeen > SEEN_REFRESH_MS;
    const changed = existing.role !== decision.role
      || existing.identity_id !== identity.id
      || (identity.name !== null && existing.name !== identity.name);
    if (!stale && !changed) return existing;

    const updated = await tx.query<UserRow>(
      `update comp_report.users
          set role = $2, identity_id = $3, identity_provider = $4,
              name = coalesce($5, name), last_seen_at = now()
        where email = $1
        returning email, name, role, status, capability, identity_id, identity_provider, last_seen_at`,
      [email, decision.role, identity.id, identity.provider, identity.name],
    );
    return updated.rows[0];
  });

  if (!row) throw new HttpError(500, 'user_not_recorded');
  if (row.status !== 'active') {
    seen.started = false;
    throw new HttpError(403, 'disabled', 'This account has been turned off. Ask an admin if that\'s a mistake.');
  }
  return {
    email: row.email,
    name: row.name,
    role: row.role,
    capability: row.capability,
    identityId: identity.id,
    provider: identity.provider,
    persisted: true,
    guest: false,
  };
}

/**
 * A guest (server/guest.ts): the key, on a deploy where guest mode is on, or
 * nothing. The guest's row is recorded like anyone's, as an agent, and an
 * admin can turn it off like anyone's.
 */
async function requireGuest(token: string, deps: AuthDeps): Promise<SessionUser> {
  if (!deps.guest || !guestKeyMatches(token, deps.guest)) {
    throw new HttpError(401, 'signed_out', 'Guest mode isn\'t on here, or that guest link is out of date. Sign in to continue.');
  }
  const user: SessionUser = {
    email: GUEST_EMAIL, name: GUEST_NAME, role: 'agent', capability: 'full',
    identityId: 'guest', provider: 'guest', persisted: false, guest: true,
  };
  if (!deps.pool) return user;
  const row = await withActor(deps.pool, { kind: 'system', does: 'sign-in' }, async (tx) => {
    const r = await tx.query<UserRow>(
      `insert into comp_report.users (email, name, identity_provider, identity_id, role, last_seen_at)
       values ($1, $2, 'guest', 'guest', 'agent', now())
       on conflict (email) do update set last_seen_at = now()
       returning email, name, role, status, capability, identity_id, identity_provider, last_seen_at`,
      [GUEST_EMAIL, GUEST_NAME],
    );
    return r.rows[0];
  });
  if (!row) throw new HttpError(500, 'user_not_recorded');
  if (row.status !== 'active') {
    throw new HttpError(403, 'disabled', 'Guest mode has been turned off for this preview.');
  }
  return { ...user, capability: row.capability, persisted: true };
}
