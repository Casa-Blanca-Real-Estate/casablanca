// "About this screen": what each step is for, which part of the design it implements, what's real and
// what's stubbed, and the decisions that shape it. Dev scaffolding (Dispatch 14): it shows only when an
// admin has switched dev tools on, and agents never see it. Open the first time a step is seen,
// collapsible after.
import { useEffect, useState, type ReactNode } from 'react';
import { useBuildNotes } from './buildNotes.tsx';

export type StepId = 'sort' | 'findings' | 'send';

/** The workspace's three steps (the progress row). The start is the new-comp modal; Hubert is a drawer on every screen. */
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
    forWhat: 'Deciding which comps count, and saying why: a tier (1st, 2nd or ✕), a note and at least one tag for every comp. The note is the reason.',
    implements: 'the handoff’s Sort screen (design-port README, 6) and Dispatch 14, item 6',
    real: [
      'Findings stays locked until every comp has a tier, a note and a tag. Comps still to confirm must be confirmed or removed; comps that can’t be sorted don’t count.',
      'One ★ anchor per report, on any status; starring another moves it.',
      'Notes, tags and features are saved with the comp, and the writer and QA read them where they read tiers.',
      'With no square footage, $/ft and Size are hidden here and on every other screen.',
    ],
    stubbed: [
      'Screenshots read into comps: the drop zone says to type them in for now.',
      'Photos: neutral blocks until there’s a photo source.',
      'Hubert’s real suggestions: he points back only to sales the agent took out of an imported export.',
    ],
    decisions: [<>D-1: your number before the range. The tier labels 1st / 2nd / ✕ hold until testing with Noble.</>],
  },
  findings: {
    forWhat: 'Your number first (the Gate), then what the comps say: the true estimate, the range on a fixed axis, how Hubert got there beside your reasoning, then the evidence.',
    implements: 'the handoff’s Gate and Findings screens (design-port README, 7–8) and Dispatch 14, items 8–9',
    real: [
      'A practice agent gives low, high and a why of 100+ characters and can’t skip; a graduated agent can skip. The server enforces it too. Admins can view the Gate as a new agent from the account menu.',
      'How Hubert got there is built from the engine’s 1st-tier comps, deterministically: names, prices, sizes, dates and the range, nothing the engine doesn’t know.',
      'The per-SF line, the Price table and the Per sq ft tile need a size; without one they’re hidden.',
      'Both results show side by side only when your estimates change the answer. “True estimate” is a Findings label only, never in the email.',
    ],
    stubbed: [
      'Path to target and narrowing the range come later.',
    ],
    decisions: [<>D-1: your number is the gate. D-4: the target is hidden from Hubert until the neutral result, and never in the email. D-11: the agent’s level decides whether the Gate can be skipped.</>],
  },
  send: {
    forWhat: 'The headline first, then the email built around it in Frankie’s order, with QA as numbered issues to fix.',
    implements: 'the handoff’s Send and Done screens (design-port README, 9–10) and Dispatch 14, items 10–11',
    real: [
      'The headline is required before the email can be copied (D-21).',
      'Designed renders the Full draft into the branded 600px email; Copy as HTML strips the annotations.',
      'Mark as sent stores a sent state, and Reopen undoes it. Done takes the outcomes typed in (D-19’s manual fallback).',
      'The appraisal-word check is the one hard block in client copy.',
    ],
    stubbed: [
      'Photos in the Designed email: neutral blocks until there’s a photo source.',
      'Outcomes filled from deal records: a follow-up.',
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

/** Rendered with key={step}: each step's note decides once, on arrival, whether it's the first visit. Dev tools: admins only. */
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
    <details className="sh-about" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>About this screen</summary>
      <p>{note.forWhat}</p>
      <p className="sh-about-impl">Implements {note.implements}.</p>
      <div className="sh-about-cols">
        <div>
          <span className="sh-about-label">Real</span>
          <ul>{note.real.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
        <div>
          <span className="sh-about-label">Stubbed</span>
          <ul>{note.stubbed.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
        {note.decisions.length > 0 && (
          <div>
            <span className="sh-about-label">Decisions</span>
            <ul>{note.decisions.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        )}
      </div>
    </details>
  );
}
