// The photo side of an agent's record in the `cb-agents` store (Dispatch 12).
//
// netlify/functions/agent-store.mjs owns the record: its `draft` (what the agent
// CMS edits), its `live` snapshot (what the agent-site build renders), its site
// status and its timestamps. This module owns two groups beside them, at the
// record's top level:
//
//   pic         the photo: whether an original is in Drive, when the set was
//               last generated, notes, and (phase 2) the files stored for it:
//               originals and the ten generated outputs. The bytes live in their
//               own store (files.ts); the record keeps what they are. Phase 3
//               adds the signature photo; its place is reserved here.
//   placements  the five places a photo goes (docs/dispatch/12 §3), each
//               todo / done / na, stamped when it flips
//
// They sit outside `draft` and `live` on purpose. Publishing copies draft over
// live, so nothing outside them can be published, and the CMS preview link
// shows `draft` only. CB_PICS_TOKEN writes these two groups and nothing else.
//
// The status is derived, never stored: none → raw → generated → deployed.

export const AGENTS_STORE = 'cb-agents';
export const INDEX_KEY = '_index';

export const PLACEMENTS = ['gmailSig', 'gmailAvatar', 'filemaker', 'streeteasy', 'businessCard'] as const;
export type PlacementKey = (typeof PLACEMENTS)[number];

export const PLACEMENT_LABELS: Record<PlacementKey, string> = {
  gmailSig: 'Gmail signature',
  gmailAvatar: 'Gmail profile pic',
  filemaker: 'FileMaker profile pic',
  streeteasy: 'StreetEasy profile',
  businessCard: 'Business card',
};

export const PLACEMENT_STATES = ['todo', 'done', 'na'] as const;
export type PlacementState = (typeof PLACEMENT_STATES)[number];

/** How a placement reads today: `stale` is done, but before the latest photo was generated. */
export type PlacementView = PlacementState | 'stale';

export interface Placement {
  state: PlacementState;
  /** When the state last changed (ISO), stamped by the server. */
  at: string;
  note: string;
}
export type Placements = Record<PlacementKey, Placement>;

/** The ten generated variants, by the id the generator names its files with (and Drive files them under). */
export const VARIANTS = [
  'R1_Logo', 'R2_Logo', 'R3_Blank', 'R4_Clean',
  'SQ1_GrayLogo', 'SQ2_Clean', 'SQ3_Name', 'SQ4_ColorName', 'SQ5_ColorClean', 'SQ6_ColorLogo',
] as const;
export type Variant = (typeof VARIANTS)[number];

/**
 * What a stored file is (docs/dispatch/12 §5.5):
 *   archive  a camera original (NEF). No browser decodes it: stored, listed, downloaded, never previewed.
 *   working  a JPEG or PNG original: what the cutout re-runs against.
 *   output   one of the ten generated variants.
 */
export const FILE_KINDS = ['archive', 'working', 'output'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/** A file whose bytes are in the files store, in `parts` pieces. Written by the server only. */
export interface StoredFile {
  key: string;
  kind: FileKind;
  filename: string;
  type: string;
  bytes: number;
  parts: number;
  uploadedAt: string;
  /** When the photo was taken, from its EXIF, or ''. */
  capturedAt: string;
  width: number | null;
  height: number | null;
  /** Outputs only. */
  variant: string;
}
/** A stored original: an archive or a working file. */
export type RawFile = StoredFile;

export interface Pic {
  /** An original exists in Drive's `@ Profile Pic RAWS`. Until phase 2 stores raws, this is how "raw" is known. */
  rawInDrive: boolean;
  /** When the current set was generated (ISO), or ''. */
  generatedAt: string;
  /** Server-managed (phase 2): the stored originals, archives and working files. */
  raws: RawFile[];
  /** The working file the cutout re-runs against, or ''. Settable, to one of `raws`' working files. */
  workingKey: string;
  /** Server-managed (phase 2): the stored outputs, at most one per variant. */
  outputs: StoredFile[];
  /** Derived from `outputs`: the variant ids stored, round and square. */
  variants: { round: string[]; square: string[] };
  /** Server-managed (phase 3): the 180×180 for the email signature. */
  sigPhotoKey: string;
  notes: string;
  updatedAt: string;
  /** Advisory: self-reported by the browser, like agent-store's updatedBy. */
  updatedBy: string;
}

export const PIC_STATUSES = ['none', 'raw', 'generated', 'deployed'] as const;
export type PicStatus = (typeof PIC_STATUSES)[number];

/** The fields a CB_PICS_TOKEN write may set. Everything else in `pic` is the server's. */
export const WRITABLE_PIC = ['rawInDrive', 'generatedAt', 'notes', 'workingKey'] as const;
export const WRITABLE_PLACEMENT = ['state', 'note'] as const;

export const MAX_NOTES = 2000;
export const MAX_PLACEMENT_NOTE = 300;

/** The agent store's record, as far as this module reads it. */
export interface AgentRecord {
  slug: string;
  status?: string;
  draft?: { identity?: { name?: string; displayName?: string; title?: string; licenseNumber?: string } } | null;
  live?: { identity?: { name?: string; title?: string } } | null;
  pic?: unknown;
  placements?: unknown;
  [key: string]: unknown;
}

export class PicsError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* ───────────────────────────── cleaning ─────────────────────────────
   Same rules as agent-store.mjs: C0/C1 controls and angle brackets out. */

export const clean = (v: unknown, max: number): string =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max);

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const time = (iso: string): number => (iso ? Date.parse(iso) : NaN);

/** An ISO timestamp, or '' when the value isn't one. Stored data only — writes go through `parseDate`. */
function storedDate(v: unknown): string {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}

const EARLIEST = Date.parse('2015-01-01T00:00:00Z');

/** A write's date: '' clears it; `YYYY-MM-DD` or an ISO timestamp, not before 2015 and not in the future. */
export function parseDate(v: unknown, now: number, field: string): string {
  if (v === '' || v === null) return '';
  const s = typeof v === 'string' ? v.trim() : '';
  const t = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(s) ? Date.parse(s) : NaN;
  if (!Number.isFinite(t)) throw new PicsError(400, 'bad-date', `${field} must be a date (YYYY-MM-DD) or empty`);
  if (t < EARLIEST || t > now + 36 * 3600_000) throw new PicsError(400, 'bad-date', `${field} is out of range`);
  return new Date(t).toISOString();
}

const count = (n: unknown) => (Number.isInteger(n) && (n as number) >= 0 ? (n as number) : 0);
const dim = (n: unknown) => (Number.isInteger(n) && (n as number) > 0 ? (n as number) : null);

function cleanFile(v: unknown, kinds: readonly FileKind[]): StoredFile | null {
  if (!isObject(v)) return null;
  const key = clean(v.key, 200);
  if (!key) return null;
  // A phase-1 raw had no kind; an original is a working file unless it says otherwise.
  const kind = kinds.includes(v.kind as FileKind) ? (v.kind as FileKind) : kinds[kinds.length - 1]!;
  return {
    key,
    kind,
    filename: clean(v.filename, 200),
    type: clean(v.type, 100),
    bytes: count(v.bytes),
    parts: count(v.parts),
    uploadedAt: storedDate(v.uploadedAt),
    capturedAt: storedDate(v.capturedAt),
    width: dim(v.width),
    height: dim(v.height),
    variant: kind === 'output' ? clean(v.variant, 40) : '',
  };
}

export const MAX_RAWS = 50;

/** The record's `pic` group, whole and well-formed whatever is stored (a record the CMS made has none). */
export function readPic(v: unknown): Pic {
  const p = isObject(v) ? v : {};
  const raws = (Array.isArray(p.raws) ? p.raws : []).map((r) => cleanFile(r, ['archive', 'working']))
    .filter((r): r is RawFile => r !== null).slice(0, MAX_RAWS);
  const outputs = (Array.isArray(p.outputs) ? p.outputs : []).map((r) => cleanFile(r, ['output']))
    .filter((r): r is StoredFile => r !== null && VARIANTS.includes(r.variant as Variant)).slice(0, VARIANTS.length);
  const workingKey = clean(p.workingKey, 200);
  return {
    rawInDrive: p.rawInDrive === true,
    generatedAt: storedDate(p.generatedAt),
    raws,
    // Only ever one of the working files; a stale key reads as none.
    workingKey: raws.some((r) => r.key === workingKey && r.kind === 'working') ? workingKey : '',
    outputs,
    variants: {
      round: outputs.filter((o) => o.variant.startsWith('R')).map((o) => o.variant),
      square: outputs.filter((o) => o.variant.startsWith('SQ')).map((o) => o.variant),
    },
    sigPhotoKey: clean(p.sigPhotoKey, 200),
    notes: clean(p.notes, MAX_NOTES),
    updatedAt: storedDate(p.updatedAt),
    updatedBy: clean(p.updatedBy, 120),
  };
}

/** The record's `placements`, all five present, each well-formed. */
export function readPlacements(v: unknown): Placements {
  const src = isObject(v) ? v : {};
  const out = {} as Placements;
  for (const key of PLACEMENTS) {
    const p = isObject(src[key]) ? src[key] : {};
    const state = PLACEMENT_STATES.includes(p.state as PlacementState) ? (p.state as PlacementState) : 'todo';
    out[key] = { state, at: storedDate(p.at), note: clean(p.note, MAX_PLACEMENT_NOTE) };
  }
  return out;
}

/* ───────────────────────────── status ───────────────────────────── */

/** A placement is resolved when it doesn't apply, or was done after the current photo was generated. */
export function placementView(p: Placement, generatedAt: string): PlacementView {
  if (p.state !== 'done' || !generatedAt) return p.state;
  return time(p.at) >= time(generatedAt) ? 'done' : 'stale';
}

const resolved = (v: PlacementView) => v === 'done' || v === 'na';

/** When an original's photo is from: taken, if its EXIF said, or else when it was stored. */
export const photoTime = (r: RawFile): number => time(r.capturedAt || r.uploadedAt);

/**
 * none → raw → generated → deployed. A working photo newer than the last
 * generate puts the agent back at `raw`; a placement done before it doesn't
 * count. "Newer" goes by when the photo was taken, when its EXIF says, so
 * storing last year's originals doesn't undo a photo that's out there. An
 * archive never does: it's kept, not cut out.
 */
export function picStatus(pic: Pic, placements: Placements): PicStatus {
  const latestRaw = Math.max(-Infinity, ...pic.raws.filter((r) => r.kind === 'working').map(photoTime).filter(Number.isFinite));
  const generated = time(pic.generatedAt);
  if (Number.isFinite(generated) && !(latestRaw > generated)) {
    return PLACEMENTS.every((k) => resolved(placementView(placements[k], pic.generatedAt))) ? 'deployed' : 'generated';
  }
  return pic.raws.length > 0 || pic.rawInDrive ? 'raw' : 'none';
}

/* ───────────────────────────── writes ───────────────────────────── */

export interface Patch {
  pic?: unknown;
  placements?: unknown;
}

function refuseUnknown(obj: Record<string, unknown>, allowed: readonly string[], where: string): void {
  const extra = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (extra.length) {
    throw new PicsError(400, 'not-writable', `${where} can't set ${extra.join(', ')}. This token writes ${allowed.join(', ')} only.`);
  }
}

/**
 * Apply a write to the photo groups. Only the fields in WRITABLE_PIC and
 * WRITABLE_PLACEMENT can change, and anything else is refused rather than
 * dropped, so a caller never thinks it set something it didn't.
 */
export function applyPatch(record: AgentRecord, patch: Patch, now: number, by: string): { pic: Pic; placements: Placements } {
  const pic = readPic(record.pic);
  const placements = readPlacements(record.placements);
  const stamp = new Date(now).toISOString();

  if (patch.pic !== undefined) {
    if (!isObject(patch.pic)) throw new PicsError(400, 'bad-request', 'pic must be an object');
    refuseUnknown(patch.pic, WRITABLE_PIC, 'pic');
    const p = patch.pic;
    if ('rawInDrive' in p) {
      if (typeof p.rawInDrive !== 'boolean') throw new PicsError(400, 'bad-request', 'pic.rawInDrive must be true or false');
      pic.rawInDrive = p.rawInDrive;
    }
    if ('generatedAt' in p) pic.generatedAt = parseDate(p.generatedAt, now, 'pic.generatedAt');
    if ('notes' in p) pic.notes = clean(p.notes, MAX_NOTES);
    if ('workingKey' in p) {
      const key = typeof p.workingKey === 'string' ? p.workingKey : null;
      if (key === null || (key && !pic.raws.some((r) => r.key === key && r.kind === 'working'))) {
        throw new PicsError(400, 'bad-request', 'pic.workingKey must be one of this agent’s stored JPEG or PNG originals, or empty');
      }
      pic.workingKey = key;
    }
  }

  if (patch.placements !== undefined) {
    if (!isObject(patch.placements)) throw new PicsError(400, 'bad-request', 'placements must be an object');
    refuseUnknown(patch.placements, PLACEMENTS, 'placements');
    for (const [key, value] of Object.entries(patch.placements)) {
      if (!isObject(value)) throw new PicsError(400, 'bad-request', `placements.${key} must be an object`);
      refuseUnknown(value, WRITABLE_PLACEMENT, `placements.${key}`);
      const current = placements[key as PlacementKey];
      if ('state' in value) {
        if (!PLACEMENT_STATES.includes(value.state as PlacementState)) {
          throw new PicsError(400, 'bad-request', `placements.${key}.state must be one of ${PLACEMENT_STATES.join(', ')}`);
        }
        // Stamped on every write of `done`, so re-ticking a stale placement brings it up to date.
        if (value.state !== current.state || value.state === 'done') current.at = stamp;
        current.state = value.state as PlacementState;
      }
      if ('note' in value) current.note = clean(value.note, MAX_PLACEMENT_NOTE);
    }
  }

  pic.updatedAt = stamp;
  pic.updatedBy = clean(by, 120);
  return { pic, placements };
}

/* ───────────────────────────── shaping ───────────────────────────── */

const nameOf = (r: AgentRecord) => clean(r.draft?.identity?.name || r.live?.identity?.name || r.slug, 80);
const titleOf = (r: AgentRecord) => clean(r.draft?.identity?.title || r.live?.identity?.title || '', 80);

export interface RosterRow {
  slug: string;
  name: string;
  title: string;
  /** The agent site's status in the CMS: draft / live / suspended / archived. */
  site: string;
  status: PicStatus;
  rawInDrive: boolean;
  raws: number;
  /** Stored camera originals, and JPEG/PNG working files. */
  archives: number;
  working: number;
  /** Stored outputs, of ten. */
  outputs: number;
  /** Everything stored for this agent, in bytes: what they cost to keep. */
  bytes: number;
  generatedAt: string;
  /** Placements resolved for the current photo, of five. */
  placed: number;
  placements: Record<PlacementKey, PlacementView>;
  notes: string;
  updatedAt: string;
}

export function rosterRow(record: AgentRecord): RosterRow {
  const pic = readPic(record.pic);
  const placements = readPlacements(record.placements);
  const views = {} as Record<PlacementKey, PlacementView>;
  for (const k of PLACEMENTS) views[k] = placementView(placements[k], pic.generatedAt);
  return {
    slug: record.slug,
    name: nameOf(record),
    title: titleOf(record),
    site: clean(record.status || 'draft', 20),
    status: picStatus(pic, placements),
    rawInDrive: pic.rawInDrive,
    raws: pic.raws.length,
    archives: pic.raws.filter((r) => r.kind === 'archive').length,
    working: pic.raws.filter((r) => r.kind === 'working').length,
    outputs: pic.outputs.length,
    bytes: [...pic.raws, ...pic.outputs].reduce((n, f) => n + f.bytes, 0),
    generatedAt: pic.generatedAt,
    placed: PLACEMENTS.filter((k) => resolved(views[k])).length,
    placements: views,
    notes: pic.notes,
    updatedAt: pic.updatedAt,
  };
}

/** One agent, with the whole photo side. Never the CMS's draft, live or contact details. */
export function agentView(record: AgentRecord) {
  return { ...rosterRow(record), pic: readPic(record.pic), placementLog: readPlacements(record.placements) };
}
