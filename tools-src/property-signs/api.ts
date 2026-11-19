// /api/property-signs — what the Property Sign builder (tools/property-sign/) reads and keeps.
//
// The tool was built on its own (PR #129) and left five hooks for the Studio; this is them:
//   1–2. The Name field searches Casa's roster: the agent CMS's records (`cb-agents`), with the
//        square headshot the profile-pic generator stored (`cb-agent-pics`). Picking an agent
//        fills their name, email, phone (xxx.xxx.xxxx) and photo.
//   3.   Every PDF or PNG download saves the sign: the fields, the photos as used, the address,
//        when and by whom, and the PDF itself.
//   4.   An agent who already has a sign shows it in the search, and it loads back.
//   5.   The order email's default message is kept here, so it follows Kimani between browsers.
//
// SECURITY
//   Every request needs the Studio sign-in (the comp report's Identity session, checked by the
//   comp report's own requireUser), and the signed-in user must be the Studio's team: a comp
//   report admin, a preview's guest, or one of the old four team emails (assets/studio-auth.js
//   applies the same rule to show the page; that's a door, this is the lock). The roster holds
//   agents' direct phones and emails, which is why the CMS's records are read only here, on
//   the server, and only the fields a sign prints are sent.
import type { FileBlobs } from '../agent-pics/files.ts';
import { readPart } from '../agent-pics/files.ts';
import { readPic, type StoredFile } from '../agent-pics/record.ts';

export const SIGNS_STORE = 'cb-property-signs';

/** The old dev sign-in's list, as assets/studio-auth.js keeps it. */
export const TEAM_EMAILS = ['creative@email.casa-blanca.com', 'derek@casa-blanca.com', 'd.prestly@casa-blanca.com', 'emma@casa-blanca.com', 'erez@casa-blanca.com'];

export interface SignUser { email: string; role: string; guest: boolean; team?: boolean }

/** team: the comp report's answer (a team grant from the Access panel counts); the rest for older callers. */
export const isTeam = (u: SignUser) => u.team === true || u.role === 'admin' || u.guest || TEAM_EMAILS.includes(u.email.trim().toLowerCase());

/** What this reads of the roster: the same shape as the comp report's (server/agent-card.ts). */
export interface Roster {
  slugs(): Promise<string[]>;
  record(slug: string): Promise<unknown>;
  files: FileBlobs;
}

/** The part of a Blobs store this uses. */
export interface SignBlobs {
  get(key: string, opts: { type: 'text' }): Promise<string | null>;
  getWithMetadata(key: string, opts: { type: 'arrayBuffer' }): Promise<{ data: ArrayBuffer; metadata: Record<string, unknown> } | null>;
  set(key: string, value: string | ArrayBuffer, opts?: { metadata?: Record<string, unknown> }): Promise<unknown>;
}

export interface SignDeps {
  /** The signed-in user; throws a SignError(401/403/503) when there's none. */
  user(req: Request): Promise<SignUser>;
  roster: Roster;
  store: SignBlobs;
  now: () => number;
}

export class SignError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message?: string) { super(message ?? code); this.status = status; this.code = code; }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const bytes = (data: ArrayBuffer, type: string, name?: string) => new Response(data, {
  headers: {
    'Content-Type': type, 'Cache-Control': 'private, no-store',
    ...(name ? { 'Content-Disposition': `attachment; filename="${name}"` } : {}),
  },
});

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
/** Plain text: controls and angle brackets out, trimmed, capped. */
export const text = (v: unknown, max = 160): string =>
  (typeof v === 'string' ? v : '').replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F<>]/g, '').trim().slice(0, max);

/** Casa's phone format, 917.388.0550, from anything with ten digits (or eleven with a leading 1); else as given. */
export function formatPhone(v: string): string {
  let d = v.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length === 10 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}` : v.trim();
}

/** The square headshots that suit the sign, best first: the clean square is the one the template uses. */
export const SIGN_HEADSHOTS = ['SQ2_Clean', 'SQ5_ColorClean', 'SQ1_GrayLogo', 'SQ6_ColorLogo'];
/** A response can carry about 6 MB; the generator's outputs are far under this. */
export const MAX_PHOTO = 5 * 1024 * 1024;

export interface RosterAgent {
  slug: string;
  name: string;
  email: string;
  phone: string;
  /** The stored headshot used for a sign, or null. Not sent: the client asks ?photo=<slug>. */
  headshot: StoredFile | null;
}

/** One roster record as the sign needs it: the draft first, then live. Archived agents and nameless records are left out. */
export function rosterAgent(slug: string, rec: unknown): RosterAgent | null {
  if (!isObject(rec) || rec.status === 'archived') return null;
  const sides = [rec.draft, rec.live].filter(isObject);
  const pick = (group: string, field: string) =>
    sides.map((s) => (isObject(s[group]) ? text((s[group] as Record<string, unknown>)[field]) : '')).find(Boolean) ?? '';
  const name = pick('identity', 'name');
  if (!name) return null;
  const outputs = readPic(rec.pic).outputs;
  const headshot = SIGN_HEADSHOTS.map((v) => outputs.find((o) => o.variant === v)).find(Boolean) ?? null;
  return {
    slug,
    name,
    email: pick('contact', 'email').toLowerCase(),
    phone: formatPhone(pick('contact', 'phone')),
    headshot: headshot && headshot.bytes > 0 && headshot.bytes <= MAX_PHOTO && /^image\/(jpeg|png)$/.test(headshot.type) ? headshot : null,
  };
}

const ROSTER_MS = 60_000;
let rosterCache: { at: number; agents: RosterAgent[] } | null = null;
/** For tests. */
export function forgetRoster(): void { rosterCache = null; }

/** Every agent, read a few at a time, sorted by name; kept a minute so typing in the search costs nothing. */
export async function readRoster(roster: Roster, now: number, atOnce = 8): Promise<RosterAgent[]> {
  if (rosterCache && now - rosterCache.at < ROSTER_MS) return rosterCache.agents;
  const slugs = await roster.slugs();
  const out: RosterAgent[] = [];
  let next = 0;
  const worker = async () => {
    while (next < slugs.length) {
      const slug = slugs[next++]!;
      const a = rosterAgent(slug, await roster.record(slug).catch(() => null));
      if (a) out.push(a);
    }
  };
  await Promise.all(Array.from({ length: Math.min(atOnce, slugs.length) }, worker));
  out.sort((a, b) => a.name.localeCompare(b.name));
  rosterCache = { at: now, agents: out };
  return out;
}

async function fileBytes(files: FileBlobs, slug: string, f: StoredFile): Promise<ArrayBuffer | null> {
  const parts: ArrayBuffer[] = [];
  for (let n = 0; n < f.parts; n++) {
    const p = await readPart(files, slug, f.key, n);
    if (!p) return null;
    parts.push(p);
  }
  const out = new Uint8Array(parts.reduce((t, p) => t + p.byteLength, 0));
  if (out.byteLength !== f.bytes) return null;
  let at = 0;
  for (const p of parts) { out.set(new Uint8Array(p), at); at += p.byteLength; }
  return out.buffer;
}

/* ─────────────────────────── saved signs ─────────────────────────── */

export const LAYOUTS = ['single', 'double'] as const;
export interface SignAgent { slug: string | null; name: string; email: string; emailCustom: boolean; phone: string }
export interface SignRecord {
  id: string;
  at: string;
  by: string;
  layout: (typeof LAYOUTS)[number];
  address: string;
  bleed: boolean;
  agents: SignAgent[];
  /** Which agents' photos are stored (p/<id>/<i>). */
  photos: boolean[];
  pdf: boolean;
}
export type SignSummary = Pick<SignRecord, 'id' | 'at' | 'by' | 'layout' | 'address' | 'pdf'> & { agents: { slug: string | null; name: string }[] };

const INDEX = 'index';
const TEMPLATE = 'template';
const ID_RE = /^[a-f0-9]{24}$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
export const MAX_SAVE = 4 * 1024 * 1024;
export const MAX_PDF = 5.5 * 1024 * 1024;
export const MAX_TEMPLATE = 4000;
const MAX_INDEX = 3000;

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 24);
export const nameKey = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

async function readIndex(store: SignBlobs): Promise<SignSummary[]> {
  const raw = await store.get(INDEX, { type: 'text' });
  try { const v = raw ? JSON.parse(raw) as unknown : []; return Array.isArray(v) ? v as SignSummary[] : []; } catch { return []; }
}
const summary = (r: SignRecord): SignSummary => ({
  id: r.id, at: r.at, by: r.by, layout: r.layout, address: r.address, pdf: r.pdf,
  agents: r.agents.map((a) => ({ slug: a.slug, name: a.name })),
});
async function writeRecord(store: SignBlobs, r: SignRecord): Promise<void> {
  await store.set(`s/${r.id}`, JSON.stringify(r));
  const index = (await readIndex(store)).filter((s) => s.id !== r.id);
  index.unshift(summary(r));
  await store.set(INDEX, JSON.stringify(index.slice(0, MAX_INDEX)));
}
async function readRecord(store: SignBlobs, id: string): Promise<SignRecord | null> {
  if (!ID_RE.test(id)) return null;
  const raw = await store.get(`s/${id}`, { type: 'text' });
  try { return raw ? JSON.parse(raw) as SignRecord : null; } catch { return null; }
}

/** A JPEG or PNG data URL's bytes, or null. */
function dataUrlBytes(v: unknown): { data: ArrayBuffer; type: string } | null {
  if (typeof v !== 'string') return null;
  const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(v);
  if (!m) return null;
  const buf = Buffer.from(m[2]!, 'base64');
  return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, type: m[1]! };
}

/** The sign's fields from a save request, cleaned field by field; anything else in the body is ignored. */
export function readSign(b: Record<string, unknown>): Omit<SignRecord, 'id' | 'at' | 'by' | 'photos' | 'pdf'> {
  const layout = b.layout === 'double' ? 'double' : 'single';
  const list = Array.isArray(b.agents) ? b.agents.slice(0, layout === 'double' ? 2 : 1) : [];
  const agents = list.map((a): SignAgent => {
    const o = isObject(a) ? a : {};
    const slug = typeof o.slug === 'string' && SLUG_RE.test(o.slug) ? o.slug : null;
    return { slug, name: text(o.name, 80), email: text(o.email, 120).toLowerCase(), emailCustom: o.emailCustom === true, phone: text(o.phone, 20) };
  });
  if (!agents.some((a) => a.name)) throw new SignError(400, 'no_agent', 'A sign needs an agent’s name.');
  return { layout, address: text(b.address, 200), bleed: b.bleed === true, agents };
}

async function readBody(req: Request, max: number): Promise<ArrayBuffer> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) throw new SignError(413, 'too_large');
  const buf = await req.arrayBuffer();
  if (buf.byteLength > max) throw new SignError(413, 'too_large');
  return buf;
}
async function readJson(req: Request, max: number): Promise<Record<string, unknown>> {
  const raw = new TextDecoder().decode(await readBody(req, max));
  let v: unknown;
  try { v = JSON.parse(raw || '{}'); } catch { throw new SignError(400, 'invalid_json'); }
  if (!isObject(v)) throw new SignError(400, 'invalid_body');
  return v;
}

/** The latest sign for each agent: by roster slug, and by name for one typed in by hand. */
export function latestByAgent(index: SignSummary[]): { bySlug: Map<string, SignSummary>; byName: Map<string, SignSummary> } {
  const bySlug = new Map<string, SignSummary>(), byName = new Map<string, SignSummary>();
  for (const s of index) {                                   // newest first, so the first seen wins
    for (const a of s.agents) {
      if (a.slug && !bySlug.has(a.slug)) bySlug.set(a.slug, s);
      const k = nameKey(a.name);
      if (k && !byName.has(k)) byName.set(k, s);
    }
  }
  return { bySlug, byName };
}

/* ───────────────────────────── handler ───────────────────────────── */

export async function handleSigns(req: Request, deps: SignDeps): Promise<Response> {
  try {
    const user = await deps.user(req);
    if (!isTeam(user)) throw new SignError(403, 'not_team', 'The Property Sign builder is for the Studio team.');
    const url = new URL(req.url);
    const q = (k: string) => url.searchParams.get(k);

    if (req.method === 'GET') {
      // ?photo=<slug>: the roster headshot's bytes.
      if (q('photo') !== null && q('sign') === null) {
        const slug = q('photo')!;
        const agent = (await readRoster(deps.roster, deps.now())).find((a) => a.slug === slug);
        if (!agent?.headshot) throw new SignError(404, 'no_photo');
        const data = await fileBytes(deps.roster.files, slug, agent.headshot);
        if (!data) throw new SignError(404, 'no_photo');
        return bytes(data, agent.headshot.type);
      }
      // ?sign=<id>: a saved sign; with &photo=<i> one of its photos, with &pdf=1 its PDF.
      if (q('sign') !== null) {
        const rec = await readRecord(deps.store, q('sign')!);
        if (!rec) throw new SignError(404, 'no_sign');
        if (q('photo') !== null) {
          const i = Number(q('photo'));
          if (!rec.photos[i]) throw new SignError(404, 'no_photo');
          const got = await deps.store.getWithMetadata(`p/${rec.id}/${i}`, { type: 'arrayBuffer' });
          if (!got) throw new SignError(404, 'no_photo');
          return bytes(got.data, String(got.metadata.contentType || 'image/jpeg'));
        }
        if (q('pdf') !== null) {
          const got = rec.pdf ? await deps.store.getWithMetadata(`pdf/${rec.id}`, { type: 'arrayBuffer' }) : null;
          if (!got) throw new SignError(404, 'no_pdf');
          return bytes(got.data, 'application/pdf', `for-sale-sign-${rec.id}.pdf`);
        }
        return json({ sign: rec });
      }
      // The roster, each agent's latest sign, the recent signs and the default message.
      const [agents, index, tpl] = await Promise.all([
        readRoster(deps.roster, deps.now()), readIndex(deps.store), deps.store.get(TEMPLATE, { type: 'text' }),
      ]);
      const { bySlug, byName } = latestByAgent(index);
      const brief = (s: SignSummary | undefined) => s ? { id: s.id, at: s.at, address: s.address } : null;
      let template: { text: string; at: string; by: string } | null = null;
      try { template = tpl ? JSON.parse(tpl) : null; } catch { template = null; }
      return json({
        agents: agents.map((a) => ({
          slug: a.slug, name: a.name, email: a.email, phone: a.phone, photo: Boolean(a.headshot),
          sign: brief(bySlug.get(a.slug) ?? byName.get(nameKey(a.name))),
        })),
        signs: index.slice(0, 60),
        template,
      });
    }

    if (req.method === 'POST') {
      // ?sign=<id>&pdf=1, the PDF's bytes as the body: attached to a sign saved a moment ago.
      if (q('sign') !== null && q('pdf') !== null) {
        const rec = await readRecord(deps.store, q('sign')!);
        if (!rec) throw new SignError(404, 'no_sign');
        const data = await readBody(req, MAX_PDF);
        if (new TextDecoder().decode(new Uint8Array(data.slice(0, 5))) !== '%PDF-') throw new SignError(400, 'not_pdf');
        await deps.store.set(`pdf/${rec.id}`, data, { metadata: { contentType: 'application/pdf' } });
        if (!rec.pdf) await writeRecord(deps.store, { ...rec, pdf: true });
        return json({ ok: true });
      }
      const b = await readJson(req, MAX_SAVE);
      if (b.action === 'save') {
        const sign = readSign(b);
        const photos = Array.isArray(b.photos) ? b.photos : [];
        const rec: SignRecord = {
          ...sign, id: newId(), at: new Date(deps.now()).toISOString(), by: user.email.toLowerCase(),
          photos: sign.agents.map((_, i) => Boolean(dataUrlBytes(photos[i]))), pdf: false,
        };
        for (let i = 0; i < sign.agents.length; i++) {
          const p = dataUrlBytes(photos[i]);
          if (p) await deps.store.set(`p/${rec.id}/${i}`, p.data, { metadata: { contentType: p.type } });
        }
        await writeRecord(deps.store, rec);
        return json({ sign: summary(rec) });
      }
      if (b.action === 'template') {
        const t = typeof b.text === 'string' ? b.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') : '';
        if (t.length > MAX_TEMPLATE) throw new SignError(413, 'too_large');
        const template = t.trim() ? { text: t, at: new Date(deps.now()).toISOString(), by: user.email.toLowerCase() } : null;
        await deps.store.set(TEMPLATE, JSON.stringify(template));
        return json({ template });
      }
      throw new SignError(400, 'unknown_action');
    }
    throw new SignError(405, 'method_not_allowed');
  } catch (e) {
    if (e instanceof SignError) return json({ error: e.code, message: e.message }, e.status);
    if (e && typeof e === 'object' && 'status' in e && 'code' in e && typeof (e as { status: unknown }).status === 'number') {
      const h = e as { status: number; code: string; message?: string };   // the comp report's HttpError, from the sign-in check
      return json({ error: h.code, message: h.message }, h.status);
    }
    console.error('property-signs: unhandled error', e);
    return json({ error: 'internal', message: 'Something went wrong on our side.' }, 500);
  }
}
