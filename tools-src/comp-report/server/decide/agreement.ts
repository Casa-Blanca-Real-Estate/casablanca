// Agreement with the labels (Dispatch 10 phase 2 step 5), pure: the labels
// sheet (docs/comp-report/jev-labels.csv) against a batch's judgments, per
// question and provider, by probability band. And a proposed bar per question,
// by the rule pre-registered in docs/comp-report/jev-calibration.md before any
// live call. The labels never reach production: the CLI (dev/jev.ts) reads the
// sheet here, and the batch's judgments from the readout.

import { readCsv } from '../../engine/parser/csv.ts';
import { checkListingLink } from '../../workspace/links.ts';
import { QUESTION_BY_ID, QUESTIONS } from './registry.ts';

export const LABEL_COLUMNS: readonly string[] = QUESTIONS.map((q) => q.id);
export const SHEET_HEADER: readonly string[] = [
  'id', 'url', 'home', 'source', 'picked_for', 'has_text', ...LABEL_COLUMNS, 'labelled_by', 'labelled_on', 'note',
];

export interface LabelRow {
  id: string;
  url: string;
  /** "no": the page has no description; the row is left out. */
  hasText: 'yes' | 'no' | '';
  /** Per question: an option key, or "true"/"false" for a yes/no. Missing when not labelled. */
  labels: Record<string, string>;
}

/** What a yes/no cell may say, and what it means: "no" is "the text doesn't say so", as the registry's false. */
const YES_NO: Record<string, string> = { yes: 'true', no: 'false' };

/** PURE: the sheet, checked. A problem names its row and column; nothing is guessed. */
export function readLabelSheet(text: string): { rows: LabelRow[]; problems: string[] } {
  const { rows: raw } = readCsv(text);
  const problems: string[] = [];
  const nonEmpty = raw.filter((r) => r.some((c) => c.trim() !== ''));
  const [header, ...body] = nonEmpty;
  if (!header || header.join(',') !== SHEET_HEADER.join(',')) {
    return { rows: [], problems: [`the header must be exactly: ${SHEET_HEADER.join(',')}`] };
  }
  const col = (name: string) => SHEET_HEADER.indexOf(name);
  const rows: LabelRow[] = [];
  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const [n, r] of body.entries()) {
    const line = n + 2;
    const cell = (name: string) => (r[col(name)] ?? '').trim();
    const id = cell('id');
    if (!/^L\d{2}$/.test(id)) problems.push(`row ${line}: id "${id}" isn't L01–L99`);
    if (ids.has(id)) problems.push(`row ${line}: id ${id} is used twice`);
    ids.add(id);
    const check = checkListingLink(cell('url'));
    if (!check.ok) problems.push(`row ${line} (${id}): ${check.reason}`);
    else if (check.url !== cell('url')) problems.push(`row ${line} (${id}): write the link as ${check.url}`);
    else if (urls.has(check.url)) problems.push(`row ${line} (${id}): that link is already in the sheet`);
    if (check.ok) urls.add(check.url);
    const hasText = cell('has_text').toLowerCase();
    if (hasText !== '' && hasText !== 'yes' && hasText !== 'no') problems.push(`row ${line} (${id}): has_text is yes, no or blank`);
    const labels: Record<string, string> = {};
    for (const qid of LABEL_COLUMNS) {
      const v = cell(qid).toLowerCase();
      if (v === '') continue;
      const q = QUESTION_BY_ID.get(qid)!;
      if (q.type === 'choice') {
        if (!q.options.some((o) => o.key === v)) problems.push(`row ${line} (${id}): ${qid} is one of ${q.options.map((o) => o.key).join(', ')}`);
        else labels[qid] = v;
      } else if (q.type === 'boolean') {
        if (!(v in YES_NO)) problems.push(`row ${line} (${id}): ${qid} is yes or no`);
        else labels[qid] = YES_NO[v]!;
      }
    }
    rows.push({ id, url: check.ok ? check.url : cell('url'), hasText: hasText as LabelRow['hasText'], labels });
  }
  return { rows, problems };
}

export interface BatchJudgment {
  url: string;
  provider: string;
  question: string;
  answer: string | null;
  probability: number | null;
  orderStable: boolean;
}

/** A label that says something: a class other than the abstain option, or a yes. */
export function isPositive(questionId: string, label: string): boolean {
  const q = QUESTION_BY_ID.get(questionId);
  if (!q) return false;
  if (q.type === 'choice') return label !== q.abstain;
  if (q.type === 'boolean') return label === 'true';
  return true;
}

/** The reporting bands of an answer's probability. An order flip is its own band, whatever the mean. */
export const BANDS = ['order-flip', '<0.4', '0.4–0.6', '0.6–0.8', '0.8–0.9', '0.9–0.95', '≥0.95'] as const;
export type ReportBand = (typeof BANDS)[number];

export function reportBand(p: number | null, orderStable: boolean): ReportBand {
  if (!orderStable || p === null) return 'order-flip';
  if (p < 0.4) return '<0.4';
  if (p <= 0.6) return '0.4–0.6';
  if (p < 0.8) return '0.6–0.8';
  if (p < 0.9) return '0.8–0.9';
  if (p < 0.95) return '0.9–0.95';
  return '≥0.95';
}

/** The pre-registered rule (jev-calibration.md, "How a bar is proposed"). */
export const BAR_RULE = {
  thresholds: [0.6, 0.7, 0.8, 0.85, 0.9, 0.95],
  /** At least this many order-stable answers at or above a threshold. */
  minAnswers: 10,
  /**
   * And at least this many of them agreeing on a positive label — a named
   * class, or a yes — so a bar can't stand on "not stated" and "no" alone.
   */
  minPositives: 3,
  high: 0.95,
  middling: 0.85,
} as const;

export interface ProposedBar {
  /** The lowest threshold whose answers agree with the labels at BAR_RULE.high or better, or null. */
  high: number | null;
  /** Likewise at BAR_RULE.middling, below the high bar. */
  middling: number | null;
  verdict: 'proposed' | 'not ready';
  why: string;
}

/** PURE: the bars the rule proposes from one question × provider's labelled answers. */
export function proposeBar(pairs: ReadonlyArray<{ p: number | null; stable: boolean; agree: boolean; positive: boolean }>): ProposedBar {
  const stable = pairs.filter((x) => x.stable && x.p !== null) as Array<{ p: number; stable: boolean; agree: boolean; positive: boolean }>;
  const share = (t: number) => {
    const at = stable.filter((x) => x.p >= t && !(x.p >= 0.4 && x.p <= 0.6));
    return {
      n: at.length,
      share: at.length ? at.filter((x) => x.agree).length / at.length : 0,
      positives: at.filter((x) => x.agree && x.positive).length,
    };
  };
  const lowest = (need: number) => BAR_RULE.thresholds.find((t) => {
    const s = share(t);
    return s.n >= BAR_RULE.minAnswers && s.share >= need && s.positives >= BAR_RULE.minPositives;
  }) ?? null;
  const high = lowest(BAR_RULE.high);
  const middlingRaw = lowest(BAR_RULE.middling);
  const middling = middlingRaw !== null && (high === null || middlingRaw < high) ? middlingRaw : null;
  if (high === null) {
    return {
      high: null, middling, verdict: 'not ready',
      why: `no threshold has ${BAR_RULE.minAnswers}+ order-stable answers agreeing ${BAR_RULE.high * 100}% or more, ${BAR_RULE.minPositives}+ of them on a named class or a yes`,
    };
  }
  return { high, middling, verdict: 'proposed', why: `at ${high}+, ${share(high).n} answers agree ${(share(high).share * 100).toFixed(0)}%` };
}

export interface QuestionAgreement {
  question: string;
  provider: string;
  labelled: number;
  answered: number;
  agree: number;
  share: number | null;
  bands: Record<ReportBand, { n: number; agree: number }>;
  bar: ProposedBar;
  disagreements: Array<{ id: string; url: string; label: string; answer: string | null; probability: number | null; orderStable: boolean }>;
}

/**
 * PURE: agreement per question × provider. A judgment counts when its page is
 * in the sheet, has text, and the question is labelled there. Pass one
 * judgment per page × question × provider (the CLI keeps the latest).
 */
export function agreement(rows: readonly LabelRow[], judgments: readonly BatchJudgment[]): QuestionAgreement[] {
  const byUrl = new Map(rows.map((r) => [r.url, r]));
  const out = new Map<string, QuestionAgreement>();
  for (const j of judgments) {
    const row = byUrl.get(j.url);
    if (!row || row.hasText === 'no') continue;
    const label = row.labels[j.question];
    if (label === undefined) continue;
    const key = `${j.question}|${j.provider}`;
    const e = out.get(key) ?? {
      question: j.question, provider: j.provider, labelled: 0, answered: 0, agree: 0, share: null,
      bands: Object.fromEntries(BANDS.map((b) => [b, { n: 0, agree: 0 }])) as QuestionAgreement['bands'],
      bar: proposeBar([]), disagreements: [],
    };
    e.labelled++;
    if (j.answer !== null) {
      e.answered++;
      const ok = j.answer === label;
      if (ok) e.agree++;
      const b = e.bands[reportBand(j.probability, j.orderStable)];
      b.n++;
      if (ok) b.agree++;
      if (!ok) e.disagreements.push({ id: row.id, url: row.url, label, answer: j.answer, probability: j.probability, orderStable: j.orderStable });
    }
    out.set(key, e);
  }
  const pairsFor = (q: string, provider: string) => judgments
    .filter((j) => j.question === q && j.provider === provider && j.answer !== null)
    .flatMap((j) => {
      const row = byUrl.get(j.url);
      const label = row && row.hasText !== 'no' ? row.labels[q] : undefined;
      return label === undefined ? [] : [{ p: j.probability, stable: j.orderStable, agree: j.answer === label, positive: isPositive(q, label) }];
    });
  return [...out.values()]
    .map((e) => ({ ...e, share: e.answered ? e.agree / e.answered : null, bar: proposeBar(pairsFor(e.question, e.provider)) }))
    .sort((a, b) => LABEL_COLUMNS.indexOf(a.question) - LABEL_COLUMNS.indexOf(b.question) || a.provider.localeCompare(b.provider));
}
