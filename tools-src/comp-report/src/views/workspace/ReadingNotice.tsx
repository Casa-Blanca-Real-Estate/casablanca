// A StreetEasy page being read, made obvious (2026-10-22 demo): a read takes
// about a minute, sometimes two, and the old one-line note looked like nothing
// was happening. This says it's reading, for how long so far, how long it
// usually takes, and that closing or leaving doesn't stop it: the read runs on
// the server once started, and the page fills in when it lands.
import { useEffect, useState } from 'react';
import type { LinkReadView } from '../../api.ts';
import '../../styles/reading.css';

/** About how long a read takes, for the bar: it never fills before the read lands. */
const USUAL_MS = 60_000;
/** Past this, it says it's slow, and what to do if it never lands. */
const SLOW_MS = 3 * 60_000;

/** "0:07", "1:12": time since the oldest read was queued. */
function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Ticks once a second while mounted. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function ReadingNotice({ reads, what }: { reads: LinkReadView[]; what: 'home' | 'comps' }) {
  const now = useNow();
  if (!reads.length) return null;
  const since = Math.min(...reads.map((r) => Date.parse(r.createdAt) || now));
  const elapsed = Math.max(0, now - since);
  // Eases toward 95%: moving, honest, never full until it's done.
  const share = 0.95 * (1 - Math.exp(-elapsed / USUAL_MS));
  const n = reads.length;
  const title = what === 'home'
    ? 'Reading the home’s StreetEasy page'
    : `Reading ${n === 1 ? '1 comp’s StreetEasy page' : `${n} comps’ StreetEasy pages`}`;
  const lands = what === 'home'
    ? 'The details below fill in by themselves when it’s read. Type anything you know meanwhile.'
    : 'Each comp shows up in the list as its page is read.';
  return (
    <div className="rd" role="status" aria-live="polite">
      <div className="rd-top">
        <span className="rd-spin" aria-hidden="true" />
        <strong className="rd-title">{title}…</strong>
        <span className="rd-clock" aria-label={`${clock(elapsed)} so far`}>{clock(elapsed)}</span>
      </div>
      <div className="rd-bar" aria-hidden="true"><span style={{ width: `${(share * 100).toFixed(1)}%` }} /></div>
      <p className="rd-text">
        {elapsed > SLOW_MS
          ? 'This one is taking longer than usual. It’s still going; if nothing lands in a few minutes, type the details in. '
          : 'This usually takes about a minute, sometimes two. '}
        {lands}
      </p>
      <p className="rd-text rd-keep">You can close this or leave the report: the read keeps going, and it’s here when you come back.</p>
    </div>
  );
}
