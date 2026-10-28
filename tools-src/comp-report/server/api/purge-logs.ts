// The daily trim of the sign-in and activity logs (Dispatch 22b), for the scheduled function
// comp-report-purge-logs. It only calls the three purge functions, as the system actor
// log-purge; they delete by fixed cutoffs (migration 20261028120000), and nothing else may.
import { withActor, type PoolLike } from '../db.ts';

export async function purgeLogs(pool: PoolLike | null): Promise<{ accessEvents: number; activity: number; buckets: number } | null> {
  if (!pool) return null;
  return withActor(pool, { kind: 'system', does: 'log-purge' }, async (tx) => {
    const n = async (fn: string) => Number((await tx.query<{ n: number }>(`select comp_report.${fn}() as n`)).rows[0]?.n ?? 0);
    return { accessEvents: await n('purge_access_events'), activity: await n('purge_activity'), buckets: await n('purge_signin_buckets') };
  });
}
