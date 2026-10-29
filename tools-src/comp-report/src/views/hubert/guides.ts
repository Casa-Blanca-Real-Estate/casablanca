// Hubert's step guides (Kimani, 2026-10-28): as the agent reaches each step of
// the report, a preset note from Hubert joins his chat and starts a new section
// of it, so the conversation reads in the order the work happened. Written
// here, never generated: no model call, no cost. The first time the agent
// reaches each step is kept in the report's state (`stepsAt`), and the chat
// places each guide at that time among the messages.
//
// A rough look for now; the design pass decides how the sections should read.
import type { GuideStep } from '../../../workspace/state.ts';

export interface Guide {
  step: GuideStep;
  title: string;
  text: string;
}

const GUIDES: Record<GuideStep, (side: 'buyer' | 'seller') => Omit<Guide, 'step'>> = {
  home: () => ({
    title: 'New report · The home',
    text: 'Start with the home: paste its StreetEasy link, or type the address. If the client has a budget or a target, add it here. It shows on Findings for context and never goes into the numbers.',
  }),
  details: () => ({
    title: 'New report · The details',
    text: 'Check the home’s details. What the listing gave is filled in: fix what’s wrong and add what’s missing, like the size, the floor and outdoor space. Every comp is compared against these.',
  }),
  comps: () => ({
    title: 'New report · The comps',
    text: 'Add the comps: drop your StreetEasy export or its PDF, paste listing links, or type a sale in. Recent sales close to the home are best. You sort them next.',
  }),
  sort: () => ({
    title: 'Sort',
    text: 'Go through each comp: open it, tier it (1st is closest, 2nd is a check, Excluded stays out of the numbers), and say why in a note and tags. Star the closest one. Tell me what to change and I’ll do it: every change I make shows here, with a link to it.',
  }),
  review: () => ({
    title: 'Sort · One comp at a time',
    text: 'Look at the listing, decide how it compares to the home, then tier it. If you’re practising, write your reasoning first and I’ll give you feedback before you see my take.',
  }),
  gate: () => ({
    title: 'Your number',
    text: 'Before you see the range, give your own read of the value. That one is yours: I can’t help with it.',
  }),
  findings: (side) => ({
    title: 'Findings',
    text: side === 'buyer'
      ? 'The range from your comps, on the facts and with your estimates. Check what sets the low and the high end, and where the client’s budget sits against them. Ask me what any figure means.'
      : 'The range from your comps, on the facts and with your estimates. Check what sets the low and the high end, and where the client’s target sits against them. Ask me what any figure means.',
  }),
  send: () => ({
    title: 'Send',
    text: 'The client email. Write your lines (how you chose the comps, what to consider, the next step), check the Designed email, then copy it into Gmail. Tell me what you want it to say and I’ll change the words.',
  }),
  done: () => ({
    title: 'Done',
    text: 'Mark the report as sent once it’s gone. You can reopen it to edit.',
  }),
};

/** The guides the agent has reached, oldest first, each with when. */
export function reachedGuides(stepsAt: Partial<Record<GuideStep, string>> | undefined, side: 'buyer' | 'seller'): (Guide & { at: string })[] {
  return Object.entries(stepsAt ?? {})
    .filter((e): e is [GuideStep, string] => e[0] in GUIDES && typeof e[1] === 'string')
    .map(([step, at]) => ({ step, at, ...GUIDES[step](side) }))
    .sort((a, b) => a.at.localeCompare(b.at));
}
