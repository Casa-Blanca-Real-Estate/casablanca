// Calls to the comp report's functions. Same origin; the session token rides
// in the Authorization header on every request.
import type { WorkspaceData } from '../server/api/workspace.ts';
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

export type { WorkspaceData, WorkspaceImport } from '../server/api/workspace.ts';

export interface SampleWalkthrough {
  intake: Intake;
  brief: Brief;
  target: TargetState;
  dealTerms: DealTermsState;
  call: Omit<CallState, 'at'>;
  send: SendState;
}

export interface WorkspacePatch {
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
};
