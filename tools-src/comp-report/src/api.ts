// Calls to the comp report's functions. Same origin; the session token rides
// in the Authorization header on every request.
import type { NarrativeView as Narrative } from '../server/api/narratives.ts';
import type { LinkReadView, WorkspaceData } from '../server/api/workspace.ts';
import type { GeocodeView } from '../server/buildings.ts';
import type { Acknowledgment } from '../workspace/qa.ts';
import type { Brief, CallState, DealTermsState, Intake, ReasonType, SendState, TargetState, WorkspaceState } from '../workspace/state.ts';
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

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
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
  user: { email: string; name: string | null; role: Role; capability: 'practice' | 'full'; persisted: boolean };
  database: 'ready' | 'not_configured';
}

export interface Report {
  id: string;
  title: string;
  propertyType: 'condo' | 'coop';
  status: 'active' | 'archived';
  ownerEmail: string;
  /** Filled with sample data at some point (Dispatch 07). */
  sampleData: boolean;
  createdAt: string;
  updatedAt: string;
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

export type TurnEvent =
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
}

export const workspaceApi = {
  load: (reportId: string) => api<WorkspaceData>(`/api/comp-report/workspace?report=${reportId}`),
  save: (reportId: string, patch: WorkspacePatch) =>
    api<{ saved: true; updatedAt: string }>('/api/comp-report/workspace', { method: 'PATCH', body: { reportId, ...patch } }),
  importFile: (reportId: string, file: { filename: string; contentBase64: string; asOf: string }) =>
    api<WorkspaceData>('/api/comp-report/imports', { method: 'POST', body: { reportId, ...file } }),
  importSample: (reportId: string) => api<WorkspaceData>('/api/comp-report/imports', { method: 'POST', body: { reportId, sample: true } }),
  tier: (reportId: string, reportCompId: string, tier: string, reason: string, reasonType: ReasonType) =>
    api<WorkspaceData>('/api/comp-report/comps', { method: 'POST', body: { reportId, reportCompId, tier, reason, reasonType } }),
  mark: (reportId: string, reportCompId: string, change: { reviewed?: boolean; anchor?: boolean }) =>
    api<WorkspaceData>('/api/comp-report/comps', { method: 'PATCH', body: { reportId, reportCompId, ...change } }),
  sortSample: (reportId: string) => api<WorkspaceData>('/api/comp-report/comps', { method: 'POST', body: { reportId, sample: true } }),
  sample: () => api<SampleWalkthrough>('/api/comp-report/sample'),
  /** A comp read from its StreetEasy page, confirmed in one tap (§6.2). */
  confirm: (reportId: string, reportCompId: string) =>
    api<WorkspaceData>('/api/comp-report/comps', { method: 'PATCH', body: { reportId, reportCompId, confirmed: true } }),
  /** A comp typed in: address, status, price, size, floor, date. */
  addManual: (reportId: string, manual: Record<string, unknown>) =>
    api<WorkspaceData>('/api/comp-report/comps', { method: 'POST', body: { reportId, manual } }),
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
