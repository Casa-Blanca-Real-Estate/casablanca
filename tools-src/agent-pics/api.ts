// /.netlify/functions/agent-pics — the profile-pic roster (Dispatch 12, phase 1).
//
// Reads every agent in the `cb-agents` store (the agent CMS's records) and
// writes the photo side of them: the `pic` group and `placements`, which sit
// outside the CMS's `draft` and `live` (see record.ts for why).
//
// SECURITY
//   Every request needs `Authorization: Bearer <CB_PICS_TOKEN>`, reads included.
//   Unset, the function refuses everything; set to the same value as
//   CB_CMS_TOKEN, it refuses too, because then the photo tool's token would be
//   the one that publishes agent sites. This token can't create, publish,
//   suspend or delete an agent, and can't change anything outside `pic` and
//   `placements`: a body naming anything else is refused, not partly applied.
//   Reads return names and titles, never the CMS's contact details.
//
//   GET                       the roster: one row per agent, with the derived status
//   GET  ?slug=<slug>         one agent's photo side
//   POST {action:'update', slug, pic?, placements?, by?}
//
// Env: CB_PICS_TOKEN (required), CB_CMS_TOKEN (read only to check they differ),
//      ALLOWED_ORIGIN (optional CORS origin; not a security control).
import {
  agentView, applyPatch, clean, INDEX_KEY, PicsError, rosterRow, AGENTS_STORE, type AgentRecord,
} from './record.ts';

export { AGENTS_STORE };

/** The part of @netlify/blobs' Store this uses; the tests run it against Blobs' own local server. */
export interface AgentBlobs {
  get(key: string, opts: { type: 'text' }): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  list(): Promise<{ blobs: { key: string }[] }>;
}

export interface PicsDeps {
  /** `cb-agents`, read with strong consistency: a write must never start from a cached copy. */
  store: AgentBlobs;
  env: Record<string, string | undefined>;
  now: () => number;
}

const MAX_BODY = 32 * 1024;
const BODY_KEYS = ['action', 'slug', 'pic', 'placements', 'by'];

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
  if (!safeEqual(bearer(req), secret)) return json({ error: 'unauthorized' }, 401);

  try {
    const { store } = deps;
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const slug = (url.searchParams.get('slug') || '').toLowerCase();
      if (slug) {
        if (!isSlug(slug)) return json({ error: 'Bad slug' }, 400);
        const rec = await readRecord(store, slug);
        return rec ? json({ ok: true, agent: agentView(rec) }) : json({ error: 'Not found' }, 404);
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

      const extra = Object.keys(b).filter((k) => !BODY_KEYS.includes(k));
      if (extra.length) {
        return json({ error: 'not-writable', message: `This token can't set ${extra.join(', ')}. It writes pic and placements only.` }, 400);
      }
      if (b.action !== 'update') return json({ error: 'Unknown action' }, 400);
      const slug = String(b.slug || '').toLowerCase();
      if (!isSlug(slug)) return json({ error: 'Bad slug' }, 400);

      const rec = await readRecord(store, slug);
      // Agents are created in the agent CMS, or by the one-time import — never here.
      if (!rec) return json({ error: 'Not found', message: 'No agent with that slug. Add agents in the agent CMS.' }, 404);

      const { pic, placements } = applyPatch(rec, { pic: b.pic, placements: b.placements }, deps.now(), clean(b.by, 120));
      // Everything but the two photo groups goes back exactly as it was read.
      const next: AgentRecord = { ...rec, pic, placements };
      await store.set(slug, JSON.stringify(next));
      return json({ ok: true, agent: agentView(next) });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    if (e instanceof PicsError) return json({ error: e.code, message: e.message }, e.status);
    console.error('agent-pics fn error:', e);
    return json({ error: 'Function exception', message: e instanceof Error ? e.message : String(e) }, 500);
  }
}
