// The profile-pic files (Dispatch 12, phase 2): originals and generated outputs,
// stored against an agent.
//
// WHERE THE BYTES GO
//   Their own Blobs store, `cb-agent-pics`, never the agent store: a record stays
//   a small JSON document, and the CMS never reads a photo's bytes. The record's
//   `pic.raws` and `pic.outputs` say what's stored (record.ts).
//
//     up/<slug>/<id>             an upload in progress: what's coming, as JSON
//     f/<slug>/<id>/<0000…>      a file's parts, in order
//
// WHY PARTS, AND WHY THEY STAY PARTS
//   Netlify buffers about 6 MB per function request, and binary goes through as
//   base64, so one request carries about 4.5 MB. A JPEG original runs 2–7 MB and
//   a NEF 20–50 MB. So the browser sends a file in parts of PART_SIZE, one per
//   request, and the upload resumes: it asks which parts arrived and sends the
//   rest. A response has the same ceiling, so a download comes back the same
//   way, a part at a time, and the browser joins them. Blobs takes up to 5 GB an
//   object, so the cap isn't the store's; it's the request's, both ways.
//   Joining the parts into one blob on the server would mean holding up to
//   MAX_RAW in one invocation for nothing: no reader ever gets it whole.
//
// DELETING IS REAL
//   Deleting a file takes it off the record and deletes every part. Replacing an
//   output (a new generate) deletes the old one's parts. An abandoned upload is
//   listed on the agent until it's resumed or discarded, so nothing is kept that
//   nobody can see.
import {
  FILE_KINDS, MAX_RAWS, PicsError, readPic, VARIANTS, clean,
  type AgentRecord, type FileKind, type Pic, type StoredFile, type Variant,
} from './record.ts';

export const FILES_STORE = 'cb-agent-pics';

/** 3 MiB: about 4.2 MB once base64'd, under Netlify's ~6 MB request ceiling with room to spare. */
export const PART_SIZE = 3 * 1024 * 1024;
/** A NEF runs 20–50 MB; this leaves room for a big one without letting a stray video in. */
export const MAX_RAW = 200 * 1024 * 1024;
/** A 1080 PNG is 1–3 MB. */
export const MAX_OUTPUT = 25 * 1024 * 1024;
/** Unfinished uploads an agent may hold at once. */
export const MAX_PENDING = 12;

/** The part of @netlify/blobs' Store the files use. */
export interface FileBlobs {
  get(key: string, opts: { type: 'text' }): Promise<string | null>;
  get(key: string, opts: { type: 'arrayBuffer' }): Promise<ArrayBuffer | null>;
  set(key: string, value: string | ArrayBuffer): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  list(opts: { prefix: string }): Promise<{ blobs: { key: string }[] }>;
}

export const ID_RE = /^[a-f0-9]{24}$/;
export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 24);

const upKey = (slug: string, id: string) => `up/${slug}/${id}`;
const partPrefix = (slug: string, id: string) => `f/${slug}/${id}/`;
const partKey = (slug: string, id: string, n: number) => `${partPrefix(slug, id)}${String(n).padStart(4, '0')}`;

/* ───────────────────────────── what may be stored ───────────────────────────── */

/** Camera originals: kept, never decoded. NEF is what Casa shoots; the rest are the same idea. */
const ARCHIVE_EXT = ['nef', 'nrw', 'dng', 'cr2', 'cr3', 'arw', 'raf', 'orf', 'rw2'];
const WORKING_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

const extOf = (name: string) => (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] || '').toLowerCase();

/** What an original is, from its name. Anything that's neither a camera file nor a JPEG/PNG is refused. */
export function kindOf(filename: string): { kind: 'archive' | 'working'; type: string } | null {
  const ext = extOf(filename);
  if (ARCHIVE_EXT.includes(ext)) return { kind: 'archive', type: 'application/octet-stream' };
  if (WORKING_TYPES[ext]) return { kind: 'working', type: WORKING_TYPES[ext]! };
  return null;
}

/** An upload in progress, as kept at up/<slug>/<id>. */
export interface Upload {
  id: string;
  slug: string;
  kind: FileKind;
  filename: string;
  type: string;
  bytes: number;
  partSize: number;
  parts: number;
  variant: string;
  capturedAt: string;
  width: number | null;
  height: number | null;
  startedAt: string;
  by: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** A photo's EXIF date, as the browser read it. Lenient: one that's missing or odd is dropped, not refused. */
function capturedDate(v: unknown, now: number): string {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) && t > Date.parse('1990-01-01') && t < now + 36 * 3600_000 ? new Date(t).toISOString() : '';
}
const dimension = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 && (v as number) < 100_000 ? (v as number) : null);

/** Check an `upload-start` body against the record, and make the upload it describes. */
export function planUpload(rec: AgentRecord, b: Record<string, unknown>, pending: number, now: number, by: string): Upload {
  const pic = readPic(rec.pic);
  const filename = clean(b.filename, 200).replace(/[\\/]/g, '_');
  if (!filename) throw new PicsError(400, 'bad-request', 'filename is required');
  const bytes = b.bytes;
  if (!Number.isInteger(bytes) || (bytes as number) <= 0) throw new PicsError(400, 'bad-request', 'bytes must be the file’s size');
  if (pending >= MAX_PENDING) {
    throw new PicsError(409, 'too-many-uploads', `This agent has ${pending} unfinished uploads. Finish or discard them first.`);
  }

  let kind: FileKind;
  let type: string;
  let variant = '';
  if (b.role === 'output') {
    if (!VARIANTS.includes(b.variant as Variant)) throw new PicsError(400, 'bad-request', `variant must be one of ${VARIANTS.join(', ')}`);
    variant = b.variant as string;
    const t = extOf(filename);
    if (!WORKING_TYPES[t]) throw new PicsError(400, 'bad-type', 'An output is a JPEG or a PNG.');
    kind = 'output';
    type = WORKING_TYPES[t]!;
    if ((bytes as number) > MAX_OUTPUT) throw new PicsError(413, 'too-large', `An output can be up to ${MAX_OUTPUT / 1024 / 1024} MB.`);
  } else if (b.role === 'raw') {
    const k = kindOf(filename);
    if (!k) throw new PicsError(400, 'bad-type', 'An original is a camera file (NEF) or a JPEG or PNG.');
    ({ kind, type } = k);
    if ((bytes as number) > MAX_RAW) throw new PicsError(413, 'too-large', `An original can be up to ${MAX_RAW / 1024 / 1024} MB.`);
    if (pic.raws.length + pending >= MAX_RAWS) throw new PicsError(409, 'too-many-files', `An agent can hold ${MAX_RAWS} originals. Delete some first.`);
  } else {
    throw new PicsError(400, 'bad-request', 'role must be raw or output');
  }

  return {
    id: newId(),
    slug: rec.slug,
    kind,
    filename,
    type,
    bytes: bytes as number,
    partSize: PART_SIZE,
    parts: Math.ceil((bytes as number) / PART_SIZE),
    variant,
    capturedAt: kind === 'output' ? '' : capturedDate(b.capturedAt, now),
    width: dimension(b.width),
    height: dimension(b.height),
    startedAt: new Date(now).toISOString(),
    by,
  };
}

/** The size part `n` of an upload must be. */
export const partBytes = (u: Upload, n: number) => (n === u.parts - 1 ? u.bytes - u.partSize * (u.parts - 1) : u.partSize);

/* ───────────────────────────── the store ───────────────────────────── */

export async function readUpload(files: FileBlobs, slug: string, id: string): Promise<Upload | null> {
  if (!ID_RE.test(id)) return null;
  const raw = await files.get(upKey(slug, id), { type: 'text' });
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as unknown;
    return isObject(u) && u.id === id && u.slug === slug ? (u as unknown as Upload) : null;
  } catch {
    return null;
  }
}

export async function pendingUploads(files: FileBlobs, slug: string): Promise<(Upload & { received: number })[]> {
  const { blobs } = await files.list({ prefix: `up/${slug}/` });
  const ups = await Promise.all(blobs.map((b) => readUpload(files, slug, b.key.slice(`up/${slug}/`.length))));
  const live = ups.filter((u): u is Upload => u !== null);
  return Promise.all(live.map(async (u) => ({ ...u, received: (await receivedParts(files, u)).length })));
}

export async function receivedParts(files: FileBlobs, u: Upload): Promise<number[]> {
  const prefix = partPrefix(u.slug, u.id);
  const { blobs } = await files.list({ prefix });
  return blobs.map((b) => Number(b.key.slice(prefix.length))).filter((n) => Number.isInteger(n) && n >= 0 && n < u.parts)
    .sort((a, b) => a - b);
}

export async function startUpload(files: FileBlobs, u: Upload): Promise<void> {
  await files.set(upKey(u.slug, u.id), JSON.stringify(u));
}

/** Store one part. Its size must be exactly what the upload said, so a short or padded part can't slip in. */
export async function putPart(files: FileBlobs, u: Upload, n: number, body: ArrayBuffer): Promise<void> {
  if (!Number.isInteger(n) || n < 0 || n >= u.parts) throw new PicsError(400, 'bad-part', `part must be 0 to ${u.parts - 1}`);
  const want = partBytes(u, n);
  if (body.byteLength !== want) throw new PicsError(400, 'bad-part', `part ${n} must be ${want} bytes; got ${body.byteLength}`);
  await files.set(partKey(u.slug, u.id, n), body);
}

export async function readPart(files: FileBlobs, slug: string, key: string, n: number): Promise<ArrayBuffer | null> {
  return files.get(partKey(slug, key, n), { type: 'arrayBuffer' });
}

/** Delete every part of a file (or an unfinished upload), and its upload note. */
export async function deleteParts(files: FileBlobs, slug: string, id: string): Promise<void> {
  const { blobs } = await files.list({ prefix: partPrefix(slug, id) });
  await Promise.all(blobs.map((b) => files.delete(b.key)));
  await files.delete(upKey(slug, id));
}

export function storedFile(u: Upload, now: number): StoredFile {
  return {
    key: u.id,
    kind: u.kind,
    filename: u.filename,
    type: u.type,
    bytes: u.bytes,
    parts: u.parts,
    uploadedAt: new Date(now).toISOString(),
    capturedAt: u.capturedAt,
    width: u.width,
    height: u.height,
    variant: u.variant,
  };
}

/**
 * Put a finished upload on the photo side. An output replaces the one stored
 * for its variant (returned, for its parts to be deleted) and stamps the
 * generate. The first working file becomes the one the cutout runs against.
 */
export function addFile(pic: Pic, file: StoredFile, now: number): { pic: Pic; replaced: StoredFile | null } {
  if (!FILE_KINDS.includes(file.kind)) throw new PicsError(400, 'bad-request', 'unknown file kind');
  if (file.kind === 'output') {
    const replaced = pic.outputs.find((o) => o.variant === file.variant) || null;
    const outputs = [...pic.outputs.filter((o) => o.variant !== file.variant), file]
      .sort((a, b) => VARIANTS.indexOf(a.variant as Variant) - VARIANTS.indexOf(b.variant as Variant));
    return { pic: { ...pic, outputs, generatedAt: new Date(now).toISOString() }, replaced };
  }
  const raws = [...pic.raws, file];
  const workingKey = pic.workingKey || (file.kind === 'working' ? file.key : '');
  return { pic: { ...pic, raws, workingKey }, replaced: null };
}

/** Take a file off the photo side. The working file falls to the newest one left, if any. */
export function removeFile(pic: Pic, key: string): { pic: Pic; removed: StoredFile | null } {
  const removed = [...pic.raws, ...pic.outputs].find((f) => f.key === key) || null;
  if (!removed) return { pic, removed };
  const raws = pic.raws.filter((f) => f.key !== key);
  const outputs = pic.outputs.filter((f) => f.key !== key);
  let workingKey = pic.workingKey;
  if (workingKey === key) workingKey = [...raws].reverse().find((r) => r.kind === 'working')?.key || '';
  // `variants` is derived from `outputs` on every read (readPic).
  return { pic: { ...pic, raws, outputs, workingKey }, removed };
}

export const fileOf = (pic: Pic, key: string): StoredFile | null =>
  [...pic.raws, ...pic.outputs].find((f) => f.key === key) || null;
