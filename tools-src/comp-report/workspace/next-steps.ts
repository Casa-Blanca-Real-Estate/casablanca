// Done's What's next (the design pass, 2026-11-06): the ticks are saved on the report as state.doneChecks,
// and read back by Hubert's follow-up reminder (on Done, and on Reports' hero) and logged to the Access
// timeline by the server (report.next_ticked). Pure, so the tests run in node.

/** Two days after sending, the follow-up is due (Done: "Follow up in two days if you haven't heard"). */
export const FOLLOW_UP_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/** What's next's items, by key, as Done shows them and the activity log names them. */
export const WHATS_NEXT: { key: 'follow-up' | 'plan-offer'; text: string }[] = [
  { key: 'follow-up', text: 'Follow up in two days if you haven’t heard' },
  { key: 'plan-offer', text: 'Plan the offer together' },
];
export const NEXT_KEYS: readonly string[] = WHATS_NEXT.map((i) => i.key);

/** Where the follow-up stands: not sent (null), waiting for its two days, due, or ticked. */
export function followUpState(sentAt: string | undefined | null, checks: Record<string, boolean> | undefined, now: Date = new Date()): 'waiting' | 'due' | 'done' | null {
  if (!sentAt) return null;
  if (checks?.['follow-up']) return 'done';
  const t = Date.parse(sentAt);
  if (Number.isNaN(t)) return null;
  return now.getTime() - t >= FOLLOW_UP_AFTER_MS ? 'due' : 'waiting';
}

/** The items ticked or unticked between two saves, for the activity log: only What's next's own keys. */
export function nextTicks(before: unknown, after: unknown): { item: string; on: boolean }[] {
  const was = isChecks(before) ? before : {};
  const now = isChecks(after) ? after : {};
  return NEXT_KEYS.filter((k) => Boolean(was[k]) !== Boolean(now[k])).map((k) => ({ item: k, on: Boolean(now[k]) }));
}

function isChecks(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
