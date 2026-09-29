// The team Feedback button (assets/feedback.js, on every studio page): what it
// keeps, and who can read it back.
//
// Posting is open to everyone on the site: agents have no accounts, and tools
// served from GitHub Pages post cross-origin (localStorage.cb_backend), so the
// POST keeps open CORS. Reading is not open: submissions carry names and
// emails, so only the dev notebook's signed-in developers read them
// (GET /api/dev/notebook/feedback). Until 2026-09-29 this function also
// answered GET with the whole list — to anyone, from any site.
//
// Netlify Blobs store `cb-feedback`:
//   list               the old single list (newest 200): read, no longer written
//   items/<ts>-<rand>  one blob per submission since, so two sent at once can't
//                      overwrite each other (the old read-modify-write could)
import { randomBytes } from 'node:crypto';

export const FEEDBACK_STORE = 'cb-feedback';
export const MAX_MESSAGE = 4000;
export const MAX_FIELD = 200;
const MAX_BODY = 16 * 1024;

export interface FeedbackItem {
  name: string;
  email: string;
  message: string;
  tool: string;
  ts: string;
}

/** The part of @netlify/blobs' Store this uses; the tests run it against Blobs' own local server. */
export interface FeedbackBlobs {
  get(key: string, opts: { type: 'json' }): Promise<unknown>;
  setJSON(key: string, data: unknown): Promise<void>;
  list(opts: { prefix: string }): Promise<{ blobs: { key: string }[] }>;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function reply(body: unknown, status: number, cors: boolean): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(cors ? CORS : {}), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const field = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, MAX_FIELD) : '');

export async function handleFeedback(
  req: Request,
  store: FeedbackBlobs,
  clock: { now: () => number; random: (n: number) => Buffer } = { now: () => Date.now(), random: (n) => randomBytes(n) },
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') {
    // The read that was here handed every submission to anyone who asked. Gone, not gated.
    return reply({ error: 'method_not_allowed', message: 'Feedback is posted here. Developers read it on the dev notebook page.' }, 405, false);
  }
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return reply({ error: 'too_large', message: 'That feedback is too long.' }, 413, true);
    let body: unknown;
    try {
      body = JSON.parse(text || '{}');
    } catch {
      return reply({ error: 'invalid_json', message: 'Send JSON.' }, 400, true);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'invalid_body', message: 'Send a JSON object.' }, 400, true);
    const b = body as Record<string, unknown>;
    const message = typeof b.message === 'string' ? b.message.trim() : '';
    if (!message) return reply({ error: 'message_required', message: 'Write something first.' }, 400, true);
    if (message.length > MAX_MESSAGE) return reply({ error: 'too_long', message: `Keep feedback under ${MAX_MESSAGE} characters.` }, 413, true);
    const ts = new Date(clock.now()).toISOString();
    const item: FeedbackItem = { name: field(b.name), email: field(b.email), message, tool: field(b.tool), ts };
    await store.setJSON(`items/${ts.replace(/[-:.]/g, '')}-${clock.random(6).toString('hex')}`, item);
    return reply({ ok: true }, 200, true);
  } catch (error) {
    console.error('feedback: could not save', error);
    return reply({ error: 'internal', message: 'Couldn’t save that. Try again.' }, 500, true);
  }
}

function asItem(v: unknown): FeedbackItem | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.message !== 'string' || typeof o.ts !== 'string') return null;
  return { name: field(o.name), email: field(o.email), message: o.message, tool: field(o.tool), ts: o.ts };
}

/** Every submission, newest first — the old list and the one-per-submission blobs together. */
export async function readFeedback(store: FeedbackBlobs, limit = 500): Promise<FeedbackItem[]> {
  const keys = (await store.list({ prefix: 'items/' })).blobs.map((b) => b.key).sort().reverse().slice(0, limit);
  const items: FeedbackItem[] = [];
  for (let i = 0; i < keys.length; i += 8) {
    const batch = await Promise.all(keys.slice(i, i + 8).map((k) => store.get(k, { type: 'json' })));
    for (const v of batch) {
      const item = asItem(v);
      if (item) items.push(item);
    }
  }
  const legacy = await store.get('list', { type: 'json' }).catch(() => null);
  const old = Array.isArray(legacy) ? legacy.map(asItem).filter((x): x is FeedbackItem => Boolean(x)) : [];
  return [...items, ...old].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit);
}
