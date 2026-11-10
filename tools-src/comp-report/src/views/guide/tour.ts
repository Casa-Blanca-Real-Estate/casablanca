// The pointing tour (QW-3, Kimani 2026-11-10): for an agent's first run through a report, a card that points at
// the exact thing to click next, screen by screen, following the guide's eight steps (steps.ts). It never
// blocks the page: the agent clicks the real thing, and the tour moves on when they do (or on "Got it").
// The words here are written, never generated, and say what the guide's steps say, shorter. A rough version
// for Kimani to design over in Claude Design.
//
// Kept per browser, like presenter mode: whether it's on, and which tips the agent has already been through.
import type { LoggedScreen } from '../workspace/screens.ts';

export interface TourTip {
  id: string;
  screen: LoggedScreen;
  /** Where to point, in order: the first that's on the page and visible wins. */
  targets: string[];
  title: string;
  body: string;
  /** The last tip of the tour: "Got it" ends it. */
  last?: boolean;
}

export const TIPS: TourTip[] = [
  {
    id: 'reports-start', screen: 'reports', targets: ['.sh-start', '.sh-hero .btn.primary'],
    title: 'Start a report here',
    body: 'Paste the home’s StreetEasy link and say who it’s for, like “buyer, Jordan and Sam”. Or use + New comp.',
  },
  {
    id: 'home-link', screen: 'new-report', targets: ['.nr-line'],
    title: 'The home you’re pricing',
    body: 'Paste its StreetEasy link, or type its address. The link fills in most of the details for you.',
  },
  {
    id: 'home-side', screen: 'new-report', targets: ['.nr-pair'],
    title: 'Who it’s for',
    body: 'Pick Buyer or Seller, add the client’s name, and check Co-op or Condo.',
  },
  {
    id: 'home-next', screen: 'new-report', targets: ['.nr-foot .btn.primary'],
    title: 'Then go on',
    body: 'Once the home is matched, this takes you to its details.',
  },
  {
    id: 'details-size', screen: 'new-report-details', targets: ['.nr-size', '.nr-sec'],
    title: 'Check the size first',
    body: 'Every comp is compared against these details, and the size matters most. Fix anything the listing got wrong.',
  },
  {
    id: 'details-next', screen: 'new-report-details', targets: ['.nr-foot .btn.primary'],
    title: 'Then add your comps',
    body: 'Floor, outdoor space, views and condition help too, but they can wait.',
  },
  {
    id: 'comps-paste', screen: 'new-report-comps', targets: ['.paste-bar', '.add-bar'],
    title: 'Bring in your comps',
    body: 'Drop the StreetEasy export or its PDF anywhere on this window, paste listing links here, or Type one in.',
  },
  {
    id: 'comps-next', screen: 'new-report-comps', targets: ['.nr-foot .btn.primary'],
    title: 'On to Sort',
    body: 'A comp read from a link asks you to confirm it. When they’re in, go to Sort.',
  },
  {
    id: 'sort-row', screen: 'sort', targets: ['.so-row-wrap.incomplete .so-row', '.so-row'],
    title: 'Open a comp',
    body: 'Click a row to open the comp and compare it to the home. The yellow edge marks a comp that still needs its tier, tags or note.',
  },
  {
    id: 'sort-review', screen: 'sort', targets: ['.sh-head .sh-review'],
    title: 'Or go one at a time',
    body: 'Review comps takes you through every comp: its tier (1st sets the range, 2nd is a check), its tags and your note.',
  },
  {
    id: 'sort-next', screen: 'sort', targets: ['.sh-head .sh-cta .sh-cta-quiet', '.sh-head .sh-cta .btn.primary:not(.sh-review):not(.sh-sample-sort)'],
    title: 'Findings opens when they’re done',
    body: 'Every comp needs a tier and tags first. The range stays hidden while you sort, so it can’t steer you.',
  },
  {
    id: 'gate-range', screen: 'gate', targets: ['.gt-range'],
    title: 'Your number first',
    body: 'Before you see the range, write down what you think the home is worth: your low and your high.',
  },
  {
    id: 'gate-lock', screen: 'gate', targets: ['.gt-card button[type="submit"]'],
    title: 'Then lock it in',
    body: 'Say why in a line or two, and lock it in. The gap between your number and the range is how you learn.',
  },
  {
    id: 'findings-range', screen: 'findings', targets: ['.fi-top'],
    title: 'What your comps say',
    body: 'The range your first-tier comps give, with your number against it. Change a tier and it moves.',
  },
  {
    id: 'findings-send', screen: 'findings', targets: ['.sh-head .sh-cta .btn.primary'],
    title: 'When it reads right, Send',
    body: 'The client’s budget or target shows here for context only. It never changes the numbers.',
  },
  {
    id: 'send-client', screen: 'send', targets: ['.cw-modal textarea', '.cw-modal'],
    title: 'Write it for the client',
    body: 'Your lines first: the headline and a few sentences. Then a short paragraph per comp. Hubert can draft from your notes.',
  },
  {
    id: 'send-step', screen: 'send', targets: ['.se2-step'],
    title: 'One button to send it',
    body: 'Read the email, then Copy & open in Gmail and send it from there. Back here, mark it as sent.',
  },
  {
    id: 'done', screen: 'done', targets: ['.se-next', '.se-done-block', '.se-done'],
    title: 'That’s the whole flow',
    body: 'Tick these off as you go: Hubert reminds you to follow up. Every step is in the Guide in the top bar.',
    last: true,
  },
];

/** The tips for a screen, in order. */
export function tipsFor(screen: string | null): TourTip[] {
  return screen ? TIPS.filter((t) => t.screen === screen) : [];
}

/**
 * The tip to show: the first on this screen the agent hasn't been through whose target is on the page.
 * `present` says whether a tip's target can be found (the DOM, in the app; a stub, in tests).
 */
export function nextTip(screen: string | null, done: readonly string[], present: (t: TourTip) => boolean): TourTip | null {
  return tipsFor(screen).find((t) => !done.includes(t.id) && present(t)) ?? null;
}

// ─── Kept per browser ──────────────────────────────────────────────────────

const KEY = 'cr.tour';
const EVENT = 'cr:tour';

export interface TourState {
  on: boolean;
  done: string[];
}

export function readTour(): TourState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<TourState> | null;
    return { on: v?.on === true, done: Array.isArray(v?.done) ? v.done.filter((x): x is string => typeof x === 'string') : [] };
  } catch {
    return { on: false, done: [] };
  }
}

function writeTour(s: TourState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: it lasts until the page reloads */
  }
  dispatchEvent(new CustomEvent<TourState>(EVENT, { detail: s }));
}

/** Starts the tour from the beginning. */
export function startTour(): void {
  writeTour({ on: true, done: [] });
}

export function endTour(): void {
  writeTour({ ...readTour(), on: false });
}

/** Marks a tip as seen; the last tip ends the tour. */
export function tipDone(tip: TourTip): void {
  const s = readTour();
  writeTour({ on: tip.last ? false : s.on, done: s.done.includes(tip.id) ? s.done : [...s.done, tip.id] });
}

/** Calls back whenever the tour changes, in this tab or another. */
export function onTour(cb: (s: TourState) => void): () => void {
  const local = (e: Event) => cb((e as CustomEvent<TourState>).detail);
  const other = (e: StorageEvent) => {
    if (e.key === KEY) cb(readTour());
  };
  addEventListener(EVENT, local);
  addEventListener('storage', other);
  return () => {
    removeEventListener(EVENT, local);
    removeEventListener('storage', other);
  };
}
