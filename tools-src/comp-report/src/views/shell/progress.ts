// The 3-step progress row (the handoff): Sort, Findings, Send, with the Gate counted as Findings and
// Done as Send. Where each step goes, which are locked, and what the CTA at the row's right does.
import { PROGRESS, progressStep, type ScreenId } from '../workspace/screens.ts';

export interface ProgressInput {
  screen: ScreenId;
  /** The call is given or skipped: the range may show. */
  revealed: boolean;
  /** Every comp has a tier, a note and a tag, and none waits for a confirm. */
  ready: boolean;
  /** Another agent's report, open to an admin: nothing to finish, so nothing is locked. */
  readOnly: boolean;
}

export interface StepView {
  id: 'sort' | 'findings' | 'send';
  n: number;
  label: string;
  /** Done shows a check; the current step its number, filled; the rest an outlined number. */
  state: 'done' | 'current' | 'todo';
  target: ScreenId;
  /** Why it can't be opened yet, or null. */
  locked: string | null;
}

export const LOCK_SORT = 'Finish sorting first: every comp needs a tier, a note and a tag.';
export const LOCK_CALL = 'Give your number first.';

export function progressSteps(i: ProgressInput): StepView[] {
  // On Done every step is behind you.
  const current = i.screen === 'done' ? PROGRESS.length : PROGRESS.findIndex((p) => p.id === progressStep(i.screen));
  const sortOk = i.ready || i.readOnly;
  return PROGRESS.map((p, index) => ({
    id: p.id,
    n: p.n,
    label: p.label,
    state: index < current ? 'done' : index === current ? 'current' : 'todo',
    target: p.id === 'findings' ? (i.revealed ? 'findings' : 'gate') : p.id,
    locked: p.id === 'sort' ? null : !sortOk ? LOCK_SORT : p.id === 'send' && !i.revealed && !i.readOnly ? LOCK_CALL : null,
  }));
}

/** The row's CTA: Findings → on Sort (locked until sorted), Send → on Findings, none elsewhere. */
export function rowCta(i: ProgressInput): { label: string; target: ScreenId; disabled: boolean } | null {
  if (i.screen === 'sort') return { label: 'Findings →', target: i.revealed ? 'findings' : 'gate', disabled: !(i.ready || i.readOnly) };
  if (i.screen === 'findings') return { label: 'Send →', target: 'send', disabled: !((i.revealed && i.ready) || i.readOnly) };
  return null;
}
