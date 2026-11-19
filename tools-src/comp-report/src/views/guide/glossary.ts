// The glossary (Kimani, 2026-11-10): the words an agent meets doing a comp report, in plain language, kept as
// a reference. Short on purpose: the full research draft, with sources and the open questions for Noble, is
// docs/comp-report/research/glossary-draft.md. Where the two differ, Noble's answer wins and both change.

export type GlossaryGroup = 'Comps and pricing' | 'NYC homes' | 'In the tool';

export interface Term {
  term: string;
  group: GlossaryGroup;
  /** One or two plain sentences. */
  means: string;
  /** Other words people use for it. */
  aka?: string[];
  /** A word it's often mixed up with, and the difference. */
  notSame?: string;
}

export const GROUPS: GlossaryGroup[] = ['Comps and pricing', 'NYC homes', 'In the tool'];

export const GLOSSARY: Term[] = [
  // ── Comps and pricing ──
  { term: 'Comp', group: 'Comps and pricing', aka: ['comparable'], means: 'A home like the one you’re pricing that sold, went into contract or is for sale nearby. Comps are the evidence for a price.' },
  { term: 'Comp report', group: 'Comps and pricing', aka: ['CMA', 'comparative market analysis'], means: 'An agent’s estimate of what a home is worth, built from comps. It is not an appraisal.', notSame: 'Appraisal: a licensed appraiser’s formal valuation, usually ordered by the lender.' },
  { term: 'The home', group: 'Comps and pricing', aka: ['the subject', 'subject property'], means: 'The home you’re pricing: your seller’s listing, or the one your buyer wants.' },
  { term: 'Sold', group: 'Comps and pricing', means: 'A sale that closed. The strongest evidence: a real price someone paid.' },
  { term: 'In contract', group: 'Comps and pricing', aka: ['pending'], means: 'A buyer and seller have signed, but it hasn’t closed. The final price isn’t public yet, so the asking price stands in.' },
  { term: 'Active', group: 'Comps and pricing', aka: ['on the market'], means: 'A home listed for sale now. Its asking price is what the seller hopes for, not what it’s worth.' },
  { term: 'Didn’t sell', group: 'Comps and pricing', aka: ['delisted', 'off market'], means: 'A listing that came off the market without selling. A hint that its price was too high.' },
  { term: 'Asking price', group: 'Comps and pricing', aka: ['list price', 'ask'], means: 'The price a home is listed at. The last ask is the price just before it went into contract.' },
  { term: 'Sale-to-ask', group: 'Comps and pricing', aka: ['sale-to-list'], means: 'How a sale price compares to the last asking price: 2% under ask, 1% over. It shows how much room to negotiate there was.' },
  { term: 'Days on market', group: 'Comps and pricing', aka: ['DOM'], means: 'How long a home was listed before it went into contract. Long stretches usually mean a high price.' },
  { term: 'Price per square foot', group: 'Comps and pricing', aka: ['$/SF', '$/sq ft', 'PPSF'], means: 'The price divided by the interior size. It lets you compare homes of different sizes. Co-ops are usually not priced this way.' },
  { term: 'Square feet', group: 'Comps and pricing', aka: ['SF', 'size'], means: 'The interior size. Listings often say “approx.” Outdoor space isn’t included.' },
  { term: 'Range', group: 'Comps and pricing', aka: ['true estimate'], means: 'The low and high value your 1st-tier sold comps point to for the home. The low end and the high end each come from a specific comp.' },
  { term: 'Adjustment', group: 'Comps and pricing', means: 'An amount added or taken off a comp’s price for a difference from the home, like a terrace or a lower floor. The tool only uses adjustments with a real basis.' },
  { term: 'Bracketing', group: 'Comps and pricing', means: 'Choosing comps that are a bit better and a bit worse than the home, so its value sits between them.' },
  { term: 'Concession', group: 'Comps and pricing', aka: ['seller credit'], means: 'Money the seller gives back at closing, like paying the transfer tax. It makes the real price lower than the headline one.' },
  { term: 'Arm’s length', group: 'Comps and pricing', means: 'A normal sale between strangers. A sale between family, or a forced sale, doesn’t show market value.' },

  // ── NYC homes ──
  { term: 'Condo', group: 'NYC homes', aka: ['condominium'], means: 'You own the apartment itself, as real property, plus a share of the building’s common areas. Buying is usually simpler than a co-op.' },
  { term: 'Co-op', group: 'NYC homes', aka: ['cooperative'], means: 'You own shares in a company that owns the building, and a lease on your apartment. The board approves every buyer.', notSame: 'Condo: you own the unit outright, with no board interview.' },
  { term: 'Condop', group: 'NYC homes', means: 'A building with both: usually condo commercial space and a residential co-op, often with condo-like rules for buyers.' },
  { term: 'Common charges', group: 'NYC homes', aka: ['CCs'], means: 'A condo’s monthly fee for running the building. Real estate taxes are billed on top.' },
  { term: 'Maintenance', group: 'NYC homes', means: 'A co-op’s monthly fee. It covers running the building and usually its taxes and underlying mortgage too.', notSame: 'Common charges: a condo’s fee, without the taxes.' },
  { term: 'Monthly carry', group: 'NYC homes', aka: ['carry'], means: 'What the home costs each month apart from the mortgage: common charges and taxes, or maintenance.', notSame: 'Mortgage payment: the loan, paid on top of the carry.' },
  { term: 'Flip tax', group: 'NYC homes', means: 'A fee some co-ops (and a few condos) charge when an apartment sells, usually paid by the seller.' },
  { term: 'Board package', group: 'NYC homes', means: 'The application a co-op buyer gives the board: finances, references, letters. Often weeks of work.' },
  { term: 'Sponsor unit', group: 'NYC homes', means: 'An apartment sold by the building’s developer. Buyers often skip the board approval.' },
  { term: 'Special assessment', group: 'NYC homes', means: 'A one-off charge to owners for a big building project, on top of the monthly fee.' },
  { term: 'Pre-approval', group: 'NYC homes', means: 'A lender’s written yes, for up to an amount, after checking the buyer’s finances. Stronger than a pre-qualification.' },

  // ── In the tool ──
  { term: 'Tier', group: 'In the tool', means: 'How much a comp counts. 1st tier: a close match, and only these set the range. 2nd tier: a check on it. Excluded: kept for the record, left out of the numbers.' },
  { term: 'Anchor (the star)', group: 'In the tool', aka: ['the star', 'anchor comp'], means: 'The one sold comp you think is closest to the home. You star it on Sort.' },
  { term: 'Tags', group: 'In the tool', means: 'Quick labels for how a comp differs from the home: bigger, higher floor, no outdoor space. Every comp needs at least one.' },
  { term: 'Note', group: 'In the tool', means: 'A line or two on why you tiered a comp the way you did. Required while you’re in practice.' },
  { term: 'Your number', group: 'In the tool', aka: ['your call'], means: 'Your own read of the value, given before the range is revealed. It never changes the math: it’s there so you can see how close your instinct was.' },
  { term: 'The reveal', group: 'In the tool', means: 'The moment after your number, when the tool shows the range your comps give.' },
  { term: 'On the facts', group: 'In the tool', means: 'The range from what’s known for sure: listing and sale data, and details you have a source for.' },
  { term: 'With estimates', group: 'In the tool', means: 'The same range with your educated guesses added, like a size you estimated. A wide gap between the two means the range rests on guesses.' },
  { term: 'Target', group: 'In the tool', aka: ['client’s budget', 'client’s target'], means: 'The price your client has in mind: a buyer’s budget or a seller’s goal. Shown on Findings for context, never in the math or the email.', notSame: 'Your number: your own read of the value.' },
  { term: 'Buyer side', group: 'In the tool', means: 'You’re working for the buyer. The report helps decide what to offer.' },
  { term: 'Seller side', group: 'In the tool', means: 'You’re working for the seller. The report helps set the asking price.' },
  { term: 'StreetEasy export', group: 'In the tool', means: 'The file StreetEasy’s comps tool gives you: a spreadsheet, or a PDF. Drop either in and the tool reads the listings from it.' },
  { term: 'Designed email', group: 'In the tool', means: 'The finished report for the client, laid out as an email with photos, the range and a box per comp. You copy it into Gmail to send.' },
  { term: 'Mark as sent', group: 'In the tool', means: 'Tells the tool the email went out. The report moves to Done; you can still reopen it.' },
  { term: 'Practice', group: 'In the tool', aka: ['practice agent'], means: 'A level for agents in training: you write a note on every comp and give your number before the reveal, and Hubert gives feedback. An admin sets it.' },
  { term: 'Full', group: 'In the tool', aka: ['full agent'], means: 'The usual level. Notes are optional, and Hubert drafts his take on each comp for you to approve or change.' },
  { term: 'Hubert', group: 'In the tool', means: 'The assistant. He explains figures, makes changes you ask for, and drafts words. He never picks the numbers: the comps do.' },
  { term: 'Sample report', group: 'In the tool', means: 'A report filled with made-up data for practice. Nothing in it is for clients.' },
];

/** Terms matching a search: the term, its other names, or its meaning. */
export function searchGlossary(q: string): Term[] {
  const s = q.trim().toLowerCase();
  if (!s) return GLOSSARY;
  return GLOSSARY.filter((t) => [t.term, ...(t.aka ?? []), t.means].some((x) => x.toLowerCase().includes(s)));
}

export function findTerm(name: string): Term | undefined {
  return GLOSSARY.find((t) => t.term === name);
}
