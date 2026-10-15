// Send's issues panel (Dispatch 14, item 10): what QA found, as numbered issues.
// Each knows where it is in the plain-text body (and in the headline field),
// so the body can mark it and "Show" can find it; whether it stands between
// the email and Copy; how the agent can answer for it; and, where QA knows
// the fix, the fix — deterministic, on the plain text, never a model's.
//
// The issues are QA's checks (workspace/qa.ts, draftChecks) as the agent
// meets them, plus two QA only knows how to fix: a range end written at
// another rounding than the range's own ("round it the same way"), and the
// headline's placeholder left in an edited body. Pure: no DOM, no React.
import type { EngineOutput, ResultKind } from '../../../engine/index.ts';
import { fairHousingFindings } from '../../../workspace/fair-housing.ts';
import { HEADLINE_PLACEHOLDER } from '../../../workspace/frame.ts';
import { unmatchedNumbers, type Ledger } from '../../../workspace/grounding.ts';
import {
  appraisalFindings, estimateSentences, pointValueFindings, rangeFigureFor, replaceSpans, roundingFindings,
  withDisclaimer, withEstimateNotes, withHeadline, type Acknowledgment, type QaCheck,
} from '../../../workspace/qa.ts';

export interface Span {
  start: number;
  end: number;
}

export type IssueFix =
  | { kind: 'replace'; to: string }
  | { kind: 'disclaimer' }
  | { kind: 'estimates'; sentences: string[] }
  | { kind: 'placeholder' };

export interface SendIssue {
  /** QA's own key where it has one ("number:$4.3M"), so an answer is logged against it. */
  key: string;
  /** 1, 2, 3…: the panel's number and the annotation's. */
  n: number;
  text: string;
  /** Holds Copy until it's fixed or answered: the "N to fix". A note doesn't. */
  blocking: boolean;
  /** Can't be answered away (§9.3): the red underline. */
  hard: boolean;
  /** Where it is in the body, and in the headline field. */
  body: Span[];
  headline: Span[];
  /** Where Show goes when it has no place in the text. */
  target: 'headline' | 'subject' | 'end' | null;
  fix: IssueFix | null;
  /** How the agent can answer for it instead: theirs (or the client's), or kept as it is. */
  answers: Acknowledgment['how'][];
}

/** Every place a piece of text appears, case-sensitive unless asked. */
function occurrences(text: string, needle: string, caseless = false): Span[] {
  if (!needle) return [];
  const hay = caseless ? text.toLowerCase() : text;
  const n = caseless ? needle.toLowerCase() : needle;
  const out: Span[] = [];
  for (let at = hay.indexOf(n); at >= 0; at = hay.indexOf(n, at + n.length)) out.push({ start: at, end: at + n.length });
  return out;
}

const at = (index: number, length: number): Span => ({ start: index, end: index + length });

type Draft = Omit<SendIssue, 'n'>;

export interface IssueArgs {
  /** QA's checks on the whole email: the subject line and the body. */
  checks: QaCheck[];
  body: string;
  /** The agent's headline, as the field holds it. */
  headline: string;
  ledger: Ledger;
  output: EngineOutput;
  result: ResultKind;
  acks: Acknowledgment[];
}

/** The issues on a draft, in the order the agent meets them: the headline first, then down the body. */
export function sendIssues(a: IssueArgs): SendIssue[] {
  const acked = new Set(a.acks.map((x) => x.key));
  const list: Draft[] = [];
  const says = (head: Span[]) => (head.length ? 'Headline says' : 'The email says');
  const numbersIn = (text: string) => unmatchedNumbers(text, a.ledger);
  const bodyNumbers = numbersIn(a.body);
  const headNumbers = numbersIn(a.headline);

  for (const c of a.checks) {
    if (c.state === 'pass') continue;
    switch (c.id) {
      case 'headline':
        list.push({
          key: 'headline', text: c.message, blocking: true, hard: false, body: occurrences(a.body, HEADLINE_PLACEHOLDER), headline: [],
          target: 'headline', fix: null, answers: [],
        });
        break;
      case 'numbers':
        for (const i of c.items ?? []) {
          if (i.ack) continue;
          const body = bodyNumbers.filter((x) => x.text === i.text).map((x) => at(x.index, x.text.length));
          const headline = headNumbers.filter((x) => x.text === i.text).map((x) => at(x.index, x.text.length));
          const fig = rangeFigureFor(i.text, a);
          list.push({
            key: i.key,
            text: fig
              ? `${says(headline)} ${i.text}; the range’s ${fig.end} end is ${fig.figure}. Use the range’s figure.`
              : `${i.text} doesn’t match the comps, the facts or anything you stated. Edit it, or say whose it is.`,
            blocking: true, hard: false, body, headline, target: body.length || headline.length ? null : 'subject',
            fix: fig ? { kind: 'replace', to: fig.figure } : null, answers: ['attributed', 'acknowledged'],
          });
        }
        break;
      case 'range':
        for (const i of c.items ?? []) {
          const spans = (text: string) => pointValueFindings(text).filter((f) => f.text.toLowerCase() === i.text.toLowerCase()).map((f) => at(f.index, f.text.length));
          list.push({
            key: i.key, text: `“${i.text}” reads as one value. A range, or a list price, is how the house speaks.`,
            blocking: false, hard: false, body: spans(a.body), headline: spans(a.headline), target: null, fix: null, answers: [],
          });
        }
        break;
      case 'appraisal': {
        const spans = (text: string) => appraisalFindings(text).map((f) => at(f.index, f.match.length));
        list.push({ key: 'appraisal', text: c.message, blocking: true, hard: true, body: spans(a.body), headline: spans(a.headline), target: 'subject', fix: null, answers: [] });
        break;
      }
      case 'fair_housing':
      case 'fair_housing_near': {
        const level = c.id === 'fair_housing' ? 'hard' : 'near';
        for (const i of c.items ?? []) {
          if (i.ack) continue;
          const spans = (text: string) => fairHousingFindings(text)
            .filter((f) => f.level === level && f.term.toLowerCase() === i.text.toLowerCase())
            .map((f) => at(f.index, f.term.length));
          list.push({
            key: i.key,
            text: level === 'hard'
              ? `Take out “${i.text}”: fair housing (${i.note}). Describe the home and the market, not who it suits.`
              : `Check “${i.text}”: it’s close to a fair-housing term. Keep it only if it’s about the property.`,
            blocking: true, hard: level === 'hard', body: spans(a.body), headline: spans(a.headline), target: 'subject',
            fix: null, answers: level === 'hard' ? [] : ['acknowledged'],
          });
        }
        break;
      }
      case 'disclaimer':
        list.push({
          key: 'disclaimer', text: 'The disclaimer is missing. It goes out with every email.', blocking: true, hard: false,
          body: [], headline: [], target: 'end', fix: { kind: 'disclaimer' }, answers: [],
        });
        break;
      case 'estimates': {
        const missing = estimateSentences(a.output, a.result).filter((s) => !a.body.includes(s));
        const sizeOnly = a.output.results.with_estimates.estimates_used.every((e) => e.what === 'area_sqft');
        list.push({
          key: 'estimates',
          text: sizeOnly ? 'The email uses your size estimate and doesn’t say so.' : 'The email uses your estimates and doesn’t say so.',
          blocking: true, hard: false, body: [], headline: [], target: 'end',
          fix: missing.length ? { kind: 'estimates', sentences: missing } : null, answers: [],
        });
        break;
      }
      case 'sample':
        list.push({ key: 'sample', text: c.message, blocking: false, hard: false, body: [], headline: [], target: null, fix: null, answers: [] });
        break;
    }
  }

  // The range's ends at another rounding than the range's own: QA passes them, and knows the fix.
  const rBody = roundingFindings(a.body, a);
  const rHead = roundingFindings(a.headline, a);
  for (const text of [...new Set([...rHead, ...rBody].map((f) => f.text))]) {
    const key = `rounding:${text}`;
    if (acked.has(key)) continue;
    const headline = rHead.filter((f) => f.text === text).map((f) => at(f.index, f.text.length));
    const body = rBody.filter((f) => f.text === text).map((f) => at(f.index, f.text.length));
    const expected = (rHead.find((f) => f.text === text) ?? rBody.find((f) => f.text === text))!.expected;
    list.push({
      key, text: `${says(headline)} ${text}; the range is ${expected}. Round it the same way.`,
      blocking: true, hard: false, body, headline, target: null, fix: { kind: 'replace', to: expected }, answers: ['acknowledged'],
    });
  }

  // The headline's placeholder, left in an edited body after the headline was written.
  if (a.headline.trim() && a.body.includes(HEADLINE_PLACEHOLDER)) {
    list.push({
      key: 'placeholder', text: 'The email still holds the headline’s placeholder. Put your headline in its place.',
      blocking: true, hard: false, body: occurrences(a.body, HEADLINE_PLACEHOLDER), headline: [], target: null,
      fix: { kind: 'placeholder' }, answers: [],
    });
  }

  const place = (i: Draft): number => {
    if (i.key === 'headline') return -2;
    if (i.headline.length) return -1 + i.headline[0]!.start / 1e6;
    if (i.body.length) return Math.min(...i.body.map((s) => s.start));
    if (i.target === 'end' || i.target === 'subject') return a.body.length;
    return Number.POSITIVE_INFINITY;
  };
  return list
    .map((i, k) => ({ i, k }))
    .sort((x, y) => place(x.i) - place(y.i) || x.k - y.k)
    .map(({ i }, k) => ({ ...i, n: k + 1 }));
}

/** "2 to fix"; with only notes left, "Ready, with a note"; with none, "Ready to send". */
export function issuesHeading(issues: SendIssue[]): string {
  const fix = issues.filter((i) => i.blocking).length;
  if (fix) return `${fix} to fix`;
  const notes = issues.length;
  if (notes) return notes === 1 ? 'Ready, with a note' : `Ready, with ${notes} notes`;
  return 'Ready to send';
}

/** The button for the fixes QA can make: "Fix it", "Fix both", "Fix all". */
export function fixLabel(issues: SendIssue[]): string | null {
  const n = issues.filter((i) => i.fix).length;
  if (!n) return null;
  return n === 1 ? 'Fix it' : n === 2 ? 'Fix both' : 'Fix all';
}

/**
 * The fixes, applied to the body and the headline: each flagged figure takes
 * the range's own; the placeholder takes the headline; the estimate note goes
 * in after the headline; the disclaimer goes back in. Overlapping replacements
 * keep the first.
 */
export function applyFixes(text: { body: string; headline: string }, issues: SendIssue[]): { body: string; headline: string } {
  const fixable = issues.filter((i) => i.fix);
  const edits = (where: 'body' | 'headline') => {
    const out: { index: number; length: number; with: string }[] = [];
    for (const i of fixable) {
      if (i.fix!.kind !== 'replace') continue;
      for (const s of i[where]) {
        if (out.some((e) => s.start < e.index + e.length && e.index < s.end)) continue;
        out.push({ index: s.start, length: s.end - s.start, with: i.fix!.to });
      }
    }
    return out;
  };
  const headline = replaceSpans(text.headline, edits('headline'));
  let body = replaceSpans(text.body, edits('body'));
  for (const i of fixable) {
    const fix = i.fix!;
    if (fix.kind === 'placeholder') body = withHeadline(body, headline);
    else if (fix.kind === 'estimates') body = withEstimateNotes(body, fix.sentences, headline);
  }
  if (fixable.some((i) => i.fix!.kind === 'disclaimer')) body = withDisclaimer(body);
  return { body, headline };
}
