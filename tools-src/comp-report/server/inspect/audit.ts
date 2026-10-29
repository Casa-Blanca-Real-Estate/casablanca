// The inspection API's audit (Dispatch 23 item 3): one access_events row per
// call that returns data, written before the data is read, by the system actor
// inspect-audit in a transaction of its own. That actor's policies admit only
// these rows, with no address on them, and let it read back only its own
// text=1 rows, to count them against the caps.
import { withActor, type PoolLike } from '../db.ts';
import type { ViewName } from './views.ts';

export const AUDIT_ACTOR = { kind: 'system', does: 'inspect-audit' } as const;

/** text=1 across the key: at most this many an hour, and a day. */
export const TEXT_CAPS = { hour: 20, day: 100 } as const;

export interface AuditEntry {
  view: ViewName | 'copy-to-test';
  reportId: string | null;
  text: boolean;
  /** copy-to-test: the new report, generated before the copy is written. */
  targetReportId?: string | null;
}

/**
 * Writes the row. For text=1 the count and the insert share the transaction,
 * behind one advisory lock, so two calls racing for the last place can't both
 * get it; a call over either cap writes nothing and gets 'capped'. Throws when
 * the row can't be written.
 */
export async function writeAudit(pool: PoolLike, entry: AuditEntry): Promise<'written' | 'capped'> {
  const kind = entry.view === 'copy-to-test' ? 'inspect_copy' : entry.text ? 'inspect_text' : 'inspect';
  return withActor(pool, AUDIT_ACTOR, async (tx) => {
    if (kind === 'inspect_text') {
      await tx.query(`select pg_advisory_xact_lock(hashtext('comp_report.inspect_text'))`);
      const { rows } = await tx.query<{ hour: number; day: number }>(
        `select count(*) filter (where at > now() - interval '60 minutes')::int as hour,
                count(*)::int as day
           from comp_report.access_events
          where kind = 'inspect_text' and at > now() - interval '24 hours'`,
      );
      const n = rows[0] ?? { hour: Infinity, day: Infinity };
      if (n.hour >= TEXT_CAPS.hour || n.day >= TEXT_CAPS.day) return 'capped';
    }
    await tx.query(
      `insert into comp_report.access_events (kind, source, report_id, view, text_flag, target_report_id)
       values ($1, 'server', $2, $3, $4, $5)`,
      [kind, entry.reportId, entry.view, kind === 'inspect_text', entry.targetReportId ?? null],
    );
    return 'written';
  });
}
