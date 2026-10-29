// The test user (Dispatch 23 item 4, NW-090 b): how a Claude Code session
// writes in production, as one fixed agent on an @test.invalid address and
// no one else. CR_TEST_KEY, sent as X-Test-Key, makes requireUser return that
// user; every function that calls requireUser honours it, the background ones
// included.
//
// The header decides the path. Without it, nothing here reads more than the
// environment and the header: no database, no error, and requireUser goes on
// to Identity as if the key didn't exist. With it (even empty), the request is
// the test user's or it is refused: a wrong or empty key, or test mode off, is
// a 401 and never falls through to Identity. Only after the key matches does a
// misconfiguration answer 503: the key set equal to the inspect or decide key,
// or CR_TEST_USER_EMAIL outside @test.invalid.
//
// The role (agent) and level (practice) are constants here, never from the
// environment or the allowlist. Its AI calls use CR_EVAL_ANTHROPIC_API_KEY
// only, within $2 a day (guardTestAi).
import { isTestAddress, normalizeEmail } from './access.ts';
import { withActor, type PoolLike } from './db.ts';
import { HttpError } from './http.ts';
import { keyCollides, sameKey, usableKey } from './keys.ts';
import type { SessionUser } from './session.ts';

export const TEST_KEY_HEADER = 'x-test-key';
export const TEST_USER_ROLE = 'agent' as const;
export const TEST_USER_CAPABILITY = 'practice' as const;
const TEST_USER_NAME = 'Test user';

/** A day's spend for the test user, in dollars (UTC). */
export const TEST_DAILY_BUDGET_USD = 2;
/** What a usage row with no cost counts as against the budget. */
export const NULL_COST_USD = 0.25;

type Env = Record<string, string | undefined>;

function log(event: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ at: 'comp-report-test-key', time: new Date().toISOString(), event, ...extra }));
}

/** Whether the request carries X-Test-Key at all: header presence, even empty, is the test path. */
export const carriesTestKey = (req: Request) => req.headers.get(TEST_KEY_HEADER) !== null;

/**
 * Checks the test key and the configuration around it, before any query.
 * Returns the test user's address. 401 for a missing, empty or wrong key and
 * for test mode off; 503 for a misconfiguration, only once the key matched.
 */
export function verifyTestKey(req: Request, env: Env): string {
  const given = req.headers.get(TEST_KEY_HEADER);
  const expected = usableKey(env, 'CR_TEST_KEY');
  if (expected === null) {
    log('refused', { reason: 'off' });
    throw new HttpError(401, 'test_mode_off', 'Test mode is off here.');
  }
  if (given === null || given.trim() === '' || !sameKey(given.trim(), expected)) {
    log('refused', { reason: given === null || given.trim() === '' ? 'missing_key' : 'wrong_key' });
    throw new HttpError(401, 'bad_key', 'That test key isn\'t valid here.');
  }
  if (keyCollides(env, 'CR_TEST_KEY')) {
    log('misconfigured', { reason: 'keys_collide' });
    throw new HttpError(503, 'test_mode_misconfigured', 'CR_TEST_KEY is set to the same value as another session key. Set each to its own.');
  }
  const email = normalizeEmail(env.CR_TEST_USER_EMAIL);
  if (!email || !isTestAddress(email)) {
    log('misconfigured', { reason: 'email' });
    throw new HttpError(503, 'test_mode_misconfigured', 'CR_TEST_USER_EMAIL must be an @test.invalid address.');
  }
  return email;
}

/**
 * The test user, for a request that carries X-Test-Key; null for one that
 * doesn't. Provisions its row on first use, as the system actor test-key (the
 * only actor the database lets insert is_test = true). An address already on
 * a real user's row is refused.
 */
export async function testUser(req: Request, env: Env, pool: PoolLike | null): Promise<SessionUser | null> {
  if (!carriesTestKey(req)) return null;
  const email = verifyTestKey(req, env);
  const user: SessionUser = {
    email, name: TEST_USER_NAME, role: TEST_USER_ROLE, capability: TEST_USER_CAPABILITY,
    identityId: 'test-key', provider: 'test', persisted: false, guest: false, test: true,
  };
  log('use', { method: req.method, path: new URL(req.url).pathname });
  if (!pool) return user;
  const row = await withActor(pool, { kind: 'system', does: 'test-key' }, async (tx) => {
    const found = (await tx.query<{ is_test: boolean; status: string }>(
      'select is_test, status from comp_report.users where email = $1', [email],
    )).rows[0];
    if (found) return found;
    await tx.query(
      `insert into comp_report.users (email, name, identity_provider, identity_id, role, capability, is_test, last_seen_at)
       values ($1, $2, 'test', 'test-key', $3, $4, true, now())
       on conflict (email) do nothing`,
      [email, TEST_USER_NAME, TEST_USER_ROLE, TEST_USER_CAPABILITY],
    );
    return (await tx.query<{ is_test: boolean; status: string }>(
      'select is_test, status from comp_report.users where email = $1', [email],
    )).rows[0];
  });
  if (!row?.is_test) {
    log('misconfigured', { reason: 'real_user_row' });
    throw new HttpError(503, 'test_mode_misconfigured', 'CR_TEST_USER_EMAIL is a real user\'s address here.');
  }
  if (row.status !== 'active') throw new HttpError(403, 'disabled', 'The test user has been turned off.');
  return { ...user, persisted: true };
}

/** The Anthropic key for this user's calls: the eval key for the test user, and nothing else. */
export function anthropicKeyFor(user: SessionUser | undefined, env: Env = process.env): string | undefined {
  if (user?.test) {
    const key = (env.CR_EVAL_ANTHROPIC_API_KEY ?? '').trim();
    if (!key) throw new HttpError(503, 'eval_key_not_set', 'The test user\'s AI calls need CR_EVAL_ANTHROPIC_API_KEY, which isn\'t set.');
    return key;
  }
  return env.ANTHROPIC_API_KEY;
}

/**
 * Before each of the test user's AI calls: the eval key must be set, and the
 * day's spend under $2. The sum is taken holding a lock on the user, so two
 * calls can't both pass on the last few cents; calls already in flight can
 * overshoot by their own cost. Does nothing for anyone else.
 */
export async function guardTestAi(pool: PoolLike | null, user: SessionUser, env: Env = process.env): Promise<void> {
  if (!user.test) return;
  anthropicKeyFor(user, env);
  if (!pool) return;
  const spent = await withActor(pool, { kind: 'user', email: user.email, role: user.role }, async (tx) => {
    await tx.query('select pg_advisory_xact_lock(hashtext($1))', [user.email]);
    const { rows } = await tx.query<{ usd: string }>(
      `select coalesce(sum(coalesce(estimated_cost_usd, $2)), 0)::text as usd from comp_report.usage
        where user_email = $1 and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`,
      [user.email, NULL_COST_USD],
    );
    return Number(rows[0]?.usd ?? 0);
  });
  if (spent >= TEST_DAILY_BUDGET_USD) {
    throw new HttpError(429, 'test_budget', `The test user has spent $${TEST_DAILY_BUDGET_USD} on AI today (UTC).`);
  }
}
