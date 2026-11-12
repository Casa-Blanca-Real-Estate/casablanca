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
  assert.equal(seen[0]!.url, `${BASE}/admin/settings`);
  assert.deepEqual(JSON.parse(seen[0]!.body!), { recipients: { failures: ['d.prestly@casa-blanca.com', 'success@casa-blanca.com'] } });
  assert.equal((await handleLeadAccept(post({ recipients: { failures: ['not an email'] } }), d)).status, 400);
  assert.equal((await handleLeadAccept(post({ recipients: { everyone: ['a@b.com'] } }), d)).status, 400);
  assert.equal((await handleLeadAccept(post({ recipients: { failures: ['a@b.com'] } }), deps(GUEST).d)).status, 403);
  assert.equal(seen.length, 1);
});

test('FileMaker email: validated, passed to the service; guests and agents refused before any call', async () => {
  const { d, seen } = deps(KIMANI, () => Response.json({ observeMode: false, fileMaker: { emailOn: true, emailTo: 'fm@example.com' } }));
  const ok = await handleLeadAccept(post({ fileMaker: { emailOn: true, emailTo: ' FM@Example.com ' } }), d);
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).fileMaker, { emailOn: true, emailTo: 'fm@example.com' });
  assert.equal(seen[0]!.url, `${BASE}/admin/settings`);
  assert.equal(seen[0]!.method, 'POST');
  assert.deepEqual(JSON.parse(seen[0]!.body!), { fileMaker: { emailOn: true, emailTo: 'fm@example.com' } });
  assert.equal((await handleLeadAccept(post({ fileMaker: { emailOn: false } }), d)).status, 200);
  assert.deepEqual(JSON.parse(seen[1]!.body!), { fileMaker: { emailOn: false } });
  for (const bad of [{ emailOn: 'yes' }, { emailTo: 'not an email' }, { emailTo: 7 }, {}, { emailOn: true, pullKey: 'x' }, null, [true]]) {
    assert.equal((await handleLeadAccept(post({ fileMaker: bad }), d)).status, 400, JSON.stringify(bad));
  }
  assert.equal(seen.length, 2, 'refused requests never reach the service');
  const g = deps(GUEST), a = deps(AGENT);
  assert.equal((await handleLeadAccept(post({ fileMaker: { emailOn: true } }), g.d)).status, 403);
  assert.equal((await handleLeadAccept(post({ fileMaker: { emailOn: true } }), a.d)).status, 403);
  assert.equal(g.seen.length + a.seen.length, 0);
});

test('inbox: limit clamped, kind checked, passed through with the secret; client details never logged', async () => {
  const msg = { at: '2026-11-12T15:00:00Z', kind: 'other', from: 'noreply@streeteasy.com', subject: 'New message',
    message: { type: 'client-message', address: '12 Example St #3', clientName: 'Pat Sample', message: 'Is it still available?', needsResponse: true } };
  const logged: string[] = [];
  const orig = console.log; console.log = (...a: unknown[]) => { logged.push(a.join(' ')); };
  try {
    const { d, seen } = deps(KIMANI, () => Response.json([msg]));
    const res = await handleLeadAccept(get('?view=inbox&limit=9999&kind=other'), d);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [msg]);
    await handleLeadAccept(get('?view=inbox'), d);
    await handleLeadAccept(get('?view=inbox&limit=0&kind=lead'), d);
    assert.deepEqual(seen.map((s) => s.url), [`${BASE}/admin/inbox?limit=500&kind=other`, `${BASE}/admin/inbox?limit=50`, `${BASE}/admin/inbox?limit=50&kind=lead`]);
    assert.ok(seen.every((s) => s.secret === SECRET));
    assert.equal((await handleLeadAccept(get('?view=inbox&kind=everything'), d)).status, 400);
    assert.equal((await handleLeadAccept(get('?view=inbox&kind=other%26x%3D1'), d)).status, 400);
    assert.equal(seen.length, 3);
    assert.ok(logged.every((l) => !l.includes('Pat Sample')));
  } finally { console.log = orig; }
  assert.equal((await handleLeadAccept(get('?view=inbox&kind=other'), deps(GUEST).d)).status, 200, 'a guest can read');
  const a = deps(AGENT);
  assert.equal((await handleLeadAccept(get('?view=inbox'), a.d)).status, 403);
  assert.equal(a.seen.length, 0);
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

// ---------- the Make panel ----------
const MAKE_TOKEN = 'mk-' + 't'.repeat(30);
const MAKE = 'https://us2.make.com/api/v2';
interface MakeSeen { url: string; method: string; auth: string | null }
function makeDeps(user: SignUser, answer: (url: string, method: string) => Response, over: Partial<LeadAcceptDeps> = {}) {
  const seen: MakeSeen[] = [];
  const d: LeadAcceptDeps = {
    user: async () => user, baseUrl: undefined, secret: undefined, guideStore: memGuide(), makeToken: MAKE_TOKEN,
    fetch: (async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      seen.push({ url, method, auth: new Headers(init.headers).get('authorization') });
      return answer(url, method);
    }) as typeof fetch,
    ...over,
  };
  return { d, seen };
}
/** Make's answers, in the shapes its API reference documents. */
function makeApi(over: { connectionExpire?: string | null; alertsActive?: boolean; alertsLastOk?: boolean } = {}) {
  return (url: string, method: string): Response => {
    const path = url.slice(MAKE.length);
    if (method === 'POST') {
      const m = /^\/scenarios\/(\d+)\/(start|stop)$/.exec(path);
      return m ? Response.json({ scenario: { id: Number(m[1]), isActive: m[2] === 'start', islinked: m[2] === 'start' } }) : new Response('{}', { status: 404 });
    }
    if (path === '/scenarios/6887314') return Response.json({ scenario: { id: 6887314, name: 'StreetEasy Referral Lead → Auto-Accept', isActive: true, isPaused: false, isinvalid: false, dlqCount: 0, lastEdit: '2026-11-12T15:00:00.000Z', nextExec: null } });
    if (path === '/scenarios/6889011') return Response.json({ scenario: { id: 6889011, name: 'StreetEasy Lead Alerts → Email', isActive: over.alertsActive ?? false, isPaused: false, isinvalid: false, dlqCount: 4, lastEdit: '2026-11-10T15:00:00.000Z' } });
    if (path.startsWith('/scenarios/6887314/logs?')) return Response.json({ scenarioLogs: [
      { id: 'a1', imtId: 'x', type: 'modify', timestamp: '2026-11-12T15:00:00Z', authorName: 'Kimani' },
      ...Array.from({ length: 14 }, (_, i) => ({ id: `e${i}`, imtId: `i${i}`, type: 'auto', timestamp: `2026-11-12T14:${String(59 - i).padStart(2, '0')}:00Z`, status: 1, displayStatus: 'SUCCESS', duration: 900, operations: 2 })),
    ], pg: { limit: 30, sortDir: 'desc' } });
    if (path.startsWith('/scenarios/6889011/logs?')) return Response.json({ scenarioLogs: [
      ...(over.alertsLastOk ? [{ id: 'g2', imtId: 'j2', type: 'auto', timestamp: '2026-11-12T16:00:00Z', status: 1, displayStatus: 'SUCCESS', duration: 400, operations: 2 }] : []),
      { id: 'f1', imtId: 'j1', type: 'auto', timestamp: '2026-11-12T13:00:00Z', status: 3, displayStatus: 'ERROR', duration: 400, operations: 1 },
      { id: 'f0', imtId: 'j0', type: 'auto', timestamp: '2026-11-11T13:00:00Z', status: 1, displayStatus: 'SUCCESS', duration: 400, operations: 2 },
    ], pg: {} });
    if (path === '/scenarios/6889011/executions/f1') return Response.json({ status: 'ERROR', error: { name: 'ConnectionError', message: 'The connection has expired.', causeModule: { name: 'Gmail', appName: 'google-email' } } });
    if (path === '/connections/12126157') return Response.json({ connection: { id: 12126157, name: 'Creative Google Restricted connection (creative@casa-blanca.com)', accountName: 'google-restricted', accountLabel: 'Google Restricted', packageName: 'google-email', expire: over.connectionExpire === undefined ? '2026-11-11T00:00:00.000Z' : over.connectionExpire, metadata: { type: 'email', value: 'creative@casa-blanca.com' } } });
    return new Response('{"message":"Not found"}', { status: 404 });
  };
}

test('make: both scenarios, their last 10 runs (not edits), error messages, and the connection; the token stays server-side', async () => {
  const logged: string[] = [];
  const orig = console.log; console.log = (...a: unknown[]) => { logged.push(a.join(' ')); };
  try {
    const { d, seen } = makeDeps(KIMANI, makeApi());
    const res = await handleLeadAccept(get('?view=make'), d);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes(MAKE_TOKEN), 'the token never reaches the browser');
    const v = JSON.parse(text);
    const [intake, alerts] = v.scenarios;
    assert.equal(intake.id, 6887314);
    assert.equal(intake.role, 'intake');
    assert.equal(intake.name, 'StreetEasy Referral Lead → Auto-Accept');
    assert.equal(intake.isActive, true);
    assert.equal(intake.runs.length, 10);
    assert.ok(intake.runs.every((r: { status: string }) => r.status === 'success'), 'the edit row is left out');
    assert.equal(intake.runs[0].at, '2026-11-12T14:59:00Z');
    assert.equal(alerts.isActive, false);
    assert.equal(alerts.dlqCount, 4);
    assert.equal(alerts.runs[0].status, 'error');
    assert.equal(alerts.runs[0].error, 'Gmail — ConnectionError: The connection has expired.');
    assert.equal(alerts.runs[1].error, undefined);
    assert.equal(v.connection.name, 'Creative Google Restricted connection (creative@casa-blanca.com)');
    assert.equal(v.connection.expired, true);
    assert.equal(v.connection.verified, null);
    assert.equal(v.connection.reconnectUrl, 'https://us2.make.com/1942598/connections');
    assert.ok(seen.every((s) => s.auth === `Token ${MAKE_TOKEN}`));
    assert.ok(seen.every((s) => s.url.startsWith(MAKE + '/') && !s.url.includes(MAKE_TOKEN)));
    assert.ok(seen.every((s) => s.method === 'GET'), 'reading never switches anything');
    assert.ok(seen.some((s) => s.url.startsWith(`${MAKE}/scenarios/6887314/logs?`)));
    assert.ok(logged.every((l) => !l.includes(MAKE_TOKEN)));
  } finally { console.log = orig; }

  // Make's own date doesn't decide it (it reads months out while the sign-in lapses weekly): the alert scenario does.
  const offButDated = makeDeps(KIMANI, makeApi({ connectionExpire: '2099-01-01T00:00:00Z' }));
  const c1 = (await (await handleLeadAccept(get('?view=make'), offButDated.d)).json()).connection;
  assert.equal(c1.expired, true);
  assert.equal(c1.lastWorked, '2026-11-11T13:00:00Z');
  const working = makeDeps(KIMANI, makeApi({ connectionExpire: '2020-01-01T00:00:00Z', alertsActive: true, alertsLastOk: true }));
  assert.equal((await (await handleLeadAccept(get('?view=make'), working.d)).json()).connection.expired, false);
  const lastFailedOnConn = makeDeps(KIMANI, makeApi({ alertsActive: true }));
  assert.equal((await (await handleLeadAccept(get('?view=make'), lastFailedOnConn.d)).json()).connection.expired, true);
});

test('make: a guest can look; an agent who isn’t the team is refused before any call', async () => {
  const g = makeDeps(GUEST, makeApi());
  assert.equal((await handleLeadAccept(get('?view=make'), g.d)).status, 200);
  const a = makeDeps(AGENT, makeApi());
  assert.equal((await handleLeadAccept(get('?view=make'), a.d)).status, 403);
  assert.equal(a.seen.length, 0);
});

test('make: no token is a 503 that names the variable; Make refusing the token says so', async () => {
  const { d, seen } = makeDeps(KIMANI, makeApi(), { makeToken: undefined });
  const r1 = await handleLeadAccept(get('?view=make'), d);
  assert.equal(r1.status, 503);
  const b1 = await r1.json();
  assert.equal(b1.error, 'not_configured');
  assert.match(b1.message, /MAKE_API_TOKEN/);
  assert.equal((await handleLeadAccept(post({ makeScenario: { id: 6889011, active: true } }), d)).status, 503);
  assert.equal(seen.length, 0);

  for (const status of [401, 403]) {
    const refused = makeDeps(KIMANI, () => new Response('{"message":"Access denied"}', { status }));
    const r = await handleLeadAccept(get('?view=make'), refused.d);
    assert.equal(r.status, 502);
    const b = await r.json();
    assert.equal(b.error, 'make_token_refused');
    assert.match(b.message, /scope/);
    assert.ok(!JSON.stringify(b).includes(MAKE_TOKEN));
  }
  const down = makeDeps(KIMANI, () => { throw new TypeError('fetch failed'); });
  const dv = await (await handleLeadAccept(get('?view=make'), down.d)).json();
  assert.ok([...dv.scenarios, dv.connection].every((x: { problem?: string }) => /didn’t answer/.test(x.problem ?? '')), 'Make not answering shows on each card');
});

test('make: the service being unconfigured doesn’t stop the Make panel', async () => {
  const { d } = makeDeps(KIMANI, makeApi());   // baseUrl and secret are unset here
  assert.equal((await handleLeadAccept(get('?view=status'), d)).status, 503);
  assert.equal((await handleLeadAccept(get('?view=make'), d)).status, 200);
});

test('make: one missing scenario shows as a problem on its card, not a failed page', async () => {
  const api = makeApi();
  const { d } = makeDeps(KIMANI, (url, m) => url.startsWith(`${MAKE}/scenarios/6889011`) ? new Response('{}', { status: 404 }) : api(url, m));
  const v = await (await handleLeadAccept(get('?view=make'), d)).json();
  assert.equal(v.scenarios[0].isActive, true);
  assert.match(v.scenarios[1].problem, /doesn’t have/);
});

test('make: start and stop the two scenarios; any other id, a bad body, a guest or an agent is refused', async () => {
  const logged: string[] = [];
  const orig = console.log; console.log = (...a: unknown[]) => { logged.push(a.join(' ')); };
  try {
    const { d, seen } = makeDeps(KIMANI, makeApi());
    const off = await handleLeadAccept(post({ makeScenario: { id: 6887314, active: false } }), d);
    assert.equal(off.status, 200);
    assert.deepEqual(await off.json(), { id: 6887314, isActive: false });
    assert.deepEqual(seen[0], { url: `${MAKE}/scenarios/6887314/stop`, method: 'POST', auth: `Token ${MAKE_TOKEN}` });
    const on = await handleLeadAccept(post({ makeScenario: { id: 6889011, active: true } }), d);
    assert.deepEqual(await on.json(), { id: 6889011, isActive: true });
    assert.equal(seen[1]!.url, `${MAKE}/scenarios/6889011/start`);
    assert.ok(logged.some((l) => l.includes('6887314') && l.includes(KIMANI.email)));
    assert.ok(logged.every((l) => !l.includes(MAKE_TOKEN)));

    for (const bad of [{ id: 1234567, active: true }, { id: '6887314', active: true }, { id: 6887314, active: 'yes' }, null]) {
      assert.equal((await handleLeadAccept(post({ makeScenario: bad }), d)).status, 400, JSON.stringify(bad));
    }
    assert.equal(seen.length, 2, 'refused requests never reach Make');
  } finally { console.log = orig; }

  const g = makeDeps(GUEST, makeApi());
  assert.equal((await handleLeadAccept(post({ makeScenario: { id: 6889011, active: true } }), g.d)).status, 403);
  const a = makeDeps(AGENT, makeApi());
  assert.equal((await handleLeadAccept(post({ makeScenario: { id: 6889011, active: true } }), a.d)).status, 403);
  assert.equal(g.seen.length + a.seen.length, 0);

  const failing = makeDeps(KIMANI, () => new Response('{"detail":"Scenario contains invalid modules."}', { status: 400 }));
  const r = await handleLeadAccept(post({ makeScenario: { id: 6889011, active: true } }), failing.d);
  assert.equal(r.status, 502);
  assert.match((await r.json()).message, /invalid modules/);
});
