// When each StreetEasy read starts (reads.ts): plain functions, so they're tested without the browser's API.
import type { LinkReadView } from '../../api.ts';

/** A read still queued this long after its last start is started again. */
export const RESTART_QUEUED_MS = 20_000;
/** The server treats a read running this long as dead (links.ts: 4 minutes); start it again a little after (the server fails it after its second try). */
export const RESTART_RUNNING_MS = 4.5 * 60_000;
/**
 * At most this many reads at once. Firecrawl's plan reads a handful of pages at a time and answers the rest
 * "busy" (429); started all together, a 12-link PDF read 5 and failed 7 after the reader's retries ran out
 * (Kimani's notebook, 2026-10-29). The rest wait as "Waiting to read the page…" and start as each one ends.
 */
export const MAX_READS_AT_ONCE = 4;

export function inFlight(reads: LinkReadView[]): LinkReadView[] {
  return reads.filter((r) => r.status === 'queued' || r.status === 'running');
}

/**
 * The reads to start now: a running read that died is started again; a queued one starts while fewer than
 * MAX_READS_AT_ONCE are reading (running, or started in the last RESTART_QUEUED_MS and not yet claimed),
 * oldest first. A queued read started before and still unclaimed after RESTART_QUEUED_MS is started again.
 */
export function startsDue(pending: LinkReadView[], lastStart: ReadonlyMap<string, number>, now: number): LinkReadView[] {
  const sinceLast = (r: LinkReadView) => {
    const last = lastStart.get(r.id);
    return last === undefined ? Infinity : now - last;
  };
  const due: LinkReadView[] = [];
  let reading = 0;
  for (const r of pending) {
    if (r.status === 'running') {
      const dead = now - Date.parse(r.startedAt ?? r.createdAt) > RESTART_RUNNING_MS;
      if (dead && sinceLast(r) > RESTART_QUEUED_MS) due.push(r);
      else reading++;
    } else if (sinceLast(r) <= RESTART_QUEUED_MS) {
      reading++; // started just now, not claimed yet
    }
  }
  const waiting = pending
    .filter((r) => r.status === 'queued' && sinceLast(r) > RESTART_QUEUED_MS)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const r of waiting) {
    if (reading >= MAX_READS_AT_ONCE) break;
    due.push(r);
    reading++;
  }
  return due;
}

/** Failures worth reading again: StreetEasy or the reader was busy, slow or walled, not a wrong link. */
const RETRYABLE = new Set(['provider_error', 'timeout', 'blocked']);
export function mayRetry(r: LinkReadView): boolean {
  return r.status === 'failed' && RETRYABLE.has(r.error ?? '');
}
