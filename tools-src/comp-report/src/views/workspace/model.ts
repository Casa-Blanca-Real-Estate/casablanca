// What every step of the walkthrough is handed: the report as the server has
// it, what the agent has entered (saved as they go), and the engine's output,
// recomputed in the browser whenever any of it changes (Dispatch 07).
import type { EngineOutput } from '../../../engine/index.ts';
import type { LinkReadView, LinksState, WorkspaceData } from '../../api.ts';
import type { ParsedImport, WorkspaceComp } from '../../../workspace/engine-input.ts';
import type {
  Brief, CallState, DealTermsState, Entry, Intake, SendState, TargetState,
} from '../../../workspace/state.ts';
import type { StartScreen } from '../newcomp/NewComp.tsx';
import type { StepId } from './About.tsx';

export interface Workspace {
  reportId: string;
  report: WorkspaceData['report'];
  /** The analysis date: today, in the agent's time zone. The engine has no clock. */
  today: string;
  /** Another agent's report, open to an admin: everything shows, nothing changes. */
  readOnly: boolean;
  /** Admins see the sample buttons (Dispatch 07); never on someone else's report. */
  canSample: boolean;
  agentName: string;

  brief: Brief;
  setBrief: (next: Brief) => void;
  intake: Intake;
  setIntake: (next: Intake) => void;
  target: TargetState | null;
  setTarget: (next: TargetState | null) => void;
  dealTerms: DealTermsState | null;
  setDealTerms: (next: DealTermsState | null) => void;
  call: CallState | null;
  setCall: (next: CallState | null) => void;
  send: SendState;
  setSend: (next: SendState) => void;

  imports: WorkspaceData['imports'];
  parsed: ParsedImport[];
  /** Stored imports the browser couldn't read, by import id. */
  unreadable: Record<string, string>;
  comps: WorkspaceComp[];
  /** After an import, a tier or a mark: the server returns the whole workspace. */
  applyServer: (data: WorkspaceData) => void;
  /** StreetEasy links read in the background: the home's and the comps' (Dispatch 09). */
  reads: LinkReadView[];
  /** After a link is added, cleared or confirmed, and on each poll while reads are in flight. */
  applyLinks: (next: LinksState) => void;
  /** Opens the new-comp modal on one of its screens: the home, its details, or adding comps. */
  openStart: (screen: StartScreen) => void;

  output: EngineOutput | null;
  engineError: string | null;
  /** The call is given or skipped, so the range shows (§3.1). */
  revealed: boolean;

  /** Runs a server call with the busy flag and the error line. */
  run: (label: string, work: () => Promise<void>) => Promise<void>;
  busy: string | null;
  fillSample: (step: StepId | 'all') => Promise<void>;
  go: (step: StepId) => void;
  messageCount: number;
  setMessageCount: (n: number) => void;
}

export interface StepProps {
  ws: Workspace;
}

/** True when any value in a set of entries is a sample. */
export function anySample(values: (Entry<unknown> | undefined | null)[]): boolean {
  return values.some((v) => v?.sample);
}

export function hasAny(o: object | null | undefined): boolean {
  return Boolean(o) && Object.values(o as Record<string, unknown>).some((v) => v !== undefined && v !== null);
}

/** Today as YYYY-MM-DD in the browser's time zone. */
export function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** A short fingerprint of a text (FNV-1a), to tell when a template has changed under an edited draft. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** "25 North Moore Street, #9C" → address and unit, to seed the subject from the report title. */
export function splitTitle(title: string): { address: string; unit: string | null } | null {
  const t = title.trim();
  if (!t) return null;
  const m = /^(.*?)[,\s]+((?:#|apt\.?\s*|unit\s+|ph\s*)[\w-]+)\s*$/i.exec(t);
  if (m && m[1]) return { address: m[1].replace(/[,\s]+$/, ''), unit: m[2]!.trim() };
  return { address: t, unit: null };
}
