// /.netlify/functions/agent-pics — the profile-pic roster (Dispatch 12, phases 1–2).
//
// Reads every agent in the `cb-agents` store (the agent CMS's records) and
// writes the photo side of them: the `pic` group and `placements`, which sit
// outside the CMS's `draft` and `live` (see record.ts for why). Phase 2 stores
// the photo files themselves, in their own store (files.ts for how and why).
//
// SECURITY
//   Every request needs `Authorization: Bearer <CB_PICS_TOKEN>`, reads included.
//   Unset, the function refuses everything; set to the same value as
//   CB_CMS_TOKEN, it refuses too, because then the photo tool's token would be
//   the one that publishes agent sites. This token can't publish, suspend or
//   delete an agent, and can't change anything outside `pic` and `placements`:
//   a body naming anything else is refused, not partly applied. It can create
//   an agent, as a draft with a name and a title and nothing else, so a photo
//   can be saved for someone the CMS hasn't met yet (Kimani's notebook,
//   2026-10-27). A draft is never on the public site until the CMS publishes it.
//   Reads return names and titles, never the CMS's contact details.
//
//   The CMS token reads one thing here: a stored file's bytes (GET ?slug=&file=),
//   so the agent CMS can show the photos. It already reads the record that lists
//   them, and can delete the agent outright; nothing else takes it.
//
//   GET                       the roster: one row per agent, with the derived status
//   GET  ?slug=<slug>         one agent's photo side, with its unfinished uploads
//   POST {action:'update', slug, pic?, placements?, by?}
//   POST {action:'create', slug, name, title?, by?}   → a draft agent; 409 if the slug is taken
//
//   Files (phase 2):
//   POST {action:'upload-start', slug, role:'raw'|'output', filename, bytes,
//         variant?, capturedAt?, width?, height?, by?}      → {upload}: its id and parts
//   GET  ?slug=&upload=<id>                                → the upload, and the parts received
//   POST ?slug=&upload=<id>&part=<n>   (the part's bytes)  → stores one part
//   POST {action:'upload-finish', slug, upload, by?}       → the file goes on the record
//   POST {action:'upload-abort', slug, upload}             → the parts are deleted
//   GET  ?slug=&file=<key>&part=<n>                        → one part of a stored file
//   POST {action:'file-delete', slug, key, by?}            → off the record, and every part deleted
//
// Env: CB_PICS_TOKEN (required), CB_CMS_TOKEN (read only to check they differ),
//      ALLOWED_ORIGIN (optional CORS origin; not a security control).
import {
  agentView, applyPatch, clean, INDEX_KEY, PicsError, readPic, rosterRow, AGENTS_STORE, type AgentRecord, type Pic,
} from './record.ts';
import {
  addFile, deleteParts, fileOf, ID_RE, pendingUploads, planUpload, putPart, readPart, readUpload,
  receivedParts, removeFile, startUpload, storedFile, FILES_STORE, PART_SIZE, type FileBlobs,
} from './files.ts';

export { AGENTS_STORE, FILES_STORE };

/** The part of @netlify/blobs' Store this uses; the tests run it against Blobs' own local server. */
export interface AgentBlobs {
  get(key: string, opts: { type: 'text' }): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  list(): Promise<{ blobs: { key: string }[] }>;
}

export interface PicsDeps {
  /** `cb-agents`, read with strong consistency: a write must never start from a cached copy. */
  store: AgentBlobs;
  /** `cb-agent-pics`: the files' bytes, in parts. */
  files: FileBlobs;
  env: Record<string, string | undefined>;
  now: () => number;
}

const MAX_BODY = 32 * 1024;
/** What each action's body may name. Anything else is refused whole, not partly applied. */
const BODY_KEYS: Record<string, string[]> = {
  update: ['action', 'slug', 'pic', 'placements', 'by'],
  create: ['action', 'slug', 'name', 'title', 'by'],
  'upload-start': ['action', 'slug', 'role', 'filename', 'bytes', 'variant', 'capturedAt', 'width', 'height', 'by'],
  'upload-finish': ['action', 'slug', 'upload', 'by'],
  'upload-abort': ['action', 'slug', 'upload', 'by'],
  'file-delete': ['action', 'slug', 'key', 'by'],
};
const ALL_KEYS = [...new Set(Object.values(BODY_KEYS).flat())];

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const isSlug = (s: unknown): s is string => typeof s === 'string' && SLUG_RE.test(s);

function cors(env: PicsDeps['env']) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

/** Constant-time over the bytes, as in agent-store.mjs. Length still leaks; that's fine. */
export function safeEqual(a: unknown, b: unknown): boolean {
  const enc = new TextEncoder();
  const A = enc.encode(String(a ?? ''));
  const B = enc.encode(String(b ?? ''));
  if (A.length !== B.length || A.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < A.length; i++) diff |= A[i]! ^ B[i]!;
  return diff === 0;
}

function bearer(req: Request): string {
  const m = /^Bearer\s+(.+)$/i.exec((req.headers.get('authorization') || '').trim());
  return m ? m[1]!.trim() : '';
}

/* ───────────────────────────── storage ───────────────────────────── */

async function readRecord(store: AgentBlobs, slug: string): Promise<AgentRecord | null> {
  const raw = await store.get(slug, { type: 'text' });
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as unknown;
    return rec && typeof rec === 'object' && !Array.isArray(rec) ? { ...(rec as AgentRecord), slug } : null;
  } catch {
    return null;
  }
}

/** The same roster agent-store.mjs reads: the index blob, with list() unioned in as a repair path. */
async function readIndex(store: AgentBlobs): Promise<string[]> {
  let idx: unknown = [];
  try { idx = JSON.parse((await store.get(INDEX_KEY, { type: 'text' })) || '[]'); } catch { idx = []; }
  let listed: string[] = [];
  try { listed = (await store.list()).blobs.map((b) => b.key).filter((k) => k !== INDEX_KEY); } catch { /* a nicety */ }
  return [...new Set([...(Array.isArray(idx) ? idx : []), ...listed])].filter(isSlug);
}

async function writeIndex(store: AgentBlobs, slugs: string[]): Promise<void> {
  await store.set(INDEX_KEY, JSON.stringify([...new Set(slugs)].filter(isSlug)));
}

function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ───────────────────────────── handler ───────────────────────────── */

export async function handlePics(req: Request, deps: PicsDeps): Promise<Response> {
  const CORS = cors(deps.env);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const secret = deps.env.CB_PICS_TOKEN || '';
  if (!secret) {
    return json({
      error: 'not-configured',
      message: 'CB_PICS_TOKEN is not set on the backend. The roster refuses every request until it is.',
    }, 503);
  }
  if (deps.env.CB_CMS_TOKEN && safeEqual(secret, deps.env.CB_CMS_TOKEN)) {
    return json({
      error: 'not-configured',
      message: 'CB_PICS_TOKEN is the same as CB_CMS_TOKEN. Give the photo tool its own token: the CMS one publishes agent sites.',
    }, 503);
  }
  const url = new URL(req.url);
  const given = bearer(req);
  // The CMS token: a stored file's bytes, and nothing else (see SECURITY above).
  const cmsFileRead = req.method === 'GET' && url.searchParams.has('slug') && url.searchParams.has('file')
    && !url.searchParams.has('upload') && Boolean(deps.env.CB_CMS_TOKEN) && safeEqual(given, deps.env.CB_CMS_TOKEN);
  if (!safeEqual(given, secret) && !cmsFileRead) return json({ error: 'unauthorized' }, 401);

  try {
    const { store } = deps;

    const slug = (url.searchParams.get('slug') || '').toLowerCase();
    const uploadId = url.searchParams.get('upload');
    const partParam = url.searchParams.get('part');

    // One part of an upload: the body is the bytes, not JSON.
    if (req.method === 'POST' && uploadId !== null && partParam !== null) {
      if (!isSlug(slug)) return json({ error: 'Bad slug' }, 400);
      const declared = Number(req.headers.get('content-length') || '0');
      if (declared > PART_SIZE) return json({ error: 'Body too large' }, 413);
      const up = await readUpload(deps.files, slug, uploadId);
      if (!up) return json({ error: 'Not found', message: 'No upload with that id. Start it again.' }, 404);
      const body = await req.arrayBuffer();
      if (body.byteLength > PART_SIZE) return json({ error: 'Body too large' }, 413);
      const n = Number(partParam);
      await putPart(deps.files, up, n, body);
      return json({ ok: true, part: n });
    }

    if (req.method === 'GET') {
      if (slug) {
        if (!isSlug(slug)) return json({ error: 'Bad slug' }, 400);
        const rec = await readRecord(store, slug);
        if (!rec) return json({ error: 'Not found' }, 404);

        if (uploadId !== null) {
          const up = await readUpload(deps.files, slug, uploadId);
          if (!up) return json({ error: 'Not found', message: 'No upload with that id.' }, 404);
          return json({ ok: true, upload: up, received: await receivedParts(deps.files, up) });
        }

        const fileKey = url.searchParams.get('file');
        if (fileKey !== null) {
          const file = fileOf(readPic(rec.pic), fileKey);
          const n = Number(partParam ?? '0');
          if (!file) return json({ error: 'Not found', message: 'No stored file with that key.' }, 404);
          if (!Number.isInteger(n) || n < 0 || n >= file.parts) return json({ error: 'bad-part', message: `part must be 0 to ${file.parts - 1}` }, 400);
          const bytes = await readPart(deps.files, slug, file.key, n);
          if (!bytes) return json({ error: 'missing-part', message: `Part ${n} of this file is missing from the store.` }, 500);
          return new Response(bytes, {
            status: 200,
            headers: {
              ...CORS, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store',
              'X-Parts': String(file.parts), 'Access-Control-Expose-Headers': 'X-Parts',
            },
          });
        }

        return json({ ok: true, agent: agentView(rec), uploads: await pendingUploads(deps.files, slug) });
      }
      const slugs = await readIndex(store);
      const records = await Promise.all(slugs.map((s) => readRecord(store, s)));
      const roster = records.filter((r): r is AgentRecord => r !== null).map(rosterRow)
        .sort((a, b) => a.name.localeCompare(b.name));
      return json({ ok: true, roster });
    }

    if (req.method === 'POST') {
      const text = await req.text();
      if (text.length > MAX_BODY) return json({ error: 'Body too large' }, 413);
      let body: unknown;
      try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON body' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid JSON body' }, 400);
      const b = body as Record<string, unknown>;

      const allowed = BODY_KEYS[String(b.action)];
      const extra = Object.keys(b).filter((k) => !(allowed || ALL_KEYS).includes(k));
      if (extra.length) {
        return json({ error: 'not-writable', message: `This token can't set ${extra.join(', ')}. It writes pic and placements only.` }, 400);
      }
      if (!allowed) return json({ error: 'Unknown action' }, 400);
      const slug = String(b.slug || '').toLowerCase();
      if (!isSlug(slug)) return json({ error: 'Bad slug' }, 400);

      const rec = await readRecord(store, slug);
      const now = deps.now();
      const by = clean(b.by, 120);

      // A new agent, from the generator: a draft as agent-store's `create` makes one,
      // with only a name and a title. The CMS fills in the rest, and publishes.
      if (b.action === 'create') {
        if (rec) return json({ error: 'exists', message: `${slug} is already in the roster. Pick it instead.`, agent: agentView(rec) }, 409);
        const name = clean(b.name, 80);
        if (!name) return json({ error: 'Bad name', message: 'A name is required.' }, 400);
        const at = new Date(now).toISOString();
        const next: AgentRecord = {
          slug,
          status: 'draft',
          draft: { identity: { name, displayName: '', title: clean(b.title, 80), licenseNumber: '' } },
          live: null,
          previewToken: randomToken(),
          createdAt: at,
          updatedAt: at,
          updatedBy: by,
          publishedAt: '',
        };
        await store.set(slug, JSON.stringify(next));
        await writeIndex(store, [...(await readIndex(store)), slug]);
        return json({ ok: true, agent: agentView(next) });
      }

      // Agents are otherwise created in the agent CMS, or by the one-time import.
      if (!rec) return json({ error: 'Not found', message: 'No agent with that slug. Add agents in the agent CMS.' }, 404);

      /** Write the photo side back. Everything but `pic` goes back exactly as it was read. */
      const savePic = async (pic: Pic) => {
        const next: AgentRecord = { ...rec, pic: { ...pic, updatedAt: new Date(now).toISOString(), updatedBy: by } };
        await store.set(slug, JSON.stringify(next));
        return next;
      };

      if (b.action === 'update') {
        const { pic, placements } = applyPatch(rec, { pic: b.pic, placements: b.placements }, now, by);
        // Everything but the two photo groups goes back exactly as it was read.
        const next: AgentRecord = { ...rec, pic, placements };
        await store.set(slug, JSON.stringify(next));
        return json({ ok: true, agent: agentView(next) });
      }

      if (b.action === 'upload-start') {
        const pending = (await deps.files.list({ prefix: `up/${slug}/` })).blobs.length;
        const up = planUpload(rec, b, pending, now, by);
        await startUpload(deps.files, up);
        return json({ ok: true, upload: up, received: [] });
      }

      const uploadKey = String(b.upload ?? '');
      if (b.action === 'upload-abort') {
        if (!ID_RE.test(uploadKey)) return json({ error: 'Bad upload id' }, 400);
        // Never the parts of a file the record holds: those go through file-delete.
        if (fileOf(readPic(rec.pic), uploadKey)) return json({ error: 'stored', message: 'That upload finished. Delete the file instead.' }, 409);
        await deleteParts(deps.files, slug, uploadKey);
        return json({ ok: true });
      }

      if (b.action === 'upload-finish') {
        const up = await readUpload(deps.files, slug, uploadKey);
        if (!up) return json({ error: 'Not found', message: 'No upload with that id.' }, 404);
        const got = await receivedParts(deps.files, up);
        if (got.length !== up.parts) {
          const missing = Array.from({ length: up.parts }, (_, i) => i).filter((i) => !got.includes(i));
          return json({ error: 'incomplete', message: `${missing.length} of ${up.parts} parts haven't arrived.`, missing }, 409);
        }
        const { pic, replaced } = addFile(readPic(rec.pic), storedFile(up, now), now);
        const next = await savePic(pic);
        // The record holds the file now; the upload note goes, and a replaced output's bytes with it.
        await deps.files.delete(`up/${slug}/${up.id}`);
        if (replaced) await deleteParts(deps.files, slug, replaced.key);
        return json({ ok: true, agent: agentView(next), file: fileOf(readPic(next.pic), up.id) });
      }

      if (b.action === 'file-delete') {
        const key = String(b.key ?? '');
        const { pic, removed } = removeFile(readPic(rec.pic), key);
        if (!removed) return json({ error: 'Not found', message: 'No stored file with that key.' }, 404);
        const next = await savePic(pic);
        await deleteParts(deps.files, slug, removed.key);
        return json({ ok: true, agent: agentView(next), freed: removed.bytes });
      }
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    if (e instanceof PicsError) return json({ error: e.code, message: e.message }, e.status);
    console.error('agent-pics fn error:', e);
    return json({ error: 'Function exception', message: e instanceof Error ? e.message : String(e) }, 500);
  }
}
