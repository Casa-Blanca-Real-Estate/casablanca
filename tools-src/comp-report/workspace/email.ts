// Step 6 (stubbed): a placeholder client email from a fixed template, and the
// one QA check that's a regex today. The writer (CR-5) replaces the template;
// QA grows the numeric-grounding and fair-housing checks (§9).
//
// Every figure comes from the engine's output or from what the agent entered;
// nothing here computes a number (§4.1). A draft built from sample values says
// so at the top, so no sample value reaches a client unlabelled (Dispatch 07).
import type { EngineOutput, ResultKind } from '../engine/index.ts';
import type { WorkspaceComp } from './engine-input.ts';
import { clientPrice, estimateWords, isoDay, pct, psf, usd } from './format.ts';

export const SAMPLE_BANNER = '[SAMPLE DATA — this draft uses sample values. Not for clients.]';

/** Placeholder until Hannah approves the wording (D-13). It must never say "appraisal" (§9.3). */
export const PLACEHOLDER_DISCLAIMER =
  'This is a comparative market analysis prepared by a licensed real estate salesperson from recent market data. ' +
  'It is not a formal valuation of the property.';

export interface EmailInput {
  subjectLine: string;
  audience: 'buyer' | 'seller' | null;
  output: EngineOutput;
  result: ResultKind;
  comps: WorkspaceComp[];
  agentName: string;
  /** Who it's to. Left as a placeholder to fill in when not given. */
  clientName?: string | undefined;
  sample: boolean;
}

function addressOf(c: WorkspaceComp): string {
  const street = c.record.identity.address.street ?? 'Unknown address';
  const unit = c.record.identity.unit.raw;
  return unit ? `${street} ${unit}` : street;
}

export function placeholderEmail(input: EmailInput): { subject: string; body: string } {
  const r = input.output.results[input.result];
  const lines: string[] = [];
  if (input.sample) lines.push(SAMPLE_BANNER, '');
  lines.push(`Hi ${input.clientName?.trim() || '[client name]'},`, '');
  const where = input.subjectLine || 'the home';
  lines.push(input.audience === 'buyer'
    ? `Here is where recent sales put ${where}, to help us decide what to offer.`
    : `Here is where recent sales put ${where}.`);
  lines.push('');

  if (r.range) {
    lines.push(`The range the comparable sales support: ${clientPrice(r.range.low.value)} to ${clientPrice(r.range.high.value)}` +
      (r.base ? `, centered around ${clientPrice(r.base.value)}.` : '.'));
  } else {
    lines.push(`We don't have a range yet: ${r.range_unavailable_because ?? 'the analysis needs more information.'}`);
  }
  lines.push('');

  const byId = new Map(input.comps.map((c) => [c.id, c]));
  const soldIds = new Set(r.evidence.sold.price_per_sqft?.comp_ids ?? r.evidence.sold.price?.comp_ids ?? []);
  const sold = input.output.comps.filter((c) => c.evidence_class === 'sold' && c.per_result[input.result].included && soldIds.has(c.id));
  if (sold.length) {
    lines.push('The recent sales it rests on:');
    for (const c of sold) {
      const pr = c.per_result[input.result];
      const comp = byId.get(c.id);
      const vsAsk = c.sale_to_ask_percent ? `, ${pct(c.sale_to_ask_percent.value)} against its last asking price` : '';
      lines.push(`- ${comp ? addressOf(comp) : c.id}: sold ${isoDay(c.status_date)} for ${usd(pr.price?.value)}` +
        (pr.price_per_sqft ? ` (${psf(pr.price_per_sqft.value)} a square foot)` : '') + vsAsk);
    }
    lines.push('');
  }

  const asks = input.output.comps.filter((c) => (c.evidence_class === 'in_contract' || c.evidence_class === 'active') && c.per_result[input.result].included);
  if (asks.length) {
    lines.push('On the market now (asking prices, not sales):');
    for (const c of asks) {
      const pr = c.per_result[input.result];
      const comp = byId.get(c.id);
      lines.push(`- ${comp ? addressOf(comp) : c.id}: ${c.evidence_class === 'in_contract' ? 'in contract, last asking' : 'asking'} ${usd(pr.price?.value)}` +
        (pr.price_per_sqft ? ` (${psf(pr.price_per_sqft.value)} a square foot)` : ''));
    }
    lines.push('');
  }

  if (r.sale_to_ask) {
    lines.push(`The sales above closed at a median ${pct(r.sale_to_ask.median.value)} against their last asking price.`, '');
  }

  if (input.result === 'with_estimates' && r.estimates_used.length) {
    lines.push('This range includes our own estimates, where the facts aren\'t known yet:');
    for (const e of new Set(r.estimates_used.map(estimateWords))) lines.push(`- ${e}`);
    lines.push('');
  }

  lines.push(PLACEHOLDER_DISCLAIMER, 'Data provided by StreetEasy.', '', input.agentName || '[your name]');
  const subject = `${input.sample ? '[SAMPLE] ' : ''}${where}: what the comparable sales say`;
  return { subject, body: lines.join('\n') };
}

export interface QaFinding {
  check: 'appraisal_word';
  match: string;
  index: number;
}

/** "Appraisal" and "appraised value" never appear in client copy — the one hard block (§9.3). */
export function appraisalFindings(text: string): QaFinding[] {
  const findings: QaFinding[] = [];
  for (const m of text.matchAll(/\b(appraisals?|appraised\s+values?)\b/gi)) {
    findings.push({ check: 'appraisal_word', match: m[0], index: m.index ?? 0 });
  }
  return findings;
}
