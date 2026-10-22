// StreetEasy links being read (Dispatch 09): each read runs in a background
// function the browser starts right after queueing it. While any read is in
// flight the page polls, so each row fills in as its read finishes. A read that
// sits queued (a start that never arrived) or runs far too long (a function that
// died) is started again: the server claims a read exactly once, so a second
// start is harmless.
import { useEffect, useRef } from 'react';
import { linksApi, type LinkReadView, type LinksState } from '../../api.ts';

const POLL_MS = 2500;
/** A read still queued this long after its last start is started again. */
const RESTART_QUEUED_MS = 20_000;
/** The server treats a read running this long as dead (links.ts: 4 minutes); start it again a little after (the server fails it after its second try). */
const RESTART_RUNNING_MS = 4.5 * 60_000;

export function inFlight(reads: LinkReadView[]): LinkReadView[] {
  return reads.filter((r) => r.status === 'queued' || r.status === 'running');
}

export function useLinkReads(reportId: string, reads: LinkReadView[], apply: (next: LinksState) => void, readOnly: boolean): void {
  const lastStart = useRef(new Map<string, number>());
  const pending = inFlight(reads);
  const pendingKey = pending.map((r) => `${r.id}:${r.status}:${r.startedAt ?? ""}`).join(",");

  // Start what's waiting. Admins reading someone else's report watch; they never start a read.
  useEffect(() => {
    if (readOnly) return;
    const tick = () => {
      const now = Date.now();
      for (const r of pending) {
        const last = lastStart.current.get(r.id);
        const sinceLast = last === undefined ? Infinity : now - last;
        const due = r.status === 'queued'
          ? sinceLast > RESTART_QUEUED_MS
          : now - Date.parse(r.startedAt ?? r.createdAt) > RESTART_RUNNING_MS && sinceLast > RESTART_QUEUED_MS;
        if (due) {
          lastStart.current.set(r.id, now);
          void linksApi.start(reportId, r.id);
        }
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
