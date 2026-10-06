// Does a sentence cite only the headline's facts (§10.2)? Every number in it
// must be one of the engine's headline facts, or part of a name the facts rest
// on (the "17" of "17L", the "200" of "200 Chambers"). A number matches a fact
// when the fact at the number's own precision is that number: rounded for
// prices, percents and counts — "$4.2M" and "$4.23M" both match $4,225,352 —
// and truncated for $/sq ft, as §6.1 shows it: "$2,112" matches $2,112.68, and
// "$2,113" doesn't. Small counts in words ("three") aren't
// numbers here. The full numeric grounding is QA's (CR-5); this is its first
// check, used to prove the drafts and to flag a headline's stray figure.
import type { HeadlineFact, HeadlineFacts } from '../engine/index.ts';

interface Token {
  text: string;
  value: number;
  /** The token's own precision: 0.01M is 10,000. */
  step: number;
  /** A bare number (no $, %, K or M) can be part of a name. */
  bare: boolean;
}

const NUMBER = /\$?\d[\d,]*(?:\.\d+)?(?:\s?[KkMm](?![a-z]))?%?/g;

function tokens(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const raw = m[0];
    const suffix = /([KkMm])%?$/.exec(raw)?.[1]?.toUpperCase();
    const multiplier = suffix === 'M' ? 1e6 : suffix === 'K' ? 1e3 : 1;
    const digits = raw.replace(/[$,%\sKkMm]/g, '');
    const decimals = digits.includes('.') ? digits.split('.')[1]!.length : 0;
    out.push({
      text: raw.trim().replace(/,$/, ''),
      value: Number(digits) * multiplier,
      step: 10 ** -decimals * multiplier,
      bare: !/[$%KkMm]/.test(raw),
    });
  }
  return out;
}

function matches(t: Token, f: HeadlineFact): boolean {
  const v = Math.abs(f.value);
  const shown = f.unit === 'usd_per_sqft' ? Math.trunc(v / t.step) * t.step : Math.round(v / t.step) * t.step;
  return Math.abs(shown - t.value) < t.step / 1000;
}

/**
 * The numbers in a text that trace to none of the headline facts or names.
 * `agent` lets the agent's own number count too: QA allows it in a headline
 * the agent writes; a draft never cites it (§8.4).
 */
export function numbersNotInFacts(text: string, h: HeadlineFacts, opts: { agent?: boolean } = {}): string[] {
  const facts = [...h.facts, ...(opts.agent ? h.agent_number?.facts ?? [] : [])];
  const nameNumbers = new Set(h.names.flatMap((n) => `${n.address ?? ''} ${n.unit ?? ''}`.match(/\d+/g) ?? []));
  return tokens(text)
    .filter((t) => !(t.bare && nameNumbers.has(String(t.value))) && !facts.some((f) => matches(t, f)))
    .map((t) => t.text);
}
