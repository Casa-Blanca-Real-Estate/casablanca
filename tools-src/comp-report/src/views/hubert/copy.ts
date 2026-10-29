// What Hubert says before anyone asks (the prototype's renderVals, "buyer ?"):
// the greeting and intro on Sort, a line per screen elsewhere, and two preset
// questions per screen and side. The prototype's names (17L, 5 Franklin, 200
// Chambers) become the report's own. Where the prototype's words promise what
// Hubert can't do in this version (redraft the email, compare against the
// agent's number, which he never sees), they're swapped for the nearest thing
// he can do, so a chip never leads to "I can't".
import type { WorkspaceComp } from '../../../workspace/engine-input.ts';
import { compStatus } from '../workspace/comps.tsx';
import type { ScreenId } from '../workspace/screens.ts';
import { shortName } from '../sort/rows.ts';

// Kimani's notebook (2026-10-27): the greeting says what Hubert is for, not where his name comes from.
export const GREETING = 'Hi, I’m Hubert! I’m here to help you build this comp report.';

export function intro(side: 'buyer' | 'seller'): string {
  return side === 'buyer'
    ? 'The tiers, notes and tags are yours to fill in. Ask me anything about these listings, and I’ll point out sales you haven’t added yet. For a buyer I’ll also flag days on market and price cuts, since that’s where the leverage is. I run my own numbers after you’ve given yours at the gate.'
    : 'The tiers, notes and tags are yours to fill in. Ask me anything about these listings, and I’ll point out sales you haven’t added yet. I run my own numbers after you’ve given yours at the gate.';
}

/** Said once, on Sort: where "sales you haven't added yet" come from in this version. */
export const SUGGESTIONS_LATER = 'For now, the sales I can point to are ones from your export that you took out. Suggestions from market data come in a later version.';

export type Chip = { label: string; kind: 'ask' } | { label: string; kind: 'reopen' };

const ask = (label: string): Chip => ({ label, kind: 'ask' });

// Beside the New report window (Kimani, 2026-10-29): a rough start for the design pass. He answers
// questions here; filling a detail on dictation comes with set_home_fact.
export const NEW_REPORT_HINT = 'I’m here while you set up the report. Ask me what a field means or what makes a good comp. Typing the details is yours for now.';
export const NEW_REPORT_CHIPS: Chip[] = [ask('What makes a good comp?'), ask('Where do I find the StreetEasy export?')];

export interface Said {
  /** A line above the conversation, on every screen but Sort. */
  hint: string;
  chips: Chip[];
}

/**
 * Sort's two questions name the report's own comps: one of the sales that
 * isn't the anchor ("Does 5 Franklin have a doorman?") and the anchor, else
 * the first 1st-tier comp ("200 Chambers").
 */
function sortChips(side: 'buyer' | 'seller', comps: WorkspaceComp[], home: string): Chip[] {
  if (side === 'buyer') return [ask(`How long has ${home} been listed?`), ask('Any price cuts on the active comps?')];
  const sortable = comps.filter((c) => c.judgment && !c.unsortable);
  if (!sortable.length) return [ask('What makes a good comp?'), ask('How many comps should I add?')];
  const closest = sortable.find((c) => c.judgment?.anchor)
    ?? sortable.find((c) => c.judgment?.tier === 'primary')
    ?? sortable[0]!;
  const other = sortable.find((c) => c !== closest && compStatus(c) === 'sold') ?? sortable.find((c) => c !== closest);
  return [
    ...(other ? [ask(`Does ${shortName(other.record)} have a doorman?`)] : [ask('What makes a good comp?')]),
    // The prototype's "Find more sales like 200 Chambers": Hubert can't search the market yet.
    ask(`Which comps are most like ${shortName(closest.record)}?`),
  ];
}

export function said(screen: ScreenId, side: 'buyer' | 'seller', comps: WorkspaceComp[], home: string, sent: boolean): Said {
  const buyer = side === 'buyer';
  switch (screen) {
    case 'sort':
      return { hint: '', chips: sortChips(side, comps, home) };
    case 'gate':
      return { hint: 'Hubert can’t help with your number. That one is yours.', chips: [ask('What makes a good range?'), ask('Which comps did I tier 1st?')] };
    case 'findings':
      // Hubert never sees the agent's number (or the target), so he can't say where the two differ.
      return {
        hint: 'Hubert never sees your number or your target.',
        chips: buyer ? [ask('Where should an offer open?'), ask('What gives us leverage?')] : [ask('What sets the low end?'), ask('Why is the range this wide?')],
      };
    case 'send':
      // Hubert reads the email and changes its words when the agent asks: never its styling, never on his own.
      return {
        hint: 'Hubert reads the email and changes its words when you ask, never its styling. Tell him what you want it to say.',
        chips: [ask('How do my lines read?'), buyer ? ask('How should I explain the range?') : ask('Which comp should the email lead with?')],
      };
    case 'done':
      // Reopen is the same as Done's own: it clears the sent mark and goes back to Send.
      return sent
        ? { hint: 'The report is marked as sent.', chips: [ask('Summarize for my notes'), { label: 'Reopen to edit', kind: 'reopen' }] }
        : { hint: 'The report isn’t marked as sent yet.', chips: [ask('Summarize for my notes'), { label: 'Back to Send', kind: 'reopen' }] };
  }
}
