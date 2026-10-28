// Calls to the comp report's functions. Same origin; the session token rides
// in the Authorization header on every request.
import type { NarrativeView as Narrative } from '../server/api/narratives.ts';
import type { LinkReadView, WorkspaceData } from '../server/api/workspace.ts';
import type { GeocodeView } from '../server/buildings.ts';
import type { Acknowledgment } from '../workspace/qa.ts';
import type { ClientRound } from '../workspace/client-words.ts';
import type { ReviewEntry } from '../workspace/review.ts';
import type { Brief, CallState, DealTermsState, Intake, ReasonType, RevealPin, SendState, TargetState, WorkspaceState } from '../workspace/state.ts';
import { session } from './session.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function headers(): Promise<Record<string, string>> {
  const token = await session.token();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fail(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  throw new ApiError(res.status, body.error ?? 'http_' + res.status, body.message ?? `Request failed (${res.status}).`);
}

// A GET started before the view that reads it has mounted. App starts the page's
// first data call alongside /me, so on a reload the two functions (each maybe
// starting cold) run side by side instead of one after the other. Each is taken
// once, by the first matching api() call, and only while fresh. The server
// checks access on that call as on any other, so a refused /me loses nothing.
const early = new Map<string, { at: number; result: Promise<unknown> }>();
const EARLY_MS = 15_000;

export function prefetch(path: string): void {
  const result = request(path, {});
  result.catch(() => undefined); // a failure surfaces to whoever takes it
  early.set(path, { at: Date.now(), result });
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const started = (init.method ?? 'GET') === 'GET' ? early.get(path) : undefined;
  if (started) {
    early.delete(path);
    if (Date.now() - started.at < EARLY_MS) return started.result as Promise<T>;
  }
  return request<T>(path, init);
}

async function request<T>(path: string, init: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: await headers(),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) await fail(res);
  return (await res.json()) as T;
}

export type Role = 'agent' | 'mentor' | 'admin' | 'external';

export interface Me {
  user: { email: string; name: string | null; role: Role; capability: 'practice' | 'full'; persisted: boolean; guest?: boolean };
  database: 'ready' | 'not_configured';
}

/** Admins, and a guest walking a preview through (guest mode), get the sample data and dev tools. */
export function maySample(me: Me): boolean {
  return me.user.role === 'admin' || Boolean(me.user.guest);
}

export interface Report {
  id: string;
  title: string;
  propertyType: 'condo' | 'coop';
  status: 'active' | 'archived' | 'deleted';
  ownerEmail: string;
  /** The owner's name, on Everyone's reports. */
  ownerName?: string | null;
  /** Filled with sample data at some point (Dispatch 07). */
  sampleData: boolean;
  createdAt: string;
  updatedAt: string;
  /** The reports list (Dispatch 14). */
  client?: string | null;
  side?: 'buyer' | 'seller' | null;
  stage?: 'sort' | 'findings' | 'send' | 'sent';
  unsorted?: number;
}

export interface AllowlistEntry {
  email: string;
  role: Role;
  note: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  revokedAt: string | null;
  revokedBy: string | null;
}

export interface ShownMessage {
  seq: number;
  role: 'user' | 'assistant';
  text: string;
  progress: string[];
  tools: string[];
  toolResultsOnly: boolean;
  stopReason: string | null;
  inContext: boolean;
  createdAt: string;
}

export type { HubertEmailEdit } from '../server/hubert-email.ts';

export type TurnEvent =
  | { type: 'email_edit'; edit: import('../server/hubert-email.ts').HubertEmailEdit }
  | { type: 'start'; model: string }
  | { type: 'progress'; text: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'fallback'; from: string; to: string }
  | { type: 'done'; stopReason: string; model: string; ms: number }
  | { type: 'refused'; category: string | null }
  | { type: 'interrupted'; reason: string; ms: number }
  | { type: 'error'; code: string; status: number | null };

/** One assistant turn, as a stream of events (server/api/turn.ts). */
export async function* streamTurn(reportId: string, message?: string): AsyncGenerator<TurnEvent> {
  const res = await fetch('/api/comp-report/turn', {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ reportId, message }),
  });
  if (!res.ok || !res.body) await fail(res);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      if (chunk.startsWith('data: ')) yield JSON.parse(chunk.slice(6)) as TurnEvent;
    }
  }
}

// ─── The walkthrough (CR-3a) ────────────────────────────────────────────────

export type { LinkReadView, WorkspaceData, WorkspaceImport } from '../server/api/workspace.ts';
export type { GeocodeView } from '../server/buildings.ts';
export type { NarrativeView } from '../server/api/narratives.ts';

export interface SampleWalkthrough {
  title: string;
  propertyType: 'condo' | 'coop';
  intake: Intake;
  brief: Brief;
  target: TargetState;
  dealTerms: DealTermsState;
  call: Omit<CallState, 'at'>;
  send: SendState;
}

export interface WorkspacePatch {
  title?: string;
  brief?: Brief;
  call?: CallState | null;
  target?: TargetState | null;
  state?: WorkspaceState;
  sampleData?: true;
  /** The Co-op/Condo toggle (Dispatch 14): the engine computes with it. */
  propertyType?: 'condo' | 'coop';
}

/** One comp's edits (Dispatch 14): any of them, saved together; the server appends a reason for a tier or a changed note. */
export interface CompEdit {
  tier?: 'primary' | 'secondary' | 'excluded';
  note?: string | null;
  tags?: string[];
  features?: Record<string, string[]>;
  anchor?: boolean;
  reviewed?: boolean;
  confirmed?: true;
  /** Take it out of the report (true), or put it back (false). */
  removed?: boolean;
  /** Corrections to the source's facts (Dispatch 15): a value sets one, null puts the source's back. */
  factOverrides?: { price?: number | null; size?: number | null; date?: string | null; floor?: number | null };
  /** The comp's paragraph for the client (Dispatch 26), or null to clear it. The server stamps when. */
  clientLine?: { text: string; by: 'agent' | 'writer' | 'both' } | null;
}

export const workspaceApi = {
  load: (reportId: string) => api<WorkspaceData>(`/api/comp-report/workspace?report=${reportId}`),
  save: (reportId: string, patch: WorkspacePatch) =>
    api<{ saved: true; updatedAt: string; reveal?: RevealPin }>('/api/comp-report/workspace', { method: 'PATCH', body: { reportId, ...patch } }),
  importFile: (reportId: string, file: { filename: string; contentBase64: string; asOf: string }) =>
    api<WorkspaceData>('/api/comp-report/imports', { method: 'POST', body: { reportId, ...file } }),
  importSample: (reportId: string) => api<WorkspaceData>('/api/comp-report/imports', { method: 'POST', body: { reportId, sample: true } }),
  tier: (reportId: string, reportCompId: string, tier: string, reason: string, reasonType: ReasonType) =>
    api<WorkspaceData>('/api/comp-report/comps', { method: 'POST', body: { reportId, reportCompId, tier, reason, reasonType } }),
  mark: (reportId: string, reportCompId: string, change: { reviewed?: boolean; anchor?: boolean }) =>
    api<WorkspaceData>('/api/comp-report/comps', { method: 'PATCH', body: { reportId, reportCompId, ...change } }),
  sortSample: (reportId: string) => api<WorkspaceData>('/api/comp-report/comps', { method: 'POST', body: { reportId, sample: true } }),
  /**
   * Has the site read the sample comps' StreetEasy pages for their photos, once (server/sample/photos.ts).
   * Netlify answers 202 at once; the server does nothing if they're kept or being read. The sample
   * import and "Fill with sample: Sort" put them on the comps once they're there.
   */
  captureSamplePhotos: async (): Promise<void> => {
    await fetch('/.netlify/functions/comp-report-sample-photos-background', { method: 'POST', headers: await headers() }).catch(() => undefined);
  },
  sample: (kind: 'condo' | 'coop' = 'condo') => api<SampleWalkthrough>(`/api/comp-report/sample?kind=${kind}`),
  /** A new sample report, built on the server (Dispatch 23): the home, and its export imported, unsorted. */
  newSample: (kind: 'condo' | 'coop', title: string) =>
    api<{ report: Report }>('/api/comp-report/sample', { method: 'POST', body: { action: 'fill', kind, title } }),
  /** A fresh copy of this sample report, with an empty Hubert; the old one is archived. */
  resetSample: (reportId: string) =>
    api<{ report: Report; archived: string }>('/api/comp-report/sample', { method: 'POST', body: { action: 'reset', reportId } }),
  /** A comp read from its StreetEasy page, confirmed in one tap (§6.2). */
  confirm: (reportId: string, reportCompId: string) =>
    api<WorkspaceData>('/api/comp-report/comps', { method: 'PATCH', body: { reportId, reportCompId, confirmed: true } }),
  /** A comp typed in: address, status, price, size, floor, date — with its note, tags and features (Dispatch 14). */
  addManual: (reportId: string, manual: Record<string, unknown>, extra: { note?: string; tags?: string[]; features?: Record<string, string[]> } = {}) =>
    api<WorkspaceData>('/api/comp-report/comps', { method: 'POST', body: { reportId, manual, ...extra } }),
  /** A comp's tier, note, tags, features, anchor, confirmation or removal, together (Dispatch 14). */
  editComp: (reportId: string, reportCompId: string, edit: CompEdit) =>
    api<WorkspaceData>('/api/comp-report/comps', { method: 'PATCH', body: { reportId, reportCompId, ...edit } }),
  /** Several comps' tags at once: the tags the data settles (NB-9 C). */
  setTags: (reportId: string, tagEdits: { reportCompId: string; tags: string[] }[]) =>
    api<WorkspaceData>('/api/comp-report/comps', { method: 'PATCH', body: { reportId, tagEdits } }),
};

// ─── Locations for distance (CR-3c) ──────────────────────────────────────────

export const geocodeApi = {
  /** Looks up the report's buildings that have no location yet, a few at a time; `more` when some are left. */
  run: (reportId: string) => api<{ geocodes: GeocodeView[]; more: boolean }>('/api/comp-report/geocode', { method: 'POST', body: { reportId } }),
};

// ─── StreetEasy links, read in the background (CR-3b) ────────────────────────

export interface LinksState {
  reads: LinkReadView[];
  comps: WorkspaceData['comps'];
}

export interface LinksAdded extends LinksState {
  queued: string[];
  already: string[];
  refused: { url: string; reason: string }[];
  limit: { perDay: number; left: number };
}

export const linksApi = {
  load: (reportId: string) => api<LinksState>(`/api/comp-report/links?report=${reportId}`),
  add: (reportId: string, urls: string[], purpose: 'comp' | 'subject' = 'comp') =>
    api<LinksAdded>('/api/comp-report/links', { method: 'POST', body: { reportId, urls, purpose } }),
  dismiss: (reportId: string, readId: string) =>
    api<LinksState>('/api/comp-report/links', { method: 'PATCH', body: { reportId, readId, dismissed: true } }),
  confirmHome: (reportId: string, readId: string) =>
    api<LinksState>('/api/comp-report/links', { method: 'PATCH', body: { reportId, readId, confirmed: true } }),
  /**
   * Starts one read in the background function. Netlify answers 202 at once;
   * the row fills in as the read finishes, and polling picks it up.
   */
  start: async (reportId: string, readId: string): Promise<void> => {
    await fetch('/.netlify/functions/comp-report-links-background', {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({ reportId, readId }),
    }).catch(() => undefined); // a start that didn't reach it is started again by the poll
  },
};

// ─── The writer's drafts (CR-5) ──────────────────────────────────────────────


export interface EmailToLog {
  parentId: string | null;
  length: 'full' | 'short' | 'text';
  result: 'on_facts' | 'with_estimates';
  headline: string;
  subject: string;
  text: string;
}

export const narrativesApi = {
  load: (reportId: string) => api<{ narratives: Narrative[] }>(`/api/comp-report/narratives?report=${reportId}`),
  /** Queues a draft; `keep` is the agent's edited email, kept before the new draft replaces it. */
  write: (reportId: string, args: { length: EmailToLog['length']; result: EmailToLog['result']; keep?: Omit<EmailToLog, 'length' | 'result'> & { acknowledgments: Acknowledgment[] } }) =>
    api<{ narrative: Narrative; kept: Narrative | null }>('/api/comp-report/narratives', { method: 'POST', body: { reportId, action: 'write', ...args } }),
  /** Starts the queued draft in the background function; Netlify answers 202 at once, and polling picks it up. */
  start: async (reportId: string, narrativeId: string): Promise<void> => {
    await fetch('/.netlify/functions/comp-report-write-background', {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({ reportId, narrativeId }),
    }).catch(() => undefined); // a start that didn't reach it is started again by the poll
  },
  /** Logs what was copied, with QA's results and the agent's answers (§9.1). */
  copied: (reportId: string, email: EmailToLog, qa: unknown, acknowledgments: Acknowledgment[]) =>
    api<{ narrative: Narrative }>('/api/comp-report/narratives', { method: 'POST', body: { reportId, action: 'copy', ...email, qa, acknowledgments } }),
};

/** The agent's lines on Send (server/api/lines.ts): drafted from their notes, or tidied. Nothing is saved; Send offers them. */
export interface LinesOffer {
  lines: Partial<Record<'chosen' | 'consider' | 'nextStep', string>>;
  /** Lines that cited a figure the agent never gave: left as they were. */
  dropped: ('chosen' | 'consider' | 'nextStep')[];
}

export const linesApi = {
  ask: (reportId: string, job: 'draft' | 'rewrite', result: EmailToLog['result'], practice = false) =>
    api<LinesOffer>('/api/comp-report/lines', { method: 'POST', body: { reportId, job, result, ...(practice ? { practice } : {}) } }),
};

// ─── The client's words on Send (Dispatch 26) ────────────────────────────────

/** One round with Hubert on the overview or a comp's paragraph, as stored, and the workspace with it. */
export interface ClientWordsReply {
  workspace: WorkspaceData;
  round: ClientRound;
  /** Points or sentences that cited a figure the report doesn't hold: never shown. */
  dropped: number;
}

export const clientWordsApi = {
  /**
   * Feedback on the agent's saved overview or paragraph, or the writer's version of a comp's paragraph.
   * `practice` asks as a new agent (an admin viewing as one): the version waits for a feedback round.
   */
  ask: (reportId: string, target: string, job: 'feedback' | 'draft', opts: { result?: EmailToLog['result']; asks?: string; practice?: boolean } = {}) =>
    api<ClientWordsReply>('/api/comp-report/client-words', { method: 'POST', body: { reportId, target, job, ...opts } }),
  /**
   * The email's photos, copied into Casa's store for the client's mail to load (NB-3 B): each shown comp's
   * hero photo, and the home's. Paths on this site, by report comp id; missing where there's no photo.
   */
  photos: (reportId: string, reportCompIds: string[]) =>
    api<EmailPhotos>('/api/comp-report/email-photos', { method: 'POST', body: { reportId, reportCompIds } }),
};

export interface EmailPhotos {
  comps: Record<string, string>;
  home: string | null;
}

// ─── The per-comp review on Sort (Dispatch 25) ───────────────────────────────

/** One round with Hubert on one comp, as the server stored it, and the workspace with it. */
export interface ReviewReply {
  workspace: WorkspaceData;
  entry: ReviewEntry;
  /** Points or sentences that cited a figure the report doesn't hold: never shown. */
  dropped: number;
}

export const reviewApi = {
  /**
   * Feedback on the agent's saved note and tags, or Hubert's take on the comp. `practice` asks as a new
   * agent (an admin viewing as one): the take then waits for a feedback round, as it does for them.
   */
  ask: (reportId: string, reportCompId: string, job: 'feedback' | 'take', opts: { asks?: string; practice?: boolean } = {}) =>
    api<ReviewReply>('/api/comp-report/comp-review', { method: 'POST', body: { reportId, reportCompId, job, ...opts } }),
};

// ── The sign-in and activity logs, and agents' levels (Dispatch 22b): admins only ──

export type { AccessLine, ActivityLine } from '../server/api/access-log.ts';

export interface Person {
  email: string;
  name: string | null;
  role: Role;
  capability: 'practice' | 'full';
  lastSeenAt: string | null;
}
