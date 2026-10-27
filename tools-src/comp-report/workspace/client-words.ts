// The client's words, written on Send (Dispatch 26, D-29): an overview, then a
// paragraph for each comp the email shows, written for the client from the
// whole process, not lifted from Sort. The human drives, as on Sort's review:
//
//   - a practice agent writes the overview and each paragraph, asks Hubert for
//     feedback (what's unclear, unsupported or off-voice, and the fair-housing
//     list), and only after one round can see the writer's version: they keep
//     theirs, revise it, or take his
//   - a full agent gets the writer's draft for each comp, and edits or approves
//     it; they can tell him what to change and redraft
//
// Plain data, like review.ts, so the browser, the server and the tests read the
// same shapes. What it holds:
//   - a comp's client paragraph, as stored on report_comps.client_line
//   - a round with Hubert on the overview or one comp, as stored: append-only,
//     in reports.state.clientRounds (no migration: state is jsonb), written
//     only by the server's client-words call, never by the browser's state save
//   - the steps the flow walks, and when each is done
//   - what the model is given for one comp, or for the overview: never the
//     agent's number, the target or the deal terms (writer-input.ts builds it)
import type { EngineOutput, ResultKind } from '../engine/index.ts';
import type { WorkspaceComp } from './engine-input.ts';
import { countedComps } from './email.ts';
import { latest } from './review.ts';
import type { SendState } from './state.ts';
import type { WriterComp, WriterInput } from './writer-input.ts';

/** Who wrote a comp's paragraph: the agent, the writer, or the writer's draft as the agent edited it. */
export type ClientLineBy = 'agent' | 'writer' | 'both';

/** A comp's paragraph for the client (report_comps.client_line). In the email it wins over the writer's lines and the Sort note. */
export interface ClientLine {
  text: string;
  by: ClientLineBy;
  at: string;
}

export const MAX_CLIENT_LINE = 1200;
const BY: readonly ClientLineBy[] = ['agent', 'writer', 'both'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A stored paragraph, or null when it isn't one (or is empty). */
export function cleanClientLine(raw: unknown): ClientLine | null {
  if (!isObject(raw)) return null;
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!text || text.length > MAX_CLIENT_LINE) return null;
  const by = BY.find((b) => b === raw.by);
  if (!by || typeof raw.at !== 'string' || Number.isNaN(Date.parse(raw.at))) return null;
  return { text, by, at: raw.at };
}

/** A paragraph's author, from where it started: unchanged from Hubert's draft, edited from it, or the agent's own. */
export function lineBy(text: string, draft: string | null | undefined, before?: ClientLineBy): ClientLineBy {
  const t = text.trim();
  const d = draft?.trim();
  if (d && t === d) return 'writer';
  if (d) return 'both';
  return before === 'writer' || before === 'both' ? 'both' : 'agent';
}

// ─── Rounds with Hubert ──────────────────────────────────────────────────────

export type ClientRoundKind = 'feedback' | 'draft';

/** The overview's rounds are kept under this key; a comp's under its report comp id. */
export const OVERVIEW = 'overview';

/**
 * One round with Hubert on the overview or one comp. Feedback carries what the
 * agent wrote when they asked (`wrote`); a draft is the writer's version of
 * the paragraph, with what a full agent asked him to change (`asked`).
 */
export interface ClientRound {
  at: string;
  kind: ClientRoundKind;
  text: string;
  by: string;
  wrote?: string;
  asked?: string;
  /** Filled in by the sample: shown labelled "Sample". */
  sample?: boolean;
}

export const MAX_CLIENT_ROUNDS = 30;
export const MAX_ROUND_TEXT = 4000;
export const MAX_CLIENT_ASKED = 1000;

export function cleanClientRound(raw: unknown): ClientRound | null {
  if (!isObject(raw)) return null;
  if (raw.kind !== 'feedback' && raw.kind !== 'draft') return null;
  if (typeof raw.at !== 'string' || Number.isNaN(Date.parse(raw.at))) return null;
  if (typeof raw.text !== 'string' || !raw.text.trim() || raw.text.length > MAX_ROUND_TEXT) return null;
  if (typeof raw.by !== 'string' || !raw.by) return null;
  const out: ClientRound = { at: raw.at, kind: raw.kind, text: raw.text.trim(), by: raw.by };
  if (typeof raw.wrote === 'string') out.wrote = raw.wrote.slice(0, MAX_ROUND_TEXT);
  if (typeof raw.asked === 'string' && raw.asked.length <= MAX_CLIENT_ASKED) out.asked = raw.asked;
  if (raw.sample === true) out.sample = true;
  return out;
}

export function cleanClientRounds(raw: unknown): ClientRound[] {
  return Array.isArray(raw) ? raw.map(cleanClientRound).filter((e): e is ClientRound => e !== null) : [];
}

/** state.clientRounds: the overview's and every comp's rounds. */
export function cleanAllClientRounds(raw: unknown): Record<string, ClientRound[]> {
  if (!isObject(raw)) return {};
  const out: Record<string, ClientRound[]> = {};
  for (const [id, list] of Object.entries(raw)) {
    const rounds = cleanClientRounds(list);
    if (rounds.length) out[id] = rounds;
  }
  return out;
}

export function latestRound(rounds: readonly ClientRound[] | undefined, kind: ClientRoundKind): ClientRound | null {
  return [...(rounds ?? [])].reverse().find((r) => r.kind === kind) ?? null;
}

/** A practice agent sees the writer's version only after one round of feedback on theirs. */
export function versionUnlocked(rounds: readonly ClientRound[] | undefined, level: 'practice' | 'full'): boolean {
  return level === 'full' || Boolean(latestRound(rounds, 'feedback'));
}

// ─── The flow's steps ────────────────────────────────────────────────────────

/** The comps the email shows (countedComps), the anchor first, then by status as the email groups them. */
export function clientSteps(output: EngineOutput, result: ResultKind, comps: WorkspaceComp[]): WorkspaceComp[] {
  const rows = countedComps(output, result, comps);
  const rank = (s: string) => ['sold', 'in_contract', 'active', 'off_market'].indexOf(s);
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(Boolean(b.r.comp.judgment?.anchor)) - Number(Boolean(a.r.comp.judgment?.anchor)) || rank(a.r.status) - rank(b.r.status) || a.i - b.i)
    .map(({ r }) => r.comp)
    .filter((c) => Boolean(c.judgment?.reportCompId));
}

/** The overview is written: a headline and how the comps were chosen. */
export function overviewDone(send: SendState): boolean {
  return Boolean(send.headline?.value.trim() && send.chosen?.value.trim());
}

/** How far the client's words are: the overview, and how many of the shown comps have a paragraph. */
export function clientProgress(send: SendState, steps: WorkspaceComp[]): { overview: boolean; written: number; total: number } {
  return { overview: overviewDone(send), written: steps.filter((c) => c.judgment?.clientLine?.text.trim()).length, total: steps.length };
}

// ─── What the model is given ─────────────────────────────────────────────────

/**
 * One comp, for its client paragraph: the writer's view of it (its facts, how
 * it differs from the home, the agent's Sort note and tags), Hubert's take on
 * it from Sort when there is one, and for feedback the agent's paragraph.
 */
export interface ClientCompInput {
  home: WriterInput['home'];
  audience: WriterInput['audience'];
  client_first_name: string | null;
  comp: WriterComp;
  /** Hubert's take from Sort's review (Dispatch 25): reasoning the agent has seen. */
  hubert_take_on_sort: string | null;
  /** The paragraph the agent wrote for the client: what feedback reviews. */
  agent_paragraph?: string;
  /** A full agent's words to Hubert, before he drafts it again. */
  agent_asks?: string;
  /** The draft the agent asked him to change. */
  last_draft?: string;
}

/** The overview, for feedback: the agent's headline and lines, and the comps they sit on. */
export interface ClientOverviewInput {
  home: WriterInput['home'];
  audience: WriterInput['audience'];
  client_first_name: string | null;
  headline_facts: WriterInput['headline_facts'];
  comps: { name: string; status: WriterComp['status']; frame_line: string }[];
  agent_overview: { headline: string; how_the_comps_were_chosen: string; things_to_consider: string; next_step: string };
}

export function clientCompInput(args: {
  report: WriterInput;
  comp: WorkspaceComp;
  job: ClientRoundKind;
  paragraph?: string | null;
  asks?: string | null;
  lastDraft?: string | null;
}): ClientCompInput | null {
  const wc = args.report.comps.find((c) => c.id === args.comp.id);
  if (!wc) return null;
  const take = latest(args.comp.judgment?.review, 'take');
  const input: ClientCompInput = {
    home: args.report.home,
    audience: args.report.audience,
    client_first_name: args.report.client_first_name,
    comp: wc,
    hubert_take_on_sort: take?.text ?? null,
  };
  if (args.job === 'feedback') input.agent_paragraph = args.paragraph?.trim() ?? '';
  const asks = args.asks?.trim();
  if (args.job === 'draft' && asks) input.agent_asks = asks;
  if (args.job === 'draft' && asks && args.lastDraft?.trim()) input.last_draft = args.lastDraft.trim();
  return input;
}

export function clientOverviewInput(report: WriterInput, send: SendState): ClientOverviewInput {
  return {
    home: report.home,
    audience: report.audience,
    client_first_name: report.client_first_name,
    headline_facts: report.headline_facts,
    comps: report.comps.map((c) => ({ name: c.name, status: c.status, frame_line: c.frame_line })),
    agent_overview: {
      headline: send.headline?.value.trim() ?? '',
      how_the_comps_were_chosen: send.chosen?.value.trim() ?? '',
      things_to_consider: send.consider?.value.trim() ?? '',
      next_step: send.nextStep?.value.trim() ?? '',
    },
  };
}
