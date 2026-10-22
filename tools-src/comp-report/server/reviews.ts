// Where Hubert's per-comp review rounds are kept (Dispatch 25): reports.state
// .reviews, by report comp id, append-only. No migration: state is jsonb. Only
// the server writes here, the review call and the sample sort; the browser's
// state save keeps what's stored (api/workspace.ts), so a stale tab can't
// drop a round.
import type { Queryable } from './db.ts';
import { cleanReview, MAX_ROUNDS, type ReviewEntry } from '../workspace/review.ts';
import type { Role } from './db.ts';

/** Review calls a person may make in any 24 hours: CR_REVIEWS_PER_DAY, default 150 (admins at least 400). Each is one small call. */
export function reviewLimit(role: Role, env: Record<string, string | undefined> = process.env): number {
  const set = Number(env.CR_REVIEWS_PER_DAY);
  const agents = Number.isInteger(set) && set > 0 ? set : 150;
  return role === 'admin' ? Math.max(agents, 400) : agents;
}

/**
 * Appends rounds to one comp's review, keeping the newest MAX_ROUNDS. The row
 * is locked while it's read and written, so two rounds at once both land.
 * `ifEmpty` writes only when the comp has none yet (the sample, run again).
 */
export async function appendReview(
  tx: Queryable, reportId: string, reportCompId: string, entries: ReviewEntry[], opts: { ifEmpty?: boolean } = {},
): Promise<void> {
  const current = (await tx.query<{ list: unknown }>(
    `select state -> 'reviews' -> $2 as list from comp_report.reports where id = $1 for update`,
    [reportId, reportCompId],
  )).rows[0];
  if (!current) return;
  const before = cleanReview(current.list);
  if (opts.ifEmpty && before.length) return;
  const list = [...before, ...entries].slice(-MAX_ROUNDS);
  await tx.query(
    `update comp_report.reports
        set state = jsonb_set(coalesce(state, '{}'::jsonb), '{reviews}',
                              coalesce(state -> 'reviews', '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb))
      where id = $1`,
    [reportId, reportCompId, JSON.stringify(list)],
  );
}
