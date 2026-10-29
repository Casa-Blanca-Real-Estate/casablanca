// Your client (Kimani, 2026-10-29): the client's facts that change what a
// buyer can offer and how fast they need to move. Pre-approved, and for how
// much (NB-15: yes/no plus the amount), cash or a mortgage, the pace (as soon
// as possible, or can wait) and what's moving them. Each is optional; the
// agent fills what they know.
//
// The pre-approval stays on the deal terms (§6.7, NW-074 a), where Findings'
// Terms already asks it; the pace and the motivations are on the brief. None
// of it is an input to a number: the true estimate is the home's value, not
// the client's reach. Findings sets the pre-approval against the range and the
// ask, and the pace against how the comps sold, in words. How the pace should
// move the math is open (NB-29). Hubert gets these after the reveal, without
// the client's name (server/numbers.ts).
import type { Audience, Brief, ClientFacts, ClientPace, DealTermsState } from './state.ts';
import { clientPrice, usd } from './format.ts';

export const PACE_LABEL: Record<ClientPace, string> = { asap: 'As soon as possible', can_wait: 'Can wait for the right one' };

export interface ClientRow {
  k: string;
  v: string;
}

interface Stat {
  n: number;
  median: { value: number };
}

/** Pre-approval and financing, as a phrase: null when the agent hasn't said. */
export function preApprovalWords(terms: DealTermsState | null | undefined): string | null {
  if (!terms || terms.template !== 'buyer_traditional') return null;
  if (terms.financing?.value === 'cash') return 'Cash';
  if (!terms.preApproved) return null;
  if (!terms.preApproved.value) return 'Not pre-approved yet';
  return terms.preApprovalAmount ? `Pre-approved for ${clientPrice(terms.preApprovalAmount.value)}` : 'Pre-approved';
}

/**
 * The deal terms with a buyer's financing or pre-approval changed. With no
 * terms yet, the buyer's template starts with just this; cash drops the
 * pre-approval, and "not yet" drops the amount.
 */
export function withBuyerFinance(
  terms: DealTermsState | null | undefined,
  change: Pick<DealTermsState, 'financing' | 'preApproved' | 'preApprovalAmount'>,
): DealTermsState {
  const next: DealTermsState = terms?.template === 'buyer_traditional' ? { ...terms } : { template: 'buyer_traditional' };
  for (const key of ['financing', 'preApproved', 'preApprovalAmount'] as const) {
    if (!(key in change)) continue;
    const v = change[key];
    if (v === undefined) delete next[key];
    else (next as unknown as Record<string, unknown>)[key] = v;
  }
  if (next.financing?.value === 'cash') {
    delete next.preApproved;
    delete next.preApprovalAmount;
  }
  if (next.preApproved && !next.preApproved.value) delete next.preApprovalAmount;
  return next;
}

/** Where the pre-approval reaches against the range: the whole of it, part of it, or short of it. */
export function againstRange(amount: number, range: { low: number; high: number }): string {
  const span = `${clientPrice(range.low)} – ${clientPrice(range.high)}`;
  if (amount >= range.high) return `Covers the whole true estimate (${span}).`;
  if (amount < range.low) return `${clientPrice(range.low - amount)} short of the true estimate’s low (${span}).`;
  return `Reaches into the true estimate: up to ${clientPrice(amount)} of ${span}.`;
}

/** Where the pre-approval sits against the asking price. */
export function againstAskingPrice(amount: number, ask: number): string {
  if (amount >= ask) return `Covers the ${clientPrice(ask)} ask.`;
  return `${clientPrice(ask - amount)} short of the ${clientPrice(ask)} ask.`;
}

/** The pace set against how the comps sold: a fact from the comps, then what it means at this pace. Null without the figures. */
export function paceLine(side: Audience, pace: ClientPace, sold: { saleToAsk: Stat | null; daysOnMarket: Stat | null }): string | null {
  if (side === 'seller') {
    const dom = sold.daysOnMarket;
    if (!dom) return null;
    const days = Math.round(dom.median.value);
    const fact = dom.n === 1 ? `Your one sale took ${days} days to go into contract` : `Your sales took a median of ${days} days to go into contract`;
    return pace === 'asap' ? `${fact}: the pace to beat.` : `${fact}: the pace to plan around.`;
  }
  const sta = sold.saleToAsk;
  if (!sta) return null;
  const r = Math.round(sta.median.value * 10) / 10;
  const their = sta.n === 1 ? 'Your one sale closed' : 'Your sales closed a median';
  if (r < 0) {
    const fact = `${their} ${Math.abs(r).toFixed(1)}% below ${sta.n === 1 ? 'its' : 'their'} last ask`;
    return pace === 'asap'
      ? `${fact}; a buyer who needs to move fast usually has less of that room.`
      : `${fact}: room a buyer who can wait can test.`;
  }
  const fact = r === 0 ? `${their} at ${sta.n === 1 ? 'its' : 'their'} last ask` : `${their} ${r.toFixed(1)}% above ${sta.n === 1 ? 'its' : 'their'} last ask`;
  return pace === 'asap' ? `${fact}: moving fast here can mean meeting the ask.` : `${fact}, so waiting may not buy room on price.`;
}

/**
 * Findings' Your client: only the rows with data, in plain sentences. The
 * range and the comps' figures are the ones Findings leads with.
 */
export function clientRows(args: {
  side: Audience;
  client: ClientFacts | undefined;
  terms: DealTermsState | null | undefined;
  range: { low: number; high: number } | null;
  ask: number | null;
  sold: { saleToAsk: Stat | null; daysOnMarket: Stat | null };
}): ClientRow[] {
  const { side, client, terms, range, ask } = args;
  const rows: ClientRow[] = [];
  if (side === 'buyer') {
    const words = preApprovalWords(terms);
    if (words === 'Cash') rows.push({ k: 'Financing', v: 'All cash' });
    else if (words) rows.push({ k: 'Pre-approved', v: words.replace(/^Pre-approved for /, 'Yes, for ').replace(/^Pre-approved$/, 'Yes').replace(/^Not pre-approved yet$/, 'Not yet') });
    const amount = terms?.template === 'buyer_traditional' && terms.financing?.value !== 'cash' && terms.preApproved?.value ? terms.preApprovalAmount?.value ?? null : null;
    if (amount !== null) {
      if (range) rows.push({ k: 'Against the range', v: againstRange(amount, range) });
      if (ask) rows.push({ k: 'Against the ask', v: againstAskingPrice(amount, ask) });
    }
  }
  const pace = client?.urgency?.pace?.value;
  if (pace) {
    const text = client?.urgency?.text?.value?.trim();
    rows.push({ k: 'How soon', v: `${PACE_LABEL[pace]}${text ? `. ${text}` : ''}` });
    const line = paceLine(side, pace, args.sold);
    if (line) rows.push({ k: 'At that pace', v: line });
  }
  const moving = client?.motivations?.value?.trim();
  if (moving) rows.push({ k: 'What’s moving them', v: moving });
  return rows;
}

/** The accordion's sub-label: the client's facts, short. */
export function clientSub(side: Audience, client: ClientFacts | undefined, terms: DealTermsState | null | undefined): string {
  const parts: string[] = [];
  const words = side === 'buyer' ? preApprovalWords(terms) : null;
  if (words) parts.push(words.replace('Pre-approved for', 'Pre-approved').replace('Not pre-approved yet', 'Not pre-approved'));
  const pace = client?.urgency?.pace?.value;
  if (pace) parts.push(pace === 'asap' ? 'ASAP' : 'Can wait');
  return parts.join(' · ');
}

/**
 * The client as Hubert gets them, after the reveal (server/numbers.ts): the
 * facts the agent gave, never the client's name, and nothing when there are none.
 */
export function clientForHubert(brief: Brief, terms: DealTermsState | null | undefined): Record<string, unknown> | null {
  const side = brief.audience?.value ?? null;
  const c = brief.client ?? {};
  const facts: Record<string, unknown> = {};
  const buyerTerms = side !== 'seller' && terms?.template === 'buyer_traditional' ? terms : null;
  if (buyerTerms?.financing) facts.financing = buyerTerms.financing.value;
  if (buyerTerms?.preApproved && buyerTerms.financing?.value !== 'cash') {
    facts.pre_approved = buyerTerms.preApproved.value;
    if (buyerTerms.preApproved.value && buyerTerms.preApprovalAmount) facts.pre_approved_for = usd(buyerTerms.preApprovalAmount.value);
  }
  if (c.urgency?.pace) facts.how_soon = PACE_LABEL[c.urgency.pace.value].toLowerCase();
  if (c.urgency?.text?.value.trim()) facts.how_soon_in_their_words = c.urgency.text.value.trim();
  if (c.urgency?.by) facts.close_by = c.urgency.by.value;
  if (c.motivations?.value.trim()) facts.what_is_moving_them = c.motivations.value.trim();
  if (c.paysMoreFor?.value.trim()) facts.would_pay_more_for = c.paysMoreFor.value.trim();
  if (c.nonNegotiables?.value.trim()) facts.non_negotiables = c.nonNegotiables.value.trim();
  if (c.priorities?.length) facts.priorities = c.priorities;
  if (!Object.keys(facts).length) return null;
  return {
    about:
      `What the agent told you about their ${side ?? 'client'}, in their words: context for your answers, never an input to a figure. ` +
      "A pre-approval is what the client can pay, not what the home is worth. Don't put any of it in the email unless the agent asks, " +
      "and don't ask about the client's finances or life beyond it.",
    ...(side ? { side } : {}),
    ...facts,
  };
}
