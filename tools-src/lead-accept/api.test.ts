// The lead auto-accept page's backend (api.ts): the team-only gate, the secret staying server-side,
// the views it passes through, and the observe-mode switch.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SignUser } from '../property-signs/api.ts';
import { handleLeadAccept, type LeadAcceptDeps } from './api.ts';

const KIMANI: SignUser = { email: 'casacalliste@gmail.com', role: 'admin', guest: false };
const AGENT: SignUser = { email: 'a.ruiz@casa-blanca.com', role: 'agent', guest: false };
const GUEST: SignUser = { email: 'guest@preview', role: 'agent', guest: true };
const BASE = 'https://svc.example';
const SECRET = 's'.repeat(32);

function memGuide() {
  const m = new Map<string, unknown>();
  return { m, get: async (k: string) => m.get(k) ?? null, setJSON: async (k: string, v: unknown) => { m.set(k, v); } };
}
interface Seen { url: string; method: string; secret: string | null; body: string | null }
function deps(user: SignUser | Error, answer: (url: string) => Response = () => Response.json({ ok: true }), over: Partial<LeadAcceptDeps> = {}) {
  const seen: Seen[] = [];
  const d: LeadAcceptDeps = {
    user: async () => { if (user instanceof Error) throw user; return user; },
    baseUrl: BASE + '/', secret: SECRET,
    guideStore: memGuide(),
    fetch: (async (url: string, init: RequestInit = {}) => {
      const h = new Headers(init.headers);
      seen.push({ url, method: init.method ?? 'GET', secret: h.get('x-casa-secret'), body: (init.body as string) ?? null });
      return answer(url);
    }) as typeof fetch,
    ...over,
  };
  return { d, seen };
}
const get = (q: string) => new Request(`https://studio.example/api/lead-accept${q}`);
const post = (body: unknown) => new Request('https://studio.example/api/lead-accept', { method: 'POST', body: JSON.stringify(body) });

test('signed out: the sign-in check’s refusal is passed on', async () => {
  const err = Object.assign(new Error('Sign in to continue.'), { status: 401, code: 'signed_out' });
  const { d, seen } = deps(err);
  const res = await handleLeadAccept(get('?view=status'), d);
  assert.equal(res.status, 401);
  assert.equal(seen.length, 0);
});

test('an agent who isn’t the team is refused, and the service is never called', async () => {
  const { d, seen } = deps(AGENT);
  const res = await handleLeadAccept(get('?view=status'), d);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'not_team');
  assert.equal(seen.length, 0);
});

test('not configured: a 503 that says which variables to set', async () => {
  const { d } = deps(KIMANI, undefined, { secret: undefined });
  const res = await handleLeadAccept(get('?view=status'), d);
  assert.equal(res.status, 503);
  assert.match((await res.json()).message, /SE_AUTOMATION_SECRET/);
});

test('status, runs and agents go to the right endpoints with the secret in a header', async () => {
  const { d, seen } = deps(KIMANI, () => Response.json([{ at: '2026-11-10T21:00:00Z' }]));
  assert.equal((await handleLeadAccept(get('?view=status'), d)).status, 200);
  assert.equal((await handleLeadAccept(get('?view=runs&limit=9999'), d)).status, 200);
  assert.equal((await handleLeadAccept(get('?view=agents'), d)).status, 200);
  assert.deepEqual(seen.map((s) => s.url), [`${BASE}/admin/status`, `${BASE}/admin/runs?limit=500`, `${BASE}/agents`]);
  assert.ok(seen.every((s) => s.secret === SECRET));
  assert.ok(seen.every((s) => !s.url.includes(SECRET)), 'the secret never goes in a URL');
});

test('the secret never reaches the browser', async () => {
  const { d } = deps(KIMANI, () => Response.json({ observeMode: false }));
  const text = await (await handleLeadAccept(get('?view=status'), d)).text();
  assert.ok(!text.includes(SECRET));
});

test('a capture is fetched as PNG; a name that isn’t one is refused before any call', async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const { d, seen } = deps(KIMANI, () => new Response(png));
  const ok = await handleLeadAccept(get('?capture=2026-11-10T21-53-48-123Z_d-tashi_agent-tools'), d);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/png');
  assert.equal(seen[0]?.url, `${BASE}/captures/2026-11-10T21-53-48-123Z_d-tashi_agent-tools.png`);
  for (const bad of ['../settings', 'x.png', '..%2Fruns', '']) {
    assert.equal((await handleLeadAccept(get(`?capture=${encodeURIComponent(bad)}`), d)).status, 400, bad);
  }
  assert.equal(seen.length, 1);
});

test('observe mode: the team switches it; a guest can look but not switch; a bad body is refused', async () => {
  const { d, seen } = deps(KIMANI, () => Response.json({ observeMode: true }));
  const res = await handleLeadAccept(post({ observeMode: true }), d);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { observeMode: true });
  assert.equal(seen[0]?.url, `${BASE}/admin/settings`);
  assert.equal(seen[0]?.method, 'POST');
  assert.equal(seen[0]?.body, JSON.stringify({ observeMode: true }));
  assert.equal((await handleLeadAccept(post({ observeMode: 'yes' }), d)).status, 400);

  const g = deps(GUEST);
  assert.equal((await handleLeadAccept(get('?view=status'), g.d)).status, 200);
  assert.equal((await handleLeadAccept(post({ observeMode: false }), g.d)).status, 403);
});

test('the service refusing the key, or not answering, comes back as a message to act on', async () => {
  const refused = deps(KIMANI, () => new Response('unauthorized', { status: 401 }));
  const r1 = await handleLeadAccept(get('?view=status'), refused.d);
  assert.equal(r1.status, 502);
  assert.equal((await r1.json()).error, 'secret_mismatch');

  const down = deps(KIMANI, undefined, { fetch: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch });
  const r2 = await handleLeadAccept(get('?view=status'), down.d);
  assert.equal(r2.status, 502);
  assert.equal((await r2.json()).error, 'unreachable');
});

test('an agent’s own password: the team sets or clears it; it goes only to the service, never back or into a log', async () => {
  const pw = 'Hunter2-correct-horse';
  const logged: string[] = [];
  const orig = console.log; console.log = (...a: unknown[]) => { logged.push(a.join(' ')); };
  try {
    const { d, seen } = deps(KIMANI, () => Response.json({ email: 'j.f@casa-blanca.com', hasOwnPassword: true }));
    const res = await handleLeadAccept(post({ agentPassword: { email: 'j.f@casa-blanca.com', password: pw } }), d);
    assert.equal(res.status, 200);
    assert.ok(!(await res.text()).includes(pw));
    assert.equal(seen[0]!.url, `${BASE}/admin/agents/password`);
    assert.deepEqual(JSON.parse(seen[0]!.body!), { email: 'j.f@casa-blanca.com', password: pw });
    assert.equal((await handleLeadAccept(post({ agentPassword: { email: 'j.f@casa-blanca.com', password: null } }), d)).status, 200);
    assert.equal(JSON.parse(seen[1]!.body!).password, null);
    assert.ok(logged.every((l) => !l.includes(pw)), 'the password is never logged');
  } finally { console.log = orig; }

  const { d } = deps(KIMANI);
  assert.equal((await handleLeadAccept(post({ agentPassword: { email: 'nobody', password: 'x' } }), d)).status, 400);
  assert.equal((await handleLeadAccept(post({ agentPassword: { email: 'a@b.com', password: '' } }), d)).status, 400);
  assert.equal((await handleLeadAccept(post({ agentPassword: { email: 'a@b.com', password: 'x'.repeat(201) } }), d)).status, 400);
  assert.equal((await handleLeadAccept(post({ agentPassword: { email: 'a@b.com', password: 'x' } }), deps(GUEST).d)).status, 403);
  assert.equal((await handleLeadAccept(post({ agentPassword: { email: 'a@b.com', password: 'x' } }), deps(AGENT).d)).status, 403);
});

test('adding an agent by hand: email required, password optional and never echoed or logged', async () => {
  const pw = 'Another-secret-77';
  const logged: string[] = [];
  const orig = console.log; console.log = (...a: unknown[]) => { logged.push(a.join(' ')); };
  try {
    const { d, seen } = deps(KIMANI, () => Response.json({ email: 'j.new@email.casa-blanca.com', name: 'J. New', added: true, hasOwnPassword: true }, { status: 201 }));
    const res = await handleLeadAccept(post({ addAgent: { email: ' j.new@email.casa-blanca.com ', name: 'J. New', password: pw } }), d);
    assert.equal(res.status, 201);
    assert.ok(!(await res.text()).includes(pw));
    assert.equal(seen[0]!.url, `${BASE}/admin/agents`);
    assert.deepEqual(JSON.parse(seen[0]!.body!), { email: 'j.new@email.casa-blanca.com', name: 'J. New', password: pw });
    await handleLeadAccept(post({ addAgent: { email: 'k@x.com' } }), d);
    assert.deepEqual(JSON.parse(seen[1]!.body!), { email: 'k@x.com', name: '', password: null });
    assert.ok(logged.every((l) => !l.includes(pw)));
  } finally { console.log = orig; }
  const { d } = deps(KIMANI);
  assert.equal((await handleLeadAccept(post({ addAgent: { email: 'not-an-email' } }), d)).status, 400);
  assert.equal((await handleLeadAccept(post({ addAgent: { email: 'a@b.com', password: 'x'.repeat(201) } }), d)).status, 400);
  assert.equal((await handleLeadAccept(post({ addAgent: { email: 'a@b.com' } }), deps(GUEST).d)).status, 403);
});


test('alert recipients: validated, de-duplicated, passed to the service; guests refused', async () => {
  const { d, seen } = deps(KIMANI, () => Response.json({ recipients: {} }));
  const ok = await handleLeadAccept(post({ recipients: { failures: [' D.Prestly@casa-blanca.com', 'success@casa-blanca.com', 'd.prestly@casa-blanca.com'] } }), d);
  assert.equal(ok.status, 200);
  assert.equal(seen[0].url, `${BASE}/admin/settings`);
  assert.deepEqual(JSON.parse(seen[0].body!), { recipients: { failures: ['d.prestly@casa-blanca.com', 'success@casa-blanca.com'] } });
  assert.equal((await handleLeadAccept(post({ recipients: { failures: ['not an email'] } }), d)).status, 400);
  assert.equal((await handleLeadAccept(post({ recipients: { everyone: ['a@b.com'] } }), d)).status, 400);
  assert.equal((await handleLeadAccept(post({ recipients: { failures: ['a@b.com'] } }), deps(GUEST).d)).status, 403);
  assert.equal(seen.length, 1);
});

test('the guide: the default until saved, then the saved one; cleaned; works with the service down; guests read only', async () => {
  const down = { fetch: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch };
  const { d } = deps(KIMANI, undefined, down);
  const first = await (await handleLeadAccept(get('?view=guide'), d)).json();
  assert.equal(first.isDefault, true);
  assert.ok(first.steps.length >= 5);

  const edited = { intro: 'Hi Erez', steps: [{ title: 'One', summary: 'S', details: ['a', '', 'b'] }, { title: '', summary: 'dropped' }],
    sections: [{ title: 'Where', body: '- x' }], links: [{ name: 'Make', url: 'https://make.com' }, { name: 'Bad', url: 'javascript:alert(1)' }] };
  const saved = await handleLeadAccept(post({ guide: edited }), d);
  assert.equal(saved.status, 200);
  const back = await (await handleLeadAccept(get('?view=guide'), d)).json();
  assert.equal(back.isDefault, false);
  assert.equal(back.intro, 'Hi Erez');
  assert.deepEqual(back.steps, [{ title: 'One', summary: 'S', details: ['a', 'b'] }]);
  assert.deepEqual(back.links, [{ name: 'Make', url: 'https://make.com' }], 'non-web links are dropped');
  assert.equal(back.updatedBy, KIMANI.email);

  assert.equal((await handleLeadAccept(post({ guide: { steps: [], sections: [], links: [] } }), d)).status, 400);
  assert.equal((await handleLeadAccept(post({ guide: edited }), deps(GUEST).d)).status, 403);
  assert.equal((await handleLeadAccept(get('?view=guide'), deps(AGENT).d)).status, 403);
});
