// "About this step": what each step is for, which design section it implements,
// what's real and what's stubbed, and the pending decisions that shape it
// (Dispatch 07). Open the first time a step is seen, collapsible after.
import { useEffect, useState, type ReactNode } from 'react';

export type StepId = 'sort' | 'reveal' | 'work' | 'send';

/** The workspace's steps. The home and adding comps are the new-comp modal now (Dispatch 09). */
export const STEPS: { id: StepId; n: number; title: string; short: string }[] = [
  { id: 'sort', n: 1, title: 'Sort the comps', short: 'Sort' },
  { id: 'reveal', n: 2, title: 'The call, then the reveal', short: 'Call & reveal' },
  { id: 'work', n: 3, title: 'Work it through', short: 'Work it through' },
  { id: 'send', n: 4, title: 'Send it', short: 'Send' },
];

interface Note {
  forWhat: ReactNode;
  implements: string;
  real: ReactNode[];
  stubbed: ReactNode[];
  decisions: ReactNode[];
}

const NOTES: Record<StepId, Note> = {
  sort: {
    forWhat: 'The first pass: each comp primary, secondary or excluded, with a reason. Open the listing, and mark the comp reviewed. Add comps from the bar at the top: StreetEasy links, the export, or typed in.',
    implements: '§3 step 3, §4.6 (judgment is structural), §6.3 (the anchor), §12 (reason history)',
    real: [
      'Reasons are append-only: every tier change records a new one, and the latest is the current reason.',
      'An unsorted comp counts toward nothing. The tool never sorts a comp for you.',
      'The anchor is the single most comparable sold comp, and must be primary.',
      'The range stays hidden in this step, so sorting can’t chase the number.',
      'A comp read from its StreetEasy page counts in neither result until you confirm it.',
    ],
    stubbed: [
      'Jev’s tier suggestions (§7) wait on D-12.',
      'The rows as 02-screens.md draws them (one notes field, the checks as flags) come with phase 2.',
      'Undo, redo and versions come with CR-3.',
    ],
    decisions: [<>D-1: the order. The range stays hidden until your call (recommendation C).</>],
  },
  reveal: {
    forWhat: 'Your own low–high view first, then both results side by side. The comparison between the two is the teaching moment.',
    implements: '§3.1 (why the call comes first), §6.3–§6.5 (indicators, two results, the range), §8.4',
    real: [
      'Both results come from the engine, with the bridge (every factor is “considered — value not yet determined”: all house-method values are null until Noble sets them), evidence by status, sale-to-last-ask, carry and the gaps.',
      'Your call is shown against each range.',
      'From the reveal on, the numbers move live as tiers and facts change.',
    ],
    stubbed: [
      'Choosing the lead indicator, a recency window, narrowing the range, what-ifs and versions come with CR-3.',
    ],
    decisions: [
      <>D-1: the order is still being decided. Recommendation C is used here: the call before the reveal, skippable.</>,
      <>D-18: the order adjustments apply in. Until it’s decided, every percentage is of the comp’s own price.</>,
    ],
  },
  work: {
    forWhat: 'Talk it through with the assistant. It’s reachable from every step, from the Assistant button; phase 2 makes it a drawer only.',
    implements: '§8 (the assistant), §8.3 rule 6 (the server owns the transcript)',
    real: [
      'CR-1’s turn endpoint: one streamed Opus 5.5 call per request, the transcript stored.',
      'A read-only tool, get_numbers, gives it the current engine output: tiers, evidence, gaps and, after the reveal, both results. Your call and your target are never in it.',
    ],
    stubbed: [
      'The full tool set (tiering, capture, what-ifs, Path to target) and turns in a background function come with CR-4.',
    ],
    decisions: [],
  },
  send: {
    forWhat: 'The client email, the checks before it goes out, and the client report.',
    implements: '§3 steps 5–6, §9 (QA), §10 (outputs)',
    real: [
      'The appraisal-word check: “appraisal” and “appraised value” are the one hard block in client copy (§9.3).',
      'The draft uses only engine figures, and discloses the estimates when it uses “with estimates”.',
    ],
    stubbed: [
      'The writer (CR-5): the email is a fixed template, a placeholder.',
      'Numeric grounding, range language and the fair-housing screen (CR-5).',
      'The client report and its PDF (CR-6): Kimani designs the template.',
      'Pinning the numbers as a version when you draft (CR-3).',
    ],
    decisions: [
      <>D-2: compliance as the only hard block.</>,
      <>D-3: how estimates are worded for clients.</>,
      <>D-13: the disclaimer. The one here is a placeholder.</>,
    ],
  },
};

const seenKey = (step: StepId) => `cr-about-seen:${step}`;

function seen(step: StepId): boolean {
  try {
    return localStorage.getItem(seenKey(step)) === '1';
  } catch {
    return false;
  }
}

/** Rendered with key={step}: each step's note decides once, on arrival, whether it's the first visit. */
export function About({ step }: { step: StepId }) {
  const [open, setOpen] = useState(() => !seen(step));
  useEffect(() => {
    try {
      localStorage.setItem(seenKey(step), '1');
    } catch {
      /* private mode: it just opens every time */
    }
  }, [step]);
  const note = NOTES[step];
  return (
    <details className="about" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>About this step</summary>
      <p>{note.forWhat}</p>
      <p className="muted small">Implements design {note.implements}.</p>
      <div className="about-cols">
        <div>
          <span className="about-label">Real</span>
          <ul>{note.real.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
        <div>
          <span className="about-label">Stubbed</span>
          <ul>{note.stubbed.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
        {note.decisions.length > 0 && (
          <div>
            <span className="about-label">Pending decisions</span>
            <ul>{note.decisions.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        )}
      </div>
    </details>
  );
}
