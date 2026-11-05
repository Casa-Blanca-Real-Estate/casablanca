// StreetEasy links being read (Dispatch 09): each read runs in a background
// function the browser starts right after queueing it. While any read is in
// flight the page polls, so each row fills in as its read finishes. A read that
// sits queued (a start that never arrived) or runs far too long (a function that
// died) is started again: the server claims a read exactly once, so a second
// start is harmless.
import { useEffect, useRef } from 'react';
import { linksApi, type LinkReadView, type LinksState } from '../../api.ts';
import { inFlight, RESTART_QUEUED_MS, startsDue } from './read-starts.ts';

export { inFlight, MAX_READS_AT_ONCE, mayRetry, startsDue } from './read-starts.ts';

const POLL_MS = 2500;

export function useLinkReads(reportId: string, reads: LinkReadView[], apply: (next: LinksState) => void, readOnly: boolean): void {
  const lastStart = useRef(new Map<string, number>());
  const pending = inFlight(reads);
  const pendingKey = pending.map((r) => `${r.id}:${r.status}:${r.startedAt ?? ""}`).join(",");

  // Start what's waiting. Admins reading someone else's report watch; they never start a read.
  useEffect(() => {
    if (readOnly) return;
    const tick = () => {
      const now = Date.now();
      for (const r of startsDue(pending, lastStart.current, now)) {
        lastStart.current.set(r.id, now);
        void linksApi.start(reportId, r.id);
      }
    };
    tick();
    const timer = setInterval(tick, RESTART_QUEUED_MS / 2);
    return () => {
      clearInterval(timer);
    };
    // pendingKey stands for `pending`: the same reads in the same states.
  }, [reportId, pendingKey, readOnly]);

  // Poll while anything is in flight.
  const polling = pending.length > 0;
  useEffect(() => {
    if (!polling) return;
    let live = true;
    const timer = setInterval(() => {
      linksApi.load(reportId).then(
        (next) => {
          if (live) apply(next);
        },
        () => undefined, // a missed poll is caught by the next one
      );
    }, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [reportId, polling, apply]);
}

/**
 * "Try again" on a failed read: the link is queued again (a failed read never stops that, links.ts) and the
 * failed row is cleared once the new read is in. The messages already said "Try the link again"; until now
 * that meant pasting it again.
 */
export async function retryRead(reportId: string, r: LinkReadView, apply: (next: LinksState) => void): Promise<void> {
  const added = await linksApi.add(reportId, [r.url], r.purpose);
  apply(added);
  if (added.refused.length) throw new Error(added.refused[0]!.reason);
  apply(await linksApi.dismiss(reportId, r.id));
}
