// "About this step": what each step is for, which design section it implements,
// what's real and what's stubbed, and the pending decisions that shape it
// (Dispatch 07). Open the first time a step is seen, collapsible after.
import { useEffect, useState, type ReactNode } from 'react';
import { useBuildNotes } from './buildNotes.tsx';

export type StepId = 'sort' | 'findings' | 'send';

/** The workspace's three screens (`02-screens.md`). The start is the new-comp modal; the assistant is a drawer on all three. */
export const STEPS: { id: StepId; n: number; title: string; short: string }[] = [
  { id: 'sort', n: 1, title: 'Sort', short: 'Sort' },
  { id: 'findings', n: 2, title: 'Findings', short: 'Findings' },
  { id: 'send', n: 3, title: 'Send', short: 'Send' },
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
    forWhat: 'Deciding which comps count, and noting in a line or three how each differs from the home. The note is the reason.',
    implements: '§3, §4.6 (judgment is structural), §6.3 (the anchor), §12 (reason history); 02-screens.md, Sort',
    real: [
      'Reasons are append-only: every tier or note change records a new one, and the latest is the current reason.',
      'An unsorted comp counts toward nothing. The tool never sorts a comp for you.',
      'Opening a row marks it reviewed. The anchor is the star in an opened sold row, and must be primary.',
      'The range stays hidden until your number, so sorting can’t chase it (D-1).',
      'Quick-pick notes come from what the engine compared: size, floor, outdoor space, the building.',
    ],
    stubbed: [
      'Kara’s checks as flags wait on CR-2.2 phase 2 (Abacus’s checks).',
      'Jev’s tier suggestions (§7) wait on CR-D.',
      'Undo, redo and versions come with CR-3.',
    ],
    decisions: [<>D-1: your number before the range. D-20: the tier labels stay Primary / Secondary / Excluded for now.</>],
  },
  findings: {
    forWhat: 'Your number first, then what the comps say: one sentence, the range, your number against it, the evidence by status, the comps that count. The target and offer details after.',
    implements: '§3.1, §6.3–§6.5, §8.4; 02-screens.md, Findings',
    real: [
      'The sentence and every figure come from the engine; nothing is written by a model.',
      'Both results show side by side only when your estimates change the answer.',
      'How this was worked out (the method, the bridge, the gaps, warnings, carry, the engine version) is folded.',
    ],
    stubbed: [
      'The price table, the pairs, and “didn’t sell” statistics wait on CR-2.2 phase 2.',
      'Path to target (§8.5), choosing the lead indicator, narrowing the range and versions come later.',
    ],
    decisions: [<>D-1: your number is the gate. D-4: the target shows only after the reveal. D-23: “didn’t sell” is a fourth group.</>],
  },
  send: {
    forWhat: 'The headline first, then the email built around it in Frankie’s order, and QA as one line.',
    implements: '§9 (QA), §10.2 (the email); 02-screens.md, Send',
    real: [
      'The headline is required before the email can be copied (D-21).',
      'Drafts of the headline are built from the engine’s figures only.',
      'The appraisal-word check is the one hard block in client copy (§9.3).',
    ],
    stubbed: [
      'The assistant’s headline drafts from headline_facts wait on CR-2.2 phase 2; numeric grounding and the fair-housing screen on CR-5.',
      'The client report and its PDF (CR-6).',
    ],
    decisions: [<>D-2: compliance as the only hard block. D-3: how estimates are worded. D-13: the disclaimer. D-21: the headline is required.</>],
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

/** Rendered with key={step}: each step's note decides once, on arrival, whether it's the first visit. A build note: admins only. */
export function About({ step }: { step: StepId }) {
  const notes = useBuildNotes();
  const [open, setOpen] = useState(() => !seen(step));
  useEffect(() => {
    try {
      localStorage.setItem(seenKey(step), '1');
    } catch {
      /* private mode: it just opens every time */
    }
  }, [step]);
  const note = NOTES[step];
  if (!notes) return null;
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
