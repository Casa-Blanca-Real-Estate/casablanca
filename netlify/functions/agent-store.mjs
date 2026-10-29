// Agent site records — the store behind the agent CMS (tools/agent-cms/).
//
// One JSON record per agent, holding a `draft` (what the CMS edits) and a `live`
// snapshot (what the build renders). See docs/agent-cms/storage-decision.md for
// why Netlify Blobs and not git, and what it costs.
//
// SECURITY — read docs/agent-cms/security-model.md before exposing this.
//   Every request needs `Authorization: Bearer <CB_CMS_TOKEN>`, including reads
//   (the records hold agents' direct phone numbers and emails). If the env var
//   is unset the function refuses everything: an unconfigured deploy is closed,
//   not public. The one exception is a per-agent, read-only preview token.
//   The token proves *authorised*, never *who* — there is no identity here.
//
// Env: CB_CMS_TOKEN        (required) shared secret for the CMS
//      NETLIFY_BUILD_HOOK  (optional) build hook URL, POSTed on publish/suspend
//      ALLOWED_ORIGIN      (optional) CORS origin; not a security control
//
// THE PHOTO SIDE (Dispatch 12): a record can also carry `pic` and `placements`,
// written by netlify/functions/agent-pics.mts with its own token. They sit
// beside `draft` and `live`, never inside them, so Publish can't carry them to
// the public site. Every write here edits the record it read and keeps keys it
// doesn't know — don't rebuild a record from scratch, or the photo side is lost.
// Both functions read with strong consistency, so neither writes back a cached
// copy over the other's change.
import { getStore } from '@netlify/blobs';

const STORE = 'cb-agents';
const INDEX_KEY = '_index';

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Vary': 'Origin',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/* ───────────────────────────── auth ───────────────────────────── */

// Constant-time over the bytes so the endpoint doesn't leak the token one
// character at a time through response timing. Length still leaks; that's fine.
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const A = enc.encode(String(a ?? ''));
  const B = enc.encode(String(b ?? ''));
  if (A.length !== B.length || A.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < A.length; i++) diff |= A[i] ^ B[i];
  return diff === 0;
}

function bearer(req) {
  const h = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : '';
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ───────────────────────── field sanitising ─────────────────────────
   The function does not trust its own front end. Every write is rebuilt
   field by field from the spec below — unknown keys are dropped, never
   merged — and text fields lose `<` and `>`, because nothing in this
   schema is meant to carry markup and the output becomes public HTML.
   (agents/build.js does not escape yet — Dispatch 02 §2.) */

const clean = (v, max) =>
  String(v ?? '')
    // C0/C1 controls except tab and newline, then angle brackets.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max);

const SAFE_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];
function cleanUrl(v, max = 400) {
  const s = clean(v, max);
  if (!s) return '';
  // A bare domain is the common paste; assume https rather than dropping it.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s;
  try {
    const u = new URL(candidate);
    return SAFE_SCHEMES.includes(u.protocol) ? u.toString().slice(0, max) : '';
  } catch {
    return '';
  }
}

// An Instagram handle is the usual paste (FB-2): "@sam.valk" or "sam.valk"
// becomes the profile URL the site's social row needs. Anything else is a URL.
const IG_HANDLE_RE = /^@?([A-Za-z0-9._]{1,30})$/;
function cleanInstagram(v) {
  const s = clean(v, 400);
  const m = IG_HANDLE_RE.exec(s);
  if (m && (s.startsWith('@') || !/\.(com|net|org|io|co)$/i.test(s))) return `https://instagram.com/${m[1]}`;
  return cleanUrl(s);
}

// null, not 0, when the field is blank. `Number('')` is 0, and a stat that
// silently became 0 would publish "0 years in NYC" as a claim about a real
// person. Empty has to stay empty all the way to the page.
function cleanInt(v, max) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const isSlug = (s) => SLUG_RE.test(String(s || ''));

const STATUSES = ['draft', 'live', 'suspended', 'archived'];
const SOURCES = ['manual', 'google'];

// `t` types: text | url | instagram (a handle or a URL) | int | list (of text) | rows (of sub-fields).
const SPEC = {
  identity: {
    name:          { t: 'text', max: 80 },
    displayName:   { t: 'text', max: 80 },
    title:         { t: 'text', max: 80 },
    licenseNumber: { t: 'text', max: 40 },
    // Names the agent went by before (Emma Caldicott, now Emma Liuzzi: PP-10).
    // For finding them in the studio; never rendered on a site.
    formerNames:   { t: 'list', max: 80, cap: 10 },
  },
  contact: {
    phone:      { t: 'text', max: 40 },
    email:      { t: 'text', max: 120 },
    instagram:  { t: 'instagram' },
    linkedin:   { t: 'url' },
    streeteasy: { t: 'url' },
  },
  content: {
    bio:           { t: 'text', max: 4000 },
    neighborhoods: { t: 'list', max: 60, cap: 20 },
    languages:     { t: 'list', max: 40, cap: 10 },
    specialties:   { t: 'list', max: 60, cap: 12 },
  },
  stats: {
    closedDeals:      { t: 'int', max: 100000 },
    avgDaysOnMarket:  { t: 'int', max: 3650 },
    satisfactionRate: { t: 'int', max: 100 },
    yearsExperience:  { t: 'int', max: 80 },
  },
  assets: {
    heroPhoto:      { t: 'url' },
    heroAlt:        { t: 'text', max: 200 },
    buyersGuidePdf: { t: 'url' },
  },
  seo: {
    title:       { t: 'text', max: 70 },
    description: { t: 'text', max: 200 },
    ogImage:     { t: 'url' },
    canonical:   { t: 'url' },
  },
  delivery: {
    customDomain: { t: 'text', max: 120 },
    studioUrl:    { t: 'url' },
  },
};

const ROWS = {
  deals: {
    cap: 60,
    fields: {
      address: { t: 'text', max: 160 },
      unit:    { t: 'text', max: 30 },
      sqft:    { t: 'text', max: 20 },
      price:   { t: 'text', max: 30 },
    },
  },
  testimonials: {
    cap: 40,
    fields: {
      quote:  { t: 'text', max: 1200 },
      author: { t: 'text', max: 80 },
      detail: { t: 'text', max: 120 },
      date:   { t: 'text', max: 10 },
      source: { t: 'enum', values: SOURCES, fallback: 'manual' },
    },
  },
  team: {
    cap: 12,
    fields: {
      name:  { t: 'text', max: 80 },
      title: { t: 'text', max: 80 },
      email: { t: 'text', max: 120 },
      phone: { t: 'text', max: 40 },
    },
  },
};

function cleanField(spec, value) {
  switch (spec.t) {
    case 'url':  return cleanUrl(value);
    case 'instagram': return cleanInstagram(value);
    case 'int':  return cleanInt(value, spec.max);
    case 'enum': return spec.values.includes(value) ? value : spec.fallback;
    case 'list':
      return (Array.isArray(value) ? value : [])
        .map((v) => clean(v, spec.max))
        .filter(Boolean)
        .slice(0, spec.cap);
    default:     return clean(value, spec.max);
  }
}

function cleanGroup(fields, src) {
  const out = {};
  const from = src && typeof src === 'object' ? src : {};
  for (const [key, spec] of Object.entries(fields)) out[key] = cleanField(spec, from[key]);
  return out;
}

// Keys are `group.field` paths the CMS marks as AI-generated. Values record
// when, which model, and whether the human has since edited the field — the
// UI needs "generated vs edited" and the store is where that survives a reload.
function cleanAi(src) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const [key, meta] of Object.entries(src).slice(0, 60)) {
    if (!/^[a-z]+\.[a-zA-Z]+$/.test(key) || !meta || typeof meta !== 'object') continue;
    out[key] = {
      at: clean(meta.at, 30),
      model: clean(meta.model, 60),
      edited: meta.edited === true,
    };
  }
  return out;
}

function cleanDraft(src) {
  const d = src && typeof src === 'object' ? src : {};
  const out = {};
  for (const [group, fields] of Object.entries(SPEC)) out[group] = cleanGroup(fields, d[group]);
  for (const [group, { cap, fields }] of Object.entries(ROWS)) {
    out[group] = (Array.isArray(d[group]) ? d[group] : [])
      .slice(0, cap)
      .map((row) => cleanGroup(fields, row))
      .filter((row) => Object.values(row).some((v) => v !== '' && v !== null && v !== 'manual'));
  }
  out.ai = cleanAi(d.ai);
  return out;
}

function emptyDraft() {
  return cleanDraft({});
}

/* ───────────────────────────── storage seam ─────────────────────────────
   Everything storage-specific is these four functions plus the index. To
   move to git-as-source-of-truth, reimplement these against the GitHub
   Contents API; nothing above or below them changes. */

async function readRecord(store, slug) {
  const raw = await store.get(slug, { type: 'text' });
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function writeRecord(store, slug, record) {
  await store.set(slug, JSON.stringify(record));
}

async function deleteRecord(store, slug) {
  await store.delete(slug);
}

// store.list() is eventually consistent on Netlify Blobs; a per-key get is not.
// So the roster is driven by an index blob, with list() unioned in as a repair
// path in case the index and reality ever drift.
async function readIndex(store) {
  const raw = await store.get(INDEX_KEY, { type: 'text' });
  let idx = [];
  try { idx = raw ? JSON.parse(raw) : []; } catch { idx = []; }
  if (!Array.isArray(idx)) idx = [];
  let listed = [];
  try {
    const { blobs } = await store.list();
    listed = blobs.map((b) => b.key).filter((k) => k !== INDEX_KEY);
  } catch { /* list is a nicety here, not load-bearing */ }
  return [...new Set([...idx, ...listed])].filter(isSlug);
}

async function writeIndex(store, slugs) {
  await store.set(INDEX_KEY, JSON.stringify([...new Set(slugs)].filter(isSlug)));
}

/* ───────────────────────────── build hook ───────────────────────────── */

// Publishing and suspending both change what the public build emits, so both
// kick a build. Says which of "triggered / not-configured / failed" happened —
// the CMS shows it rather than implying a build that never ran.
async function triggerBuild(reason) {
  const hook = process.env.NETLIFY_BUILD_HOOK;
  if (!hook) return 'not-configured';
  try {
    const r = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger_title: `agent-cms: ${reason}` }),
    });
    return r.ok ? 'triggered' : 'failed';
  } catch {
    return 'failed';
  }
}

/* ───────────────────────────── shaping ───────────────────────────── */

const outputs = (rec) => (rec.pic && Array.isArray(rec.pic.outputs) ? rec.pic.outputs : []);
// The round clean variant if it's there, else the first stored.
function rosterPhoto(rec) {
  const all = outputs(rec);
  const f = all.find((o) => o && o.variant === 'R4_Clean') || all[0];
  return f && f.key ? { key: f.key, parts: f.parts || 1, type: f.type || '' } : null;
}

function summarise(rec) {
  const d = rec.draft || {};
  const l = rec.live || {};
  return {
    slug: rec.slug,
    status: rec.status,
    name: (d.identity && d.identity.name) || (l.identity && l.identity.name) || rec.slug,
    title: (d.identity && d.identity.title) || '',
    formerNames: (d.identity && Array.isArray(d.identity.formerNames) && d.identity.formerNames) || [],
    customDomain: (d.delivery && d.delivery.customDomain) || '',
    studioUrl: (d.delivery && d.delivery.studioUrl) || '',
    heroPhoto: (d.assets && d.assets.heroPhoto) || '',
    // The photos the profile pic generator saved (the photo side, Dispatch 12): how
    // many, and which one the roster shows, read through agent-pics.
    photos: outputs(rec).length,
    photo: rosterPhoto(rec),
    updatedAt: rec.updatedAt || '',
    updatedBy: rec.updatedBy || '',
    publishedAt: rec.publishedAt || '',
    // Cheap "has unpublished changes" signal for the roster.
    dirty: rec.status !== 'draft' && JSON.stringify(rec.draft) !== JSON.stringify(rec.live || null),
  };
}

/* ───────────────────────────── handler ───────────────────────────── */

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const secret = process.env.CB_CMS_TOKEN;
  if (!secret) {
    return json({
      error: 'not-configured',
      message: 'CB_CMS_TOKEN is not set on the backend. The agent store refuses every request until it is.',
    }, 503);
  }

  try {
    const store = getStore({ name: STORE, consistency: 'strong' });
    const url = new URL(req.url);
    const slug = (url.searchParams.get('slug') || '').toLowerCase();
    const previewToken = url.searchParams.get('preview') || '';
    const authed = safeEqual(bearer(req), secret);

    /* ── read-only preview: one agent, no roster, no writes ──
       The token is per-agent and rotatable, with no relationship to
       CB_CMS_TOKEN, so a preview link is safe to send to the agent. */
    if (req.method === 'GET' && previewToken && slug) {
      if (!isSlug(slug)) return json({ error: 'Bad slug' }, 400);
      const rec = await readRecord(store, slug);
      if (!rec || !rec.previewToken || !safeEqual(previewToken, rec.previewToken)) {
        return json({ error: 'Not found' }, 404);
      }
      return json({
        ok: true,
        preview: true,
        slug: rec.slug,
        status: rec.status,
        updatedAt: rec.updatedAt || '',
        draft: rec.draft || emptyDraft(),
      });
    }

    if (!authed) return json({ error: 'unauthorized' }, 401);

    /* ── reads ── */
    if (req.method === 'GET') {
      if (slug) {
        if (!isSlug(slug)) return json({ error: 'Bad slug' }, 400);
        const rec = await readRecord(store, slug);
        if (!rec) return json({ error: 'Not found' }, 404);
        return json({ ok: true, record: rec });
      }
      const slugs = await readIndex(store);
      const records = await Promise.all(slugs.map((s) => readRecord(store, s)));
      const roster = records.filter(Boolean).map(summarise)
        .sort((a, b) => a.name.localeCompare(b.name));
      return json({ ok: true, roster, buildHook: !!process.env.NETLIFY_BUILD_HOOK });
    }

    /* ── writes ── */
    if (req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

      const action = String(body.action || '');
      const target = String(body.slug || '').toLowerCase();
      if (!isSlug(target)) {
        return json({ error: 'Bad slug — lowercase letters, digits and hyphens only' }, 400);
      }
      // Advisory only: self-reported by the browser, forgeable, not an audit
      // trail. Stored as a convenience label. See security-model.md §4.
      const by = clean(body.by, 120);
      const now = new Date().toISOString();

      if (action === 'create') {
        if (await readRecord(store, target)) return json({ error: 'That slug already exists' }, 409);
        const draft = cleanDraft(body.draft);
        if (!draft.identity.name) return json({ error: 'A name is required' }, 400);
        const rec = {
          slug: target,
          status: 'draft',
          draft,
          live: null,
          previewToken: randomToken(),
          createdAt: now,
          updatedAt: now,
          updatedBy: by,
          publishedAt: '',
        };
        await writeRecord(store, target, rec);
        await writeIndex(store, [...(await readIndex(store)), target]);
        return json({ ok: true, record: rec });
      }

      const rec = await readRecord(store, target);
      if (!rec) return json({ error: 'Not found' }, 404);

      if (action === 'save') {
        rec.draft = cleanDraft(body.draft);
        if (!rec.draft.identity.name) return json({ error: 'A name is required' }, 400);
        rec.updatedAt = now;
        rec.updatedBy = by;
        if (!rec.previewToken) rec.previewToken = randomToken();
        await writeRecord(store, target, rec);
        return json({ ok: true, record: rec });
      }

      if (action === 'publish') {
        // Publishing off a stale tab would silently discard the newer draft, so
        // the CMS sends the draft it is looking at and we save it first.
        if (body.draft) {
          rec.draft = cleanDraft(body.draft);
          if (!rec.draft.identity.name) return json({ error: 'A name is required' }, 400);
        }
        rec.live = JSON.parse(JSON.stringify(rec.draft));
        rec.status = 'live';
        rec.publishedAt = now;
        rec.updatedAt = now;
        rec.updatedBy = by;
        await writeRecord(store, target, rec);
        return json({ ok: true, record: rec, build: await triggerBuild(`publish ${target}`) });
      }

      if (action === 'status') {
        const next = String(body.status || '');
        if (!STATUSES.includes(next)) return json({ error: 'Unknown status' }, 400);
        if (next === 'live' && !rec.live) {
          return json({ error: 'Nothing has been published yet — use Publish.' }, 400);
        }
        const was = rec.status;
        rec.status = next;
        rec.updatedAt = now;
        rec.updatedBy = by;
        await writeRecord(store, target, rec);
        // Only a change that alters what the build emits is worth a build.
        const publicBefore = was === 'live';
        const publicAfter = next === 'live';
        const build = publicBefore !== publicAfter
          ? await triggerBuild(`${next} ${target}`)
          : 'skipped';
        return json({ ok: true, record: rec, build });
      }

      if (action === 'rotatePreview') {
        rec.previewToken = randomToken();
        rec.updatedAt = now;
        await writeRecord(store, target, rec);
        return json({ ok: true, record: rec });
      }

      if (action === 'revertDraft') {
        if (!rec.live) return json({ error: 'Nothing published to revert to.' }, 400);
        rec.draft = JSON.parse(JSON.stringify(rec.live));
        rec.updatedAt = now;
        rec.updatedBy = by;
        await writeRecord(store, target, rec);
        return json({ ok: true, record: rec });
      }

      return json({ error: 'Unknown action' }, 400);
    }

    if (req.method === 'DELETE') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
      const target = String(body.slug || '').toLowerCase();
      if (!isSlug(target)) return json({ error: 'Bad slug' }, 400);
      const rec = await readRecord(store, target);
      const wasPublic = !!rec && rec.status === 'live';
      await deleteRecord(store, target);
      await writeIndex(store, (await readIndex(store)).filter((s) => s !== target));
      return json({ ok: true, build: wasPublic ? await triggerBuild(`delete ${target}`) : 'skipped' });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('agent-store fn error:', e);
    return json({ error: 'Function exception', message: e?.message || String(e) }, 500);
  }
};
