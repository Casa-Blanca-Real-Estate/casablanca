// The comp report's database access. Every query runs inside withActor(),
// which opens a transaction and calls comp_report.enter() first, so row-level
// security knows who is asking before anything is read or written. Queries are
// also scoped explicitly in their WHERE clauses — both layers, always (§12).
//
// Which database: Netlify Database's own connection (NETLIFY_DB_URL, set by
// the platform) whenever it exists. CR_LOCAL_DATABASE_URL is for local
// development and tests only and is ignored wherever the platform provides a
// database. Nothing here reads DATABASE_URL — in the Claude Code cloud
// environment that variable points at another project's database.
import { getDatabase } from '@netlify/database';

export type Role = 'agent' | 'mentor' | 'admin' | 'external';
export const ROLES: readonly Role[] = ['agent', 'mentor', 'admin', 'external'];

export type Actor =
  | { kind: 'user'; email: string; role: Role }
  | { kind: 'system'; does: string }
  /** The inspection API's reader (Dispatch 23): select-only policies, and a read-only transaction. */
  | { kind: 'inspect' };

export interface QueryResult<R> {
  rows: R[];
  rowCount: number | null;
}

/** The slice of a pg-style client this code uses; pg.Pool and Neon's Pool both fit. */
export interface Queryable {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<R>>;
}
export interface PoolClientLike extends Queryable {
  release(error?: Error | boolean): void;
}
export interface PoolLike {
  connect(): Promise<PoolClientLike>;
  on?(event: 'error', listener: (error: Error) => void): unknown;
}

export class DatabaseUnavailable extends Error {
  readonly reason: 'not_configured' | 'not_migrated' | 'unsafe_role';

  constructor(reason: DatabaseUnavailable['reason'], message: string) {
    super(message);
    this.reason = reason;
  }
}

let cachedPool: PoolLike | null | undefined;

/** The process-wide pool, or null when no database is configured (the stub state). */
export function databasePool(env: Record<string, string | undefined> = process.env): PoolLike | null {
  if (cachedPool !== undefined) return cachedPool;
  if (env.NETLIFY_DB_URL) {
    cachedPool = getDatabase().pool as unknown as PoolLike;
  } else if (env.CR_LOCAL_DATABASE_URL) {
    cachedPool = getDatabase({ connectionString: env.CR_LOCAL_DATABASE_URL }).pool as unknown as PoolLike;
  } else {
    cachedPool = null;
  }
  // An idle pooled connection can be closed from the other end (Neon suspends
  // an idle database). Unlistened, that error would crash the function; the
  // pool just replaces the connection on next use.
  cachedPool?.on?.('error', (error) => console.error('comp-report: idle database connection lost:', error.message));
  return cachedPool;
}

const migrated = new WeakMap<PoolLike, boolean>();

/**
 * Runs fn in one transaction as the given actor. Refuses to run if the schema
 * isn't there (wrong or unmigrated database) or if the database role the
 * functions connect as bypasses row-level security. The inspect actor's
 * transaction is read only, whatever its policies say.
 */
export async function withActor<T>(pool: PoolLike, actor: Actor, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false; // a connection whose rollback failed is discarded, not reused
  try {
    if (!migrated.get(pool)) {
      const { rows } = await client.query<{ ok: boolean }>(
        "select to_regprocedure('comp_report.enter(text,text,text,text)') is not null as ok",
      );
      if (!rows[0]?.ok) {
        throw new DatabaseUnavailable('not_migrated', 'The database has no comp_report schema.');
      }
      migrated.set(pool, true);
    }
    await client.query(actor.kind === 'inspect' ? 'begin read only' : 'begin');
    const params = actor.kind === 'user'
      ? ['user', actor.email, actor.role, null]
      : actor.kind === 'system'
        ? ['system', null, null, actor.does]
        : ['inspect', null, null, null];
    const { rows } = await client.query<{ db_role: string; bypasses_rls: boolean }>(
      'select db_role, bypasses_rls from comp_report.enter($1, $2, $3, $4)',
      params,
    );
    if (!rows[0] || rows[0].bypasses_rls) {
      throw new DatabaseUnavailable(
        'unsafe_role',
        `The database role ${rows[0]?.db_role ?? '(unknown)'} bypasses row-level security; refusing to run.`,
      );
    }
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {
      broken = true;
    });
    throw error;
  } finally {
    client.release(broken);
  }
}
