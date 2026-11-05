// The Property Sign builder's backend (api.ts): the team-only gate, the roster as a sign needs
// it, saved signs and their files, and the shared default message.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { FileBlobs } from '../agent-pics/files.ts';
import { forgetRoster, formatPhone, handleSigns, rosterAgent, type Roster, type SignBlobs, type SignDeps, type SignUser } from './api.ts';

const KEY = 'b'.repeat(24);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5, 6, 7]);
const out = (variant: string, key: string, type = 'image/jpeg', bytes = 10, parts = 2) => ({
  key, kind: 'output', filename: `x_${variant}.jpg`, type, bytes, parts, uploadedAt: '2026-10-01T00:00:00.000Z',
  capturedAt: '', width: 1080, height: 1080, variant,
});
const sam = {
  slug: 'sam-v', status: 'published',
  draft: { identity: { name: 'Sam Valk' }, contact: { email: 'Sam@Casa-Blanca.com', phone: '(212) 555-0101' } },
  live: { identity: { name: 'Sam Valk (old)' }, contact: { email: 'sam@casa-blanca.com' } },
  pic: { outputs: [out('R4_Clean', 'd'.repeat(24)), out('SQ2_Clean', KEY)] },
};
const ana = { slug: 'ana-r', draft: { identity: { name: 'Ana Ruiz' }, contact: { email: 'a.ruiz@casa-blanca.com', phone: '' } } };

function memStore(): SignBlobs & { m: Map<string, { v: string | ArrayBuffer; meta?: Record<string, unknown> }> } {
  const m = new Map<string, { v: string | ArrayBuffer; meta?: Record<string, unknown> }>();
  return {
    m,
    get: async (k) => { const e = m.get(k); return e && typeof e.v === 'string' ? e.v : null; },
    getWithMetadata: async (k) => { const e = m.get(k); return e && typeof e.v !== 'string' ? { data: e.v, metadata: e.meta ?? {} } : null; },
    set: async (k, v, o) => { m.set(k, { v, meta: o?.metadata }); },
  };
}
function roster(records: Record<string, unknown>): Roster {
  const blobs = new Map<string, ArrayBuffer>([
    [`f/sam-v/${KEY}/0000`, JPEG.slice(0, 6).buffer],
    [`f/sam-v/${KEY}/0001`, JPEG.slice(6).buffer],
  ]);
  const files = { get: async (k: string) => blobs.get(k) ?? null } as unknown as FileBlobs;
  return { slugs: async () => Object.keys(records), record: async (s) => records[s] ?? null, files };
}
const KIMANI: SignUser = { email: 'casacalliste@gmail.com', role: 'admin', guest: false };
const AGENT: SignUser = { email: 'a.ruiz@casa-blanca.com', role: 'agent', guest: false };

function deps(user: SignUser | null = KIMANI, store = memStore()): SignDeps & { store: ReturnType<typeof memStore> } {
  return {
    user: async () => { if (!user) throw Object.assign(new Error('Sign in'), { status: 401, code: 'signed_out' }); return user; },
    roster: roster({ 'sam-v': sam, 'ana-r': ana, 'old': { ...ana, status: 'archived' } }),
    store, now: () => Date.parse('2026-11-05T21:00:00Z'),
  };
}
const get = (d: SignDeps, qs = '') => handleSigns(new Request(`https://studio.test/api/property-signs${qs}`), d);
const post = (d: SignDeps, body: unknown, qs = '') => handleSigns(new Request(`https://studio.test/api/property-signs${qs}`, {
  method: 'POST', body: body instanceof Uint8Array ? (body as unknown as BodyInit) : JSON.stringify(body),
}), d);

beforeEach(() => forgetRoster());

test('signed out is 401; signed in but not the team is 403', async () => {
  assert.equal((await get(deps(null))).status, 401);
  const r = await get(deps(AGENT));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'not_team');
  assert.equal((await get(deps({ email: 'Erez@casa-blanca.com', role: 'agent', guest: false }))).status, 200);
  assert.equal((await get(deps({ email: 'guest@x', role: 'agent', guest: true }))).status, 200);
});

test('the roster: draft first, the phone in Casa’s format, the clean square headshot, archived agents left out', async () => {
  const a = rosterAgent('sam-v', sam)!;
  assert.equal(a.name, 'Sam Valk');
  assert.equal(a.email, 'sam@casa-blanca.com');
  assert.equal(a.phone, '212.555.0101');
  assert.equal(a.headshot?.variant, 'SQ2_Clean');
  assert.equal(rosterAgent('x', { ...sam, pic: { outputs: [out('R4_Clean', KEY)] } })?.headshot, null);
  assert.equal(formatPhone('1 (917) 388-0550'), '917.388.0550');
  const body = await (await get(deps())).json();
  assert.deepEqual(body.agents.map((x: { slug: string }) => x.slug), ['ana-r', 'sam-v']);
  assert.deepEqual(body.agents[1], { slug: 'sam-v', name: 'Sam Valk', email: 'sam@casa-blanca.com', phone: '212.555.0101', photo: true, sign: null });
  assert.equal(body.agents[0].photo, false);
  const photo = await get(deps(), '?photo=sam-v');
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), JPEG);
  assert.equal((await get(deps(), '?photo=ana-r')).status, 404);
});

test('a download saves the sign: fields cleaned, photos and PDF stored, the agent shows it in the search', async () => {
  const d = deps();
  const photo = `data:image/jpeg;base64,${Buffer.from(JPEG).toString('base64')}`;
  const saved = await post(d, {
    action: 'save', layout: 'double', address: '10 Hubert St, Tribeca, NY 10013', bleed: true, kind: 'pdf',
    agents: [{ slug: 'sam-v', name: 'Sam Valk', email: 'sam@casa-blanca.com', phone: '212.555.0101' },
      { slug: null, name: 'Zoë <b>Hand</b>', email: 'z.hand@casa-blanca.com', emailCustom: true, phone: '' }, { name: 'third' }],
    photos: [photo, 'data:text/html;base64,PGI+'],
    extra: 'ignored',
  });
  assert.equal(saved.status, 200);
  const { sign } = await saved.json();
  assert.equal(sign.agents.length, 2);
  assert.equal(sign.agents[1].name, 'Zoë bHand/b');
  const pdf = new TextEncoder().encode('%PDF-1.7 test');
  assert.equal((await post(d, pdf, `?sign=${sign.id}&pdf=1`)).status, 200);
  assert.equal((await post(d, new TextEncoder().encode('nope'), `?sign=${sign.id}&pdf=1`)).status, 400);

  const rec = (await (await get(d, `?sign=${sign.id}`)).json()).sign;
  assert.deepEqual(rec.photos, [true, false]);
  assert.equal(rec.pdf, true);
  assert.equal(rec.by, 'casacalliste@gmail.com');
  assert.equal(rec.agents[1].emailCustom, true);
  assert.deepEqual(new Uint8Array(await (await get(d, `?sign=${sign.id}&photo=0`)).arrayBuffer()), JPEG);
  assert.equal((await get(d, `?sign=${sign.id}&photo=1`)).status, 404);
  assert.equal((await get(d, `?sign=${sign.id}&pdf=1`)).headers.get('content-type'), 'application/pdf');

  const body = await (await get(d)).json();
  assert.equal(body.agents.find((a: { slug: string }) => a.slug === 'sam-v').sign.id, sign.id);
  assert.equal(body.signs[0].id, sign.id);
  assert.equal(body.signs[0].pdf, true);
  assert.equal((await get(d, '?sign=../index')).status, 404);
});

test('an agent typed by hand matches their roster record by name; a sign needs a name', async () => {
  const d = deps();
  await post(d, { action: 'save', layout: 'single', agents: [{ name: 'ana  ruiz', email: '', phone: '' }] });
  const body = await (await get(d)).json();
  assert.ok(body.agents.find((a: { slug: string }) => a.slug === 'ana-r').sign);
  assert.equal((await post(d, { action: 'save', agents: [{ name: ' ' }] })).status, 400);
});

test('the default message is shared; empty restores the original', async () => {
  const d = deps();
  const r = await (await post(d, { action: 'template', text: 'Hi Matthew, {agents} at {address}' })).json();
  assert.equal(r.template.text, 'Hi Matthew, {agents} at {address}');
  assert.equal((await (await get(d)).json()).template.text, 'Hi Matthew, {agents} at {address}');
  await post(d, { action: 'template', text: '  ' });
  assert.equal((await (await get(d)).json()).template, null);
  assert.equal((await post(d, { action: 'template', text: 'x'.repeat(5000) })).status, 413);
});
