// Everything the dev notebook keeps, in one Netlify Blobs store. This module is
// the only code that touches it (store.test.ts checks nothing else names it).
//
//   notes/<id>                  a note, written once and never changed
//   events/<id>/<ts>.<r>.<kind> one per status change or comment: the status
//                               history is append-only by construction, and
//                               concurrent writers can't lose each other's
//                               entries (Blobs has no conditional writes)
//   shots/<id>/<shotId>         a screenshot, with its type in the metadata
//   sessions/<sid>              a signed-in browser: a hash, never the token
//   keys/<kid>                  a key a Claude Code session reads with: a hash
//
// The status is the latest status event's, read from the event keys alone
// (<kind> is the status, `resolved-<pr>`, or `comment`), so listing needs one
// list call over events, not a read of each.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  clip, isStatus, MAX_BODY, MAX_CONTEXT_BYTES, normalizeTags, pickParams, routeOrNull, statusRequirement, surfaceFor,
  viewportOrNull, type Status, type Tag,
} from '../vocab.ts';

/** The part of @netlify/blobs' Store this module uses; the tests run it against Blobs' own local server. */
export interface BlobStore {
  get(key: string, opts: { type: 'json' }): Promise<unknown>;
  getWithMetadata(key: string, opts: { type: 'arrayBuffer' }): Promise<{ data: ArrayBuffer; metadata: Record<string, unknown> } | null>;
  getMetadata(key: string): Promise<{ metadata: Record<string, unknown> } | null>;
  set(key: string, data: ArrayBuffer, opts?: { metadata?: Record<string, unknown> }): Promise<void>;
  setJSON(key: string, data: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts: { prefix: string }): Promise<{ blobs: { key: string }[] }>;
}

export const STORE_NAME = 'dev-notebook';

export class NotebookError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface NoteRecord {
  id: string;
  body: string;
  tags: Tag[];
  author: string;
  createdAt: string;
  route: string | null;
  params: Record<string, string>;
  surface: string;
  title: string | null;
  /** What the page published about its state (the comp report: the report and step on screen). Plain values, never links. */
  context: Record<string, unknown>;
  viewport: string | null;
  userAgent: string | null;
  commit: string | null;
  deployId: string | null;
}

export interface EventRecord {
  at: string;
  by: string;
  /** How it was written: the notebook in a browser, or a Claude Code session's key (by its label). */
  via: string;
  status?: Status;
  note?: string;
  pr?: number;
}

export interface ShotInfo {
  id: string;
  type: string;
  bytes: number;
}

export interface NoteSummary extends NoteRecord {
  status: Status;
  statusAt: string;
  resolvedPr: number | null;
  events: number;
}

export interface NoteView extends NoteSummary {
  log: EventRecord[];
  shots: ShotInfo[];
}

export interface Clock {
  now(): number;
  random(bytes: number): Buffer;
}

export const systemClock: Clock = { now: () => Date.now(), random: (n) => randomBytes(n) };

const NOTE_ID = /^dn_[0-9a-z]{12}$/;
const SHOT_ID = /^sh_[0-9a-z]{10}$/;
const SHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const MAX_SHOT_BYTES = 5 * 1024 * 1024;
export const MAX_SHOTS = 8;
export const MAX_EVENT_NOTE = 4000;
export const SESSION_DAYS = 30;
/** Making a key needs a sign-in this recent: a key outlives the session that made it. */
export const FRESH_SIGN_IN_MS = 15 * 60_000;

const base36 = (bytes: Buffer, length: number) =>
  [...bytes].map((b) => (b % 36).toString(36)).join('').slice(0, length).padEnd(length, '0');

/** "20260929T193012345Z": sorts as time does. */
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:.]/g, '');

const sha256 = (s: string) => createHash('sha256').update(s).digest();

/** Constant-time: the secret's hash against the stored one. */
function sameHash(secret: string, storedHex: unknown): boolean {
  const stored = typeof storedHex === 'string' && /^[0-9a-f]{64}$/.test(storedHex) ? Buffer.from(storedHex, 'hex') : null;
  return Boolean(stored) && timingSafeEqual(sha256(secret), stored!);
}

export function isNoteId(id: unknown): id is string {
  return typeof id === 'string' && NOTE_ID.test(id);
}

/** A screenshot is what its bytes say it is, not what the browser claimed. */
export function sniffImage(bytes: Uint8Array): (typeof SHOT_TYPES)[number] | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

/** What a page may publish about its state: small, flat-ish, no functions. Oversized context is dropped, not truncated into nonsense. */
function contextOrEmpty(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  let text: string;
  try {
    text = JSON.stringify(raw);
  } catch {
    return {};
  }
  if (new TextEncoder().encode(text).length > MAX_CONTEXT_BYTES) return { dropped: 'context was over 4 KB' };
  return JSON.parse(text) as Record<string, unknown>;
}

interface StatusIndex {
  status: Status;
  statusAt: string;
  pr: number | null;
  events: number;
}

function parseEventKey(key: string): { noteId: string; ts: string; order: string; kind: string } | null {
  const m = /^events\/(dn_[0-9a-z]{12})\/(\d{8}T\d{9}Z)\.([0-9a-z]{6})\.([a-z]+(?:-\d+)?)$/.exec(key);
  return m ? { noteId: m[1]!, ts: m[2]!, order: `${m[2]}.${m[3]}`, kind: m[4]! } : null;
}

const fromStamp = (ts: string) =>
  `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}.${ts.slice(15, 18)}Z`;

export function notebookStore(blobs: BlobStore, clock: Clock = systemClock) {
  const newId = (prefix: string, length: number) => `${prefix}${base36(clock.random(length), length)}`;

  async function statusIndex(): Promise<Map<string, StatusIndex>> {
    const index = new Map<string, StatusIndex & { order: string }>();
    for (const { key } of (await blobs.list({ prefix: 'events/' })).blobs) {
      const e = parseEventKey(key);
      if (!e) continue;
      const cur = index.get(e.noteId) ?? { status: 'open' as Status, statusAt: '', pr: null, events: 0, order: '' };
      cur.events++;
      const [kind, pr] = e.kind.split('-');
      if (kind !== 'comment' && isStatus(kind) && e.order > cur.order) {
        cur.order = e.order;
        cur.status = kind;
        cur.statusAt = fromStamp(e.ts);
        cur.pr = pr ? Number(pr) : null;
      }
      index.set(e.noteId, cur);
    }
    return index;
  }

  async function readNote(id: string): Promise<NoteRecord | null> {
    if (!isNoteId(id)) return null;
    return ((await blobs.get(`notes/${id}`, { type: 'json' })) as NoteRecord | null) ?? null;
  }

  function summary(note: NoteRecord, s: StatusIndex | undefined): NoteSummary {
    return {
      ...note,
      status: s?.status ?? 'open',
      statusAt: s?.statusAt || note.createdAt,
      resolvedPr: s?.status === 'resolved' ? s.pr : null,
      events: s?.events ?? 0,
    };
  }

  /**
   * An event sorts after every earlier one for its note: stamped at least a
   * millisecond after the newest, so two changes made in the same millisecond
   * still read back in the order they were made. Truly simultaneous writers
   * both land, in either order.
   */
  async function writeEvent(noteId: string, event: Omit<EventRecord, 'at'>): Promise<EventRecord> {
    let at = clock.now();
    for (const { key } of (await blobs.list({ prefix: `events/${noteId}/` })).blobs) {
      const e = parseEventKey(key);
      if (e) at = Math.max(at, Date.parse(fromStamp(e.ts)) + 1);
    }
    const written: EventRecord = { at: new Date(at).toISOString(), ...event };
    const kind = event.status ? (event.status === 'resolved' && event.pr ? `resolved-${event.pr}` : event.status) : 'comment';
    await blobs.setJSON(`events/${noteId}/${stamp(at)}.${base36(clock.random(6), 6)}.${kind}`, written);
    return written;
  }

  async function getNote(id: string): Promise<NoteView> {
    const note = await readNote(id);
    if (!note) throw new NotebookError(404, 'not_found', 'No such note.');
    const eventKeys = (await blobs.list({ prefix: `events/${id}/` })).blobs.map((b) => b.key).sort();
    const log = (await Promise.all(eventKeys.map((k) => blobs.get(k, { type: 'json' }) as Promise<EventRecord | null>)))
      .filter((e): e is EventRecord => Boolean(e));
    const shotKeys = (await blobs.list({ prefix: `shots/${id}/` })).blobs.map((b) => b.key).sort();
    const shots = (await Promise.all(shotKeys.map(async (k) => {
      const meta = (await blobs.getMetadata(k))?.metadata ?? {};
      return { id: k.slice(`shots/${id}/`.length), type: String(meta.type ?? 'application/octet-stream'), bytes: Number(meta.bytes ?? 0) };
    })));
    let current: StatusIndex = { status: 'open', statusAt: note.createdAt, pr: null, events: log.length };
    for (const e of log) if (e.status) current = { status: e.status, statusAt: e.at, pr: e.pr ?? null, events: log.length };
    return { ...summary(note, current), log, shots };
  }

  return {
    async create(input: {
      body: unknown; tags?: unknown; route?: unknown; params?: unknown; title?: unknown; context?: unknown; viewport?: unknown;
    }, stamped: { author: string; userAgent: string | null; commit: string | null; deployId: string | null }): Promise<NoteView> {
      const body = typeof input.body === 'string' ? input.body.trim() : '';
      if (!body) throw new NotebookError(400, 'no_body', 'Write something first.');
      if (body.length > MAX_BODY) throw new NotebookError(413, 'too_long', `Keep a note under ${MAX_BODY} characters.`);
      const now = clock.now();
      const route = routeOrNull(input.route);
      const params = pickParams(input.params);
      // The id sorts by time: newest first is a sort of the keys.
      const id = `dn_${now.toString(36).padStart(8, '0').slice(-8)}${base36(clock.random(4), 4)}`;
      const note: NoteRecord = {
        id,
        body,
        tags: normalizeTags(input.tags),
        author: stamped.author,
        createdAt: new Date(now).toISOString(),
        route,
        params,
        surface: surfaceFor(route, params),
        title: clip(input.title),
        context: contextOrEmpty(input.context),
        viewport: viewportOrNull(input.viewport),
        userAgent: clip(stamped.userAgent, 300),
        commit: stamped.commit,
        deployId: stamped.deployId,
      };
      await blobs.setJSON(`notes/${id}`, note);
      const first = await writeEvent(id, { by: stamped.author, via: 'capture', status: 'open', note: 'captured' });
      return { ...summary(note, { status: 'open', statusAt: note.createdAt, pr: null, events: 1 }), log: [first], shots: [] };
    },

    async list(filter: { status?: string; tag?: string; surface?: string; limit?: number } = {}): Promise<{ notes: NoteSummary[]; open: NoteSummary[] }> {
      const wanted = filter.status ?? 'open';
      if (wanted !== 'all' && wanted !== 'active' && !isStatus(wanted)) throw new NotebookError(400, 'bad_status', `Unknown status "${wanted}".`);
      const limit = Math.min(Math.max(1, Math.floor(filter.limit ?? 100)), 500);
      const index = await statusIndex();
      const ids = (await blobs.list({ prefix: 'notes/' })).blobs
        .map((b) => b.key.slice('notes/'.length))
        .filter(isNoteId)
        .sort()
        .reverse();
      const statusOf = (id: string) => index.get(id)?.status ?? 'open';
      const matches = (id: string) =>
        wanted === 'all' || statusOf(id) === wanted || (wanted === 'active' && (statusOf(id) === 'open' || statusOf(id) === 'read'));
      // Open notes are always read too: the CLI's first line counts them whatever the filter.
      const needed = [...new Set([...ids.filter(matches), ...ids.filter((id) => statusOf(id) === 'open')])];
      const records = new Map<string, NoteRecord>();
      for (let i = 0; i < needed.length; i += 8) {
        const batch = await Promise.all(needed.slice(i, i + 8).map(readNote));
        for (const n of batch) if (n) records.set(n.id, n);
      }
      const all = ids.flatMap((id) => (records.has(id) ? [summary(records.get(id)!, index.get(id))] : []));
      const notes = all
        .filter((n) => matches(n.id))
        .filter((n) => !filter.tag || n.tags.includes(filter.tag as Tag))
        .filter((n) => !filter.surface || n.surface === filter.surface || n.surface.startsWith(`${filter.surface}/`))
        .slice(0, limit);
      return { notes, open: all.filter((n) => n.status === 'open') };
    },

    get: getNote,

    /** A status change, a comment, or both. Resolved needs its PR; closing any other way needs a why. */
    async record(id: string, change: { status?: unknown; note?: unknown; pr?: unknown }, who: { by: string; via: string }): Promise<NoteView> {
      if (!(await readNote(id))) throw new NotebookError(404, 'not_found', 'No such note.');
      const status = change.status === undefined || change.status === null || change.status === '' ? undefined : change.status;
      if (status !== undefined && !isStatus(status)) throw new NotebookError(400, 'bad_status', `Unknown status "${String(status)}".`);
      const note = typeof change.note === 'string' && change.note.trim() ? change.note.trim() : undefined;
      if (note && note.length > MAX_EVENT_NOTE) throw new NotebookError(413, 'too_long', `Keep a note under ${MAX_EVENT_NOTE} characters.`);
      const prRaw = change.pr === undefined || change.pr === null || change.pr === '' ? undefined : Number(change.pr);
      if (prRaw !== undefined && !(Number.isInteger(prRaw) && prRaw > 0 && prRaw < 1_000_000)) {
        throw new NotebookError(400, 'bad_pr', 'A PR is its number, like 53.');
      }
      if (!status && !note) throw new NotebookError(400, 'nothing_to_record', 'Give a status, a note, or both.');
      if (status) {
        const needs = statusRequirement(status);
        if (needs === 'pr' && prRaw === undefined) throw new NotebookError(400, 'pr_required', 'Resolved needs the PR that fixed it.');
        if (needs === 'note' && !note) throw new NotebookError(400, 'note_required', `Say why it's ${status}.`);
      }
      if (prRaw !== undefined && status !== 'resolved') throw new NotebookError(400, 'pr_without_resolved', 'A PR goes with resolved.');
      await writeEvent(id, {
        by: who.by,
        via: who.via,
        ...(status ? { status } : {}),
        ...(note ? { note } : {}),
        ...(prRaw !== undefined ? { pr: prRaw } : {}),
      });
      return getNote(id);
    },

    /** The notebook page only: the screenshots first, so none are ever left behind, then the history, then the note. */
    async remove(id: string): Promise<void> {
      if (!(await readNote(id))) throw new NotebookError(404, 'not_found', 'No such note.');
      for (const { key } of (await blobs.list({ prefix: `shots/${id}/` })).blobs) await blobs.delete(key);
      for (const { key } of (await blobs.list({ prefix: `events/${id}/` })).blobs) await blobs.delete(key);
      await blobs.delete(`notes/${id}`);
    },

    async addShot(id: string, bytes: Uint8Array): Promise<ShotInfo> {
      if (!(await readNote(id))) throw new NotebookError(404, 'not_found', 'No such note.');
      if (!bytes.length) throw new NotebookError(400, 'empty', 'That image is empty.');
      if (bytes.length > MAX_SHOT_BYTES) throw new NotebookError(413, 'too_large', 'Screenshots are 5 MB at most.');
      const type = sniffImage(bytes);
      if (!type) throw new NotebookError(415, 'not_an_image', 'Screenshots are PNG, JPEG, WebP or GIF.');
      const existing = (await blobs.list({ prefix: `shots/${id}/` })).blobs.length;
      if (existing >= MAX_SHOTS) throw new NotebookError(409, 'too_many', `A note holds ${MAX_SHOTS} screenshots at most.`);
      const shotId = newId('sh_', 10);
      const copy = new Uint8Array(bytes.length);
      copy.set(bytes);
      await blobs.set(`shots/${id}/${shotId}`, copy.buffer, { metadata: { type, bytes: bytes.length, createdAt: new Date(clock.now()).toISOString() } });
      return { id: shotId, type, bytes: bytes.length };
    },

    async getShot(id: string, shotId: string): Promise<{ data: ArrayBuffer; type: string } | null> {
      if (!isNoteId(id) || !SHOT_ID.test(shotId)) return null;
      const hit = await blobs.getWithMetadata(`shots/${id}/${shotId}`, { type: 'arrayBuffer' });
      if (!hit) return null;
      const type = String(hit.metadata.type ?? '');
      return (SHOT_TYPES as readonly string[]).includes(type) ? { data: hit.data, type } : null;
    },

    // ── Who may use it ────────────────────────────────────────────────────────

    /** A signed-in browser. The token is shown once; only its hash is kept. */
    async createSession(email: string, userAgent: string | null): Promise<{ token: string; expiresAt: string }> {
      const sid = newId('', 12);
      const secret = clock.random(32).toString('base64url');
      const expiresAt = new Date(clock.now() + SESSION_DAYS * 86_400_000).toISOString();
      await blobs.setJSON(`sessions/${sid}`, {
        hash: sha256(secret).toString('hex'), email, createdAt: new Date(clock.now()).toISOString(), expiresAt, userAgent: clip(userAgent, 300),
      });
      return { token: `dns_${sid}.${secret}`, expiresAt };
    },

    async verifySession(token: string): Promise<{ sid: string; email: string; signedInAt: number } | null> {
      const m = /^dns_([0-9a-z]{12})\.([A-Za-z0-9_-]{43})$/.exec(token);
      if (!m) return null;
      const s = (await blobs.get(`sessions/${m[1]}`, { type: 'json' })) as { hash: string; email: string; createdAt: string; expiresAt: string } | null;
      if (!s || Date.parse(s.expiresAt) <= clock.now()) return null;
      return sameHash(m[2]!, s.hash) ? { sid: m[1]!, email: s.email, signedInAt: Date.parse(s.createdAt) } : null;
    },

    async endSession(sid: string): Promise<void> {
      await blobs.delete(`sessions/${sid}`);
    },

    async endAllSessions(): Promise<number> {
      const keys = (await blobs.list({ prefix: 'sessions/' })).blobs;
      for (const { key } of keys) await blobs.delete(key);
      return keys.length;
    },

    /** A key for Claude Code sessions: read, re-status and comment. Never create or delete. */
    async createKey(label: string, createdBy: string): Promise<{ id: string; token: string; label: string }> {
      const clean = clip(label, 40);
      if (!clean || !/^[\w .-]+$/.test(clean)) throw new NotebookError(400, 'bad_label', 'Name the key: letters, numbers, spaces, dots or dashes.');
      const kid = newId('', 12);
      const secret = clock.random(32).toString('base64url');
      await blobs.setJSON(`keys/${kid}`, { hash: sha256(secret).toString('hex'), label: clean, createdAt: new Date(clock.now()).toISOString(), createdBy });
      return { id: kid, token: `dnk_${kid}.${secret}`, label: clean };
    },

    async listKeys(): Promise<{ id: string; label: string; createdAt: string; createdBy: string }[]> {
      const keys = (await blobs.list({ prefix: 'keys/' })).blobs.map((b) => b.key);
      const rows = await Promise.all(keys.map(async (k) => {
        const v = (await blobs.get(k, { type: 'json' })) as { label: string; createdAt: string; createdBy: string } | null;
        return v ? { id: k.slice('keys/'.length), label: v.label, createdAt: v.createdAt, createdBy: v.createdBy } : null;
      }));
      return rows.filter((r): r is NonNullable<typeof r> => Boolean(r)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async verifyKey(token: string): Promise<{ id: string; label: string } | null> {
      const m = /^dnk_([0-9a-z]{12})\.([A-Za-z0-9_-]{43})$/.exec(token);
      if (!m) return null;
      const k = (await blobs.get(`keys/${m[1]}`, { type: 'json' })) as { hash: string; label: string } | null;
      if (!k) return null;
      return sameHash(m[2]!, k.hash) ? { id: m[1]!, label: k.label } : null;
    },

    async revokeKey(kid: string): Promise<void> {
      if (!/^[0-9a-z]{12}$/.test(kid)) throw new NotebookError(404, 'not_found', 'No such key.');
      await blobs.delete(`keys/${kid}`);
    },
  };
}

export type NotebookStore = ReturnType<typeof notebookStore>;
