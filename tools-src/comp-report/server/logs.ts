// The sign-in log and the activity log (Dispatch 22b, CR-7e).
//
// Every write here runs in its own transaction, as a system actor, after the
// request's own work, and is awaited inside its own try/catch before the
// response goes back: a floating promise is frozen when the function returns,
// and a failure to log never changes the HTTP result. Nothing here holds state
// between requests (the functions are warm and shared).
//
// Whose address is stored is the database's call, not this module's: a trigger
// on access_events drops any address without a users row, and computes the
// dedupe key from what it kept (migration 20261028120000).
import { createHmac, randomBytes } from 'node:crypto';
import { withActor, type PoolLike, type Queryable } from './db.ts';
import type { SessionUser } from './session.ts';

export type AccessKind = 'gate' | 'session_start' | 'refused' | 'viewed_other' | 'viewed_list' | 'signin_error' | 'capability_change';
export type RefusalReason = 'not_authorised' | 'disabled' | 'unconfirmed' | 'address_unverified' | 'provider_not_allowed';
export const REFUSAL_REASONS: readonly RefusalReason[] = ['not_authorised', 'disabled', 'unconfirmed', 'address_unverified', 'provider_not_allowed'];

export interface AccessRow {
  kind: AccessKind;
  source: 'server' | 'gate' | 'public';
  event?: 'validate' | 'signup' | 'login' | 'other' | null;
  provider?: 'google' | 'email' | 'other' | null;
  allowed?: boolean | null;
  via?: 'admin' | 'allowlist' | 'domain' | null;
  reason?: RefusalReason | null;
  error?: SignInError | null;
  errorCode?: 'gate_webhook' | 'signups_not_allowed' | 'other' | null;
  capability?: 'practice' | 'full' | null;
  email?: string | null;
  domain?: string | null;
  byEmail?: string | null;
  reportId?: string | null;
  ownerEmail?: string | null;
}

export const SIGN_IN_ERRORS = ['access_denied', 'admin_policy_enforced', 'invalid_request', 'server_error'] as const;
export type SignInError = (typeof SIGN_IN_ERRORS)[number] | 'other';

/** A closed-list value, or `other`. */
export function closed<T extends string>(value: unknown, list: readonly T[]): T | 'other' {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : 'other';
}

export const closedProvider = (p: unknown) => closed(p, ['google', 'email'] as const);
export const closedEvent = (e: unknown) => closed(e, ['validate', 'signup', 'login'] as const);

/** One row into access_events, in a transaction of its own. Never throws. */
export async function insertAccessEvent(tx: Queryable, row: AccessRow): Promise<void> {
  await tx.query(
    `insert into comp_report.access_events
       (kind, source, event, provider, allowed, via, reason, error, error_code, capability, email, domain, by_email, report_id, owner_email)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     on conflict do nothing`,
    [row.kind, row.source, row.event ?? null, row.provider ?? null, row.allowed ?? null, row.via ?? null,
      row.reason ?? null, row.error ?? null, row.errorCode ?? null, row.capability ?? null, row.email ?? null,
      row.domain ?? null, row.byEmail ?? null, row.reportId ?? null, row.ownerEmail ?? null],
  );
}

export async function logAccess(pool: PoolLike | null, row: AccessRow): Promise<boolean> {
  if (!pool) return false;
  try {
    await withActor(pool, { kind: 'system', does: 'access-log' }, (tx) => insertAccessEvent(tx, row));
    return true;
  } catch (error) {
    console.error('comp-report: the access log write failed', row.kind, error instanceof Error ? error.message : error);
    return false;
  }
}

/** Someone read a report that isn't theirs: one row per viewer, report and half hour. */
export async function logViewed(pool: PoolLike | null, user: SessionUser, report: { id: string; owner_email: string }): Promise<void> {
  if (report.owner_email === user.email) return;
  await logAccess(pool, { kind: 'viewed_other', source: 'server', byEmail: user.email, reportId: report.id, ownerEmail: report.owner_email });
}

// ── The activity log ────────────────────────────────────────────────────────

/** What the server writes for what it did; the browser can't send these. */
export const ACTION_NAMES = [
  'import.read', 'comp.added', 'comp.tiered', 'comp.removed', 'comp.restored', 'call.given', 'narrative.copied', 'report.sent',
] as const;
export type ActionName = (typeof ACTION_NAMES)[number];

/** Who did it: the agent, or Hubert on their behalf (the Hubert action trail uses the same word). */
export type ActionBy = 'agent' | 'hubert';

export interface Action {
  name: ActionName;
  reportId: string | null;
  /** Enums and counts only; the database checks each name's keys and values. */
  detail?: Record<string, string | number | boolean>;
}

/** The server's own activity rows, after the handler's transaction has committed. Never throws. */
export async function logActivity(pool: PoolLike | null, userEmail: string, actions: Action | Action[]): Promise<void> {
  const list = Array.isArray(actions) ? actions : [actions];
  if (!pool || !list.length) return;
  try {
    await withActor(pool, { kind: 'system', does: 'activity-log' }, async (tx) => {
      for (const a of list) {
        await tx.query(
          `insert into comp_report.activity (user_email, report_id, kind, name, detail) values ($1, $2, 'action', $3, $4::jsonb)`,
          [userEmail, a.reportId, a.name, JSON.stringify(a.detail ?? {})],
        );
      }
    });
  } catch (error) {
    console.error('comp-report: the activity log write failed', list.map((a) => a.name).join(','), error instanceof Error ? error.message : error);
  }
}

// ── The open doors: the IP, the day's salt, the limits ─────────────────────

export interface IpInfo {
  /** The address as hashed: an IPv6 address cut to its /64. Never logged or stored. */
  value: string;
  family: 'v4' | 'v6';
}

/** Netlify's own `context.ip`, never X-Forwarded-For (the caller controls that). */
export function ipFrom(context: { ip?: unknown } | undefined | null): IpInfo | null {
  const raw = typeof context?.ip === 'string' ? context.ip.trim().toLowerCase() : '';
  if (!raw) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(raw)) return { value: raw, family: 'v4' };
  if (!raw.includes(':') || !/^[0-9a-f:.]+$/.test(raw)) return null;
  // Expand :: and keep the first four groups.
  const [head, tail] = raw.split('::') as [string, string | undefined];
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  if (groups.length < 4) return null;
  return { value: groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '') || '0').join(':') + '::/64', family: 'v6' };
}

const utcDay = (at: Date) => at.toISOString().slice(0, 10);
const utcHour = (at: Date) => `${at.toISOString().slice(0, 13)}:00:00Z`;

/** Today's salt (UTC), made on first use. Readable by the system actor only. */
export async function daySalt(tx: Queryable, at = new Date()): Promise<string> {
  const day = utcDay(at);
  await tx.query('insert into comp_report.signin_salt (day, salt) values ($1, $2) on conflict (day) do nothing', [day, randomBytes(32).toString('hex')]);
  const { rows } = await tx.query<{ salt: string }>('select salt from comp_report.signin_salt where day = $1', [day]);
  if (!rows[0]) throw new Error('no salt for today');
  return rows[0].salt;
}

export const ipHash = (salt: string, ip: IpInfo) => createHmac('sha256', salt).update(ip.value).digest('hex');

export interface Limits {
  perIp: number;
  overall: number;
}
export const SIGNIN_ERROR_LIMITS: Limits = { perIp: 20, overall: 200 };
export const GATE_LIMITS: Limits = { perIp: 600, overall: 1000 };

/** One atomic count. The global counter first; a per-IP row only for calls that passed it. */
export async function withinLimits(tx: Queryable, scope: 'signin_error' | 'gate', hash: string, limits: Limits, at = new Date()): Promise<boolean> {
  const bump = async (key: string) => Number((await tx.query<{ n: number }>(
    `insert into comp_report.signin_error_buckets (hour, scope, ip_hash, n) values ($1, $2, $3, 1)
     on conflict (hour, scope, ip_hash) do update set n = comp_report.signin_error_buckets.n + 1
     returning n`,
    [utcHour(at), scope, key],
  )).rows[0]?.n ?? Infinity);
  if (await bump('*') > limits.overall) return false;
  return await bump(hash) <= limits.perIp;
}

export interface OpenDoorResult {
  stored: boolean;
  /** The first 8 hex characters of the day's HMAC of the address, for the gate's console line; null when the salt step didn't run. */
  bucket: string | null;
  skipped?: string;
}

/**
 * The open doors' logging step: salt, counters, insert, in one short
 * transaction with tight lock and statement timeouts, raced against a
 * one-second timer. Any error, timeout or hit cap is a skip. Never throws.
 */
export async function logFromOpenDoor(
  pool: PoolLike | null,
  scope: 'signin_error' | 'gate',
  ip: IpInfo | null,
  row: AccessRow,
  opts: { timeoutMs?: number; limits?: Limits } = {},
): Promise<OpenDoorResult> {
  if (!pool) return { stored: false, bucket: null, skipped: 'no_database' };
  if (!ip) return { stored: false, bucket: null, skipped: 'no_ip' };
  let bucket: string | null = null;
  const limits = opts.limits ?? (scope === 'gate' ? GATE_LIMITS : SIGNIN_ERROR_LIMITS);
  const work = withActor(pool, { kind: 'system', does: 'access-log' }, async (tx) => {
    await tx.query("set local lock_timeout = '500ms'");
    await tx.query("set local statement_timeout = '500ms'");
    const hash = ipHash(await daySalt(tx), ip);
    bucket = hash.slice(0, 8);
    if (!(await withinLimits(tx, scope, hash, limits))) return false;
    await insertAccessEvent(tx, row);
    return true;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), opts.timeoutMs ?? 1000);
  });
  try {
    const outcome = await Promise.race([work, timeout]);
    if (outcome === 'timeout') {
      work.catch(() => undefined);
      console.error(`comp-report ${scope} log: skipped (timed out)`);
      return { stored: false, bucket, skipped: 'timeout' };
    }
    if (!outcome) {
      console.error(`comp-report ${scope} log: skipped (limit reached)`);
      return { stored: false, bucket, skipped: 'limit' };
    }
    return { stored: true, bucket };
  } catch (error) {
    console.error(`comp-report ${scope} log: skipped`, error instanceof Error ? error.message : error);
    return { stored: false, bucket, skipped: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

