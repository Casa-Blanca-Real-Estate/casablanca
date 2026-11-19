// The sign-up and log-in gate. Netlify Identity calls the identity-validate,
// identity-signup and identity-login functions with the user it's about to
// admit; a 2xx lets them in, anything else refuses (GoTrue retries a refusal
// a few times, then shows the user a 422). Since GoTrue's March 2026 fix
// these fire for Google sign-ups too — CR-1 is to prove that live with a
// non-Casa Google account (Dispatch 05 §4).
//
// This is the first of the two checks. The per-request check (session.ts)
// holds regardless, so a refusal here missing is never an open door.
//
// The sign-in log (Dispatch 22b): each decision is also a `gate` row. These
// functions have no caller check and Netlify signs nothing this repo can
// verify, so anyone can POST them any JSON: their rows are marked unverified,
// and nothing in them comes from the body except through a closed list. The
// logging step runs after the decision, can't take longer than a second, and
// never changes the answer: no size, missing IP, full limit or database error
// refuses a sign-in.
import { decide, emailDomain, normalizeEmail, type AccessConfig } from './access.ts';
import { withActor, type PoolLike, type Role } from './db.ts';
import { closedEvent, closedProvider, ipFrom, logFromOpenDoor, type OpenDoorResult } from './logs.ts';

export interface GateDeps {
  access: AccessConfig;
  pool: PoolLike | null;
}

/** The part of Netlify's function context the gate reads: its own record of the caller's address. */
export interface GateContext {
  ip?: unknown;
}

/** Bodies over this are still decided on, as today, but leave no log row. */
const MAX_LOGGED_BODY = 64 * 1024;

/** The webmail domains a refused person's row may name; any other domain is stored as null. */
const NAMED_DOMAINS = ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'yahoo.com'];

export async function handleIdentityEvent(req: Request, deps: GateDeps, context?: GateContext | null): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const text = await req.text().catch(() => '');
  type Body = { event?: unknown; user?: Record<string, unknown> };
  let body: Body | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Body;
  } catch {
    body = null;
  }
  const event = closedEvent(body?.event);
  const email = normalizeEmail(body?.user?.email);
  const appMetadata = (body?.user?.app_metadata ?? {}) as Record<string, unknown>;
  const provider = closedProvider(appMetadata?.provider);

  // Casa's domain and the admin list need no database, so they're decided first and the
  // allowlist is read only for anyone else. Identity waits 5 seconds for an answer; a cold
  // function waking a sleeping database could take longer, and the agent would be refused.
  const settled = email ? decide(email, deps.access, null) : null;
  let allowlistRole: Role | null = null;
  if (email && deps.pool && !settled?.allowed) {
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

  const decision = settled?.allowed ? settled : email ? decide(email, deps.access, allowlistRole) : { allowed: false, via: null };

  // The log row, once the answer is settled. No email (invalid or missing JSON) or an oversized
  // body: no row. A domain only from the closed list, so an anonymous caller can't plant text.
  const ip = ipFrom(context);
  let logged: OpenDoorResult = { stored: false, bucket: null, skipped: 'no_row' };
  if (email && text.length <= MAX_LOGGED_BODY) {
    const domain = emailDomain(email);
    logged = await logFromOpenDoor(deps.pool, 'gate', ip, {
      kind: 'gate',
      source: 'gate',
      event,
      provider,
      allowed: decision.allowed,
      via: decision.via,
      email,
      domain: [...deps.access.domains, ...NAMED_DOMAINS].includes(domain) ? domain : null,
    });
  }

  // One line per decision, readable in the function log. Someone refused isn't a user, so their
  // line carries only their address's domain (CR-1.1): enough to tell a personal Google account
  // from a Casa address on another domain, and nothing more about them. The address the call
  // came from is never written: only whether there was one, its family, and its day's bucket.
  const ipLine = { present: Boolean(ip), family: ip?.family ?? null, bucket: logged.bucket };
  console.log(JSON.stringify(decision.allowed
    ? { gate: 'comp-report', event, email, provider, allowed: true, via: decision.via, ip: ipLine }
    : { gate: 'comp-report', event, domain: email ? emailDomain(email) : null, provider, allowed: false, ip: ipLine }));

  if (!decision.allowed) return new Response('This account is not authorised for the Casa Blanca comp report.', { status: 403 });
  const trimmed = trimmedMetadata(body?.user?.user_metadata);
  if (!trimmed) return new Response(null, { status: 204 });
  console.log(JSON.stringify({ gate: 'comp-report', event, trimmed: trimmed.dropped }));
  return new Response(JSON.stringify({ user_metadata: trimmed.keep }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/** The only user_metadata the Studio reads (identity.ts, toIdentityUser). */
const KEPT_METADATA = ['full_name', 'name'];

/**
 * A new Google account arrives with more user_metadata than Netlify can pass to a function: its token,
 * copied into the Lambda client context, goes over AWS's 3,584-byte cap and every function call fails
 * with Netlify's bare "Internal Error" (2026-10-30, creative@). GoTrue replaces user_metadata with what
 * a 2xx hook answer carries (api/hooks.go), before it issues the token, so the gate keeps only the name.
 * Returns null when there's nothing to drop, so an account already trimmed gets the empty 204.
 */
export function trimmedMetadata(raw: unknown): { keep: Record<string, string>; dropped: string[] } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const meta = raw as Record<string, unknown>;
  const dropped = Object.keys(meta).filter((k) => !KEPT_METADATA.includes(k) || typeof meta[k] !== 'string' || (meta[k] as string).length > 200);
  if (!dropped.length) return null;
  const keep: Record<string, string> = {};
  for (const k of KEPT_METADATA) {
    const v = meta[k];
    if (typeof v === 'string' && v.trim()) keep[k] = v.trim().slice(0, 200);
  }
  return { keep, dropped: dropped.slice(0, 20) };
}
