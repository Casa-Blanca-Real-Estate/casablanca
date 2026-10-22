// A StreetEasy page being read, made obvious (2026-10-22 demo): a read takes
// a minute or two, and the old one-line note looked like nothing was
// happening. A thick bar that names the part of the page it's on, the time so
// far, "Takes 1–2 min", and behind an ⓘ: closing or leaving doesn't stop it.
// The read runs on the server once started, and the page fills in when it
// lands. The named parts are paced by the clock, not reported by Firecrawl:
// they're what every read goes through, in order.
import { useEffect, useState } from 'react';
import type { LinkReadView } from '../../api.ts';
import { Info } from '../newcomp/Frame.tsx';
import '../../styles/reading.css';

/** About how long a read takes, for the bar: it never fills before the read lands. */
const USUAL_MS = 60_000;
/** Past this, it says it's slow, and what to do if it never lands. */
export const SLOW_MS = 3 * 60_000;

const STAGES: { at: number; text: string }[] = [
  { at: 0, text: 'Opening the StreetEasy page' },
  { at: 6_000, text: 'Finding the listing photos' },
  { at: 16_000, text: 'Reading the description' },
  { at: 28_000, text: 'Reviewing the amenities' },
  { at: 40_000, text: 'Checking the price history' },
  { at: 55_000, text: 'Placing it on the map' },
  { at: 75_000, text: 'Putting the details together' },
];

export const KEEPS_GOING = 'You can close this or leave the report: the read keeps going on our side, and what it finds is here when you come back.';

/** "0:07", "1:12". */
export function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Time since the oldest of these reads was queued, ticking once a second. */
export function useElapsed(reads: LinkReadView[]): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!reads.length) return 0;
  const since = Math.min(...reads.map((r) => Date.parse(r.createdAt) || now));
  return Math.max(0, now - since);
}

export function stageAt(elapsed: number): string {
  return [...STAGES].reverse().find((s) => elapsed >= s.at)!.text;
}

/** The thick bar: eases toward 95%, so it moves and never claims done before the read lands. */
export function ReadBar({ elapsed }: { elapsed: number }) {
  const share = 0.95 * (1 - Math.exp(-elapsed / USUAL_MS));
  return <div className="rd-bar" aria-hidden="true"><span style={{ width: `${(share * 100).toFixed(1)}%` }} /></div>;
}

/** The comps' version (step 3 and Sort): one box over the "Reading…" rows. */
export function ReadingNotice({ reads, what }: { reads: LinkReadView[]; what: 'home' | 'comps' }) {
  const elapsed = useElapsed(reads);
  if (!reads.length) return null;
  const n = reads.length;
  const title = what === 'home' ? 'Reading the home’s page' : `Reading ${n === 1 ? '1 comp' : `${n} comps`} from StreetEasy`;
  const slow = elapsed > SLOW_MS;
  return (
    <div className="rd" role="status" aria-live="polite">
      <div className="rd-top">
        <span className="rd-spin" aria-hidden="true" />
        <strong className="rd-title">{title}</strong>
        <span className="rd-clock">{clock(elapsed)}</span>
      </div>
      <ReadBar elapsed={elapsed} />
      <div className="rd-foot">
        <span className="rd-stage">{stageAt(elapsed)}…</span>
        <span className="rd-hint">
          {slow ? 'Slower than usual' : 'Takes 1–2 min'}
          <Info
            label="About reading a page"
            align="right"
            text={`${slow ? 'Still going. If nothing lands in a few minutes, type it in. ' : ''}Each comp shows up in the list as its page is read. ${KEEPS_GOING}`}
          />
        </span>
      </div>
    </div>
  );
}
