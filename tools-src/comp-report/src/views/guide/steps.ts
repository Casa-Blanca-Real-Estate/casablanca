// The guide's steps (Kimani, 2026-11-10): the flow of a comp report in plain words, for a new agent's first
// look and for Noble's training over Zoom or Meet. It names what to do on each screen, not every detail:
// Noble runs the in-depth training. Written here, never generated. A rough version for Kimani to design
// over in Claude Design; the words in Hubert's step guides (views/hubert/guides.ts) say the same things.
import type { LoggedScreen } from '../workspace/screens.ts';

export interface GuideStep {
  /** The guide's own number, 1 to STEPS.length: what Noble says out loud ("we're on step 4"). */
  n: number;
  /** Where it is in the tool, as the tool labels it ("New report · 1 of 3", "Progress row · 1 Sort"). */
  where: string;
  title: string;
  /** What the agent does here, in a sentence or two. */
  todo: string;
  /** Up to three short points: what's on the screen, or what to keep in mind. */
  points: string[];
  /** The glossary words this step uses, by term, for a "Words on this step" line. */
  words: string[];
  /** The screens this step covers (activity.ts names them): presenter mode's step badge follows them. */
  screens: LoggedScreen[];
}

export const STEPS: GuideStep[] = [
  {
    n: 1,
    where: 'Reports',
    title: 'Start from your reports',
    todo: 'Every report you make is listed here. Pick one up where you left off, or start a new one with + New comp.',
    points: [
      'A new report starts with the home you’re pricing: its StreetEasy link or its address.',
      'Sample reports are for practice. Nothing in them is for clients.',
      'Hubert, the assistant, can start one for you: paste a link in Start with Hubert. Inside a report he’s the lavender button in the top bar.',
    ],
    words: ['Comp report', 'Hubert', 'Sample report'],
    screens: ['reports'],
  },
  {
    n: 2,
    where: 'New report · 1 of 3',
    title: 'The home',
    todo: 'Paste the home’s StreetEasy link, or type its address. Say whether you’re working for the buyer or the seller, and add the client’s name.',
    points: [
      'The link fills in most of the details for you.',
      'A client’s budget or target can go in now or later. It never changes the numbers.',
    ],
    words: ['The home', 'Buyer side', 'Seller side', 'Target'],
    screens: ['new-report'],
  },
  {
    n: 3,
    where: 'New report · 2 of 3',
    title: 'Check the details',
    todo: 'Look over what the listing gave: fix anything wrong and add what’s missing. The size matters most.',
    points: [
      'Every comp is compared against these details, so they’re worth a minute.',
      'Floor, outdoor space, views and condition all help tell the comps apart.',
    ],
    words: ['Square feet', 'Condo', 'Co-op'],
    screens: ['new-report-details'],
  },
  {
    n: 4,
    where: 'New report · 3 of 3',
    title: 'Add your comps',
    todo: 'Bring in the sales you found on StreetEasy: drop the export or its PDF, paste listing links, or type a sale in.',
    points: [
      'Recent sales close to the home, and like it, are best.',
      'A comp read from a link asks you to confirm it before it counts.',
    ],
    words: ['Comp', 'StreetEasy export', 'Sold', 'In contract', 'Active'],
    screens: ['new-report-comps'],
  },
  {
    n: 5,
    where: 'Progress row · 1 Sort',
    title: 'Sort the comps',
    todo: 'Open each comp, compare it to the home, and give it a tier. Then say why, with tags and a short note.',
    points: [
      '1st tier comps are the closest matches: only they set the range. 2nd tier is a check. Excluded stays out.',
      'Star the one comp closest to the home.',
      'The range stays hidden while you sort, so your choices aren’t steered by it.',
    ],
    words: ['Tier', 'Tags', 'Note', 'Anchor (the star)'],
    screens: ['sort'],
  },
  {
    n: 6,
    where: 'Progress row · 2 Findings',
    title: 'Give your number',
    todo: 'Before you see the range, write down what you think the home is worth. It’s your own read, and Hubert can’t help with it.',
    points: [
      'Next you’ll see your number against what the comps say. That gap is how you learn.',
    ],
    words: ['Your number', 'The reveal'],
    screens: ['gate'],
  },
  {
    n: 7,
    where: 'Progress row · 2 Findings',
    title: 'Read the findings',
    todo: 'See the range your comps give, and check which comps set its low and high end.',
    points: [
      'Two results show side by side: on the facts, and with your estimates.',
      'Change a tier or a fact and the range moves with it.',
      'The client’s budget or target shows here for context, never in the math.',
    ],
    words: ['Range', 'On the facts', 'With estimates', 'Price per square foot', 'Sale-to-ask'],
    screens: ['findings'],
  },
  {
    n: 8,
    where: 'Progress row · 3 Send',
    title: 'Send it to the client',
    todo: 'Write your lines, check the email, then copy it into Gmail and send it from there.',
    points: [
      'The Designed email is the report: photos, the range and a box for each comp.',
      'Hubert can draft or tidy your words. You choose what goes out.',
      'Back in the tool, mark it as sent. You can reopen a report to edit it.',
    ],
    words: ['Designed email', 'Mark as sent'],
    screens: ['send', 'done'],
  },
];

/** The step a screen belongs to, or null (the Access panel, say). */
export function stepForScreen(screen: string): GuideStep | null {
  return STEPS.find((s) => (s.screens as string[]).includes(screen)) ?? null;
}
