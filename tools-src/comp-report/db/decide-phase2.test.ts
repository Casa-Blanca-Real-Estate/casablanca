// Phase 2's pre-live pieces against a real PostgreSQL (Dispatch 10, CR-D): the
// session key, the go/no-go call and its append-only record, the labelled
// batch end to end with Haiku as a second judge, the weekly drift check and
// its readout, and the new migration's constraints and row-level security.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { DECIDE_KEY_HEADER, handleDecide } from '../server/api/decide.ts';
import { handleDecideDrain } from '../server/api/decide-drain.ts';
import { handleSample } from '../server/api/sample.ts';
import { withActor, type PoolLike } from '../server/db.ts';
import { decideConfig } from '../server/decide/config.ts';
import type { Clock } from '../server/decide/drain.ts';
import { DRAIN_PATH, enqueueListingJudgments } from '../server/decide/enqueue.ts';
import { FIXTURES } from '../server/decide/fixtures.ts';
import type { HaikuClient } from '../server/decide/haiku.ts';
import { QUESTIONS } from '../server/decide/registry.ts';
import type { IdentityUser } from '../server/identity.ts';
import type { AuthDeps } from '../server/session.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const KEY = 'test-decide-key-0123456789abcdefghij';
const URL_A = 'https://streeteasy.com/building/100-barclay/11f';
const URL_MISSING = 'https://streeteasy.com/building/the-leonard/5b';
const ALL = QUESTIONS.map((q) => q.id);

const PEOPLE: Record<string, Partial<IdentityUser>> = {
  'tok-ana-000000000': { email: 'ana@casa-blanca.com', name: 'Ana Agent' },
  'tok-kimani-000000': { email: 'kimani@casa-blanca.com', name: 'Kimani Admin' },
};

/** A Gateway that answers every wire question; `flip` makes every choice pick its last option instead. */
function gateway(state: { flip?: boolean; calls: number }) {
  return (async (_url: unknown, init: RequestInit) => {
    state.calls++;
    const body = JSON.parse(String(init.body));
    const answers: Record<string, unknown> = {};
    for (const [id, q] of Object.entries(body.questions as Record<string, any>)) {
      if (q.type === 'choice') {
        const keys = Object.keys(q.criteria).sort();
        const pick = state.flip ? keys[keys.length - 1]! : keys[0]!;
        answers[id] = { type: 'choice', choice: pick, probabilities: Object.fromEntries(keys.map((k) => [k, k === pick ? 0.9 : 0.1 / (keys.length - 1)])) };
      } else answers[id] = { type: 'boolean', probability: 0.9 };
    }
    return Response.json({ model: 'typesafe-ai/jev', answers, usage: { inputTokens: 500 } });
  }) as unknown as typeof fetch;
}

const haiku: HaikuClient = {
  messages: {
    async create(params) {
      const schema = (params as any).output_config.format.schema as { properties: Record<string, any> };
      const out: Record<string, unknown> = {};
      for (const [id, s] of Object.entries(schema.properties)) {
        if (s.properties.choice) {
          const keys: string[] = [...s.properties.choice.enum].sort();
          out[id] = { choice: keys[0], probabilities: Object.fromEntries(keys.map((k, i) => [k, i === 0 ? 0.8 : 0.2 / (keys.length - 1)])) };
        } else out[id] = { probability_yes: 0.2 };
      }
      return { model: 'claude-haiku-4-5-20251001', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 800, output_tokens: 100 } };
    },
  },
};

describe('phase 2 before the first live call, in the database', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let deps: AuthDeps;
  let observationId: number;
  const clock: Clock & { t: number } = { t: Date.parse('2026-10-14T12:00:00Z'), now: () => clock.t, sleep: async (ms) => { clock.t += Math.max(0, ms); } };
  const config = (extra: Record<string, string> = {}) => decideConfig({
    CR_JEV_MODE: 'watch', AI_GATEWAY_API_KEY: 'test-key-not-real', JEV_MIN_INTERVAL_MS: '0', CR_JEV_ZDR: 'off', CR_DECIDE_KEY: KEY, ...extra,
  });
  const kicks: string[] = [];
  const jev = { calls: 0, flip: false };
  const fetchImpl = (async (url: URL | string, init: RequestInit) => {
    if (String(url).endsWith(DRAIN_PATH)) { kicks.push(JSON.parse(String(init.body)).token); return new Response(null, { status: 202 }); }
    return gateway(jev)(url, init);
  }) as unknown as typeof fetch;
  const P = () => pool as unknown as PoolLike;

  const call = (method: 'GET' | 'POST', opts: { key?: string; token?: string; query?: string; body?: unknown; cfg?: ReturnType<typeof config> } = {}) =>
    handleDecide(new Request(`https://site.example/api/comp-report/decide${opts.query ?? ''}`, {
      method,
      headers: {
        ...(opts.key !== undefined ? { [DECIDE_KEY_HEADER]: opts.key } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }), { ...deps, config: opts.cfg ?? config(), fetchImpl, clock });
  const drainNow = async () => {
    const token = kicks.at(-1)!;
    const res = await handleDecideDrain(new Request(`https://site.example${DRAIN_PATH}`, { method: 'POST', body: JSON.stringify({ token }) }), {
      pool: P(), config: config(), fetchImpl, clock, secondJudge: () => haiku,
    });
    assert.equal(res.status, 200);
    return res.json();
  };
  const asSystem = <T>(fn: (tx: pg.PoolClient) => Promise<T>) => withActor(P(), { kind: 'system', does: 'test' }, fn as never) as Promise<T>;
  const asAgent = <T>(fn: (tx: pg.PoolClient) => Promise<T>) =>
    withActor(P(), { kind: 'user', email: 'ana@casa-blanca.com', role: 'agent' }, fn as never) as Promise<T>;

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    deps = {
      verifier: {
        async verify(token: string) {
          const p = PEOPLE[token];
          return p ? ({ id: `id-${token}`, confirmed: true, provider: 'google', name: null, ...p } as IdentityUser) : null;
        },
        emailConfirmationRequired: async () => true,
      },
      access: accessConfig({ CR_ADMIN_EMAILS: 'kimani@casa-blanca.com' }),
      pool: P(),
    };
    await withActor(P(), { kind: 'system', does: 'sign-in' }, (tx) => tx.query(
      "insert into comp_report.users (email, name, role) values ('ana@casa-blanca.com', 'Ana Agent', 'agent')",
    ));
    observationId = await asAgent(async (tx) => {
      const p = await tx.query<{ id: string }>("insert into comp_report.properties (property_key, address, unit) values ('pk2|t|11f', '100 Barclay Street', '11F') returning id");
      const o = await tx.query<{ id: string }>("insert into comp_report.property_observations (property_id, source, facts) values ($1, 'listing', '{}') returning id", [p.rows[0]!.id]);
      return Number(o.rows[0]!.id);
    });
  });
  after(async () => {
    await pool?.end();
    await db?.drop();
  });

  test('the session key opens the decide endpoint, and nothing else; a wrong one is a 401, never a fall-through', async () => {
    const ok = await call('GET', { key: KEY });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.setup.sessionKey, true);
    assert.doesNotMatch(JSON.stringify(body), new RegExp(KEY));
    assert.equal((await call('GET', { key: `${KEY}x` })).status, 401);
    assert.equal((await call('GET', { key: `${KEY}x`, token: 'tok-kimani-000000' })).status, 401, 'a bad key isn\'t rescued by a sign-in');
    assert.equal((await call('GET', { key: KEY, cfg: config({ CR_DECIDE_KEY: '' }) })).status, 401, 'no key set, none accepted');
    assert.equal((await call('GET')).status, 401);
    assert.equal((await call('GET', { token: 'tok-ana-000000000' })).status, 403);
    assert.equal((await call('GET', { token: 'tok-kimani-000000' })).status, 200, 'an admin still signs in as before');
    const sample = await handleSample(new Request('https://site.example/api/comp-report/sample', { headers: { [DECIDE_KEY_HEADER]: KEY } }), deps);
    assert.equal(sample.status, 401, 'the key is no sign-in anywhere else');
  });

  test('the go/no-go call: works with the mode off, needs the Jev key, recorded append-only with its raw body', async () => {
    const off = config({ CR_JEV_MODE: '' });
    assert.equal((await call('POST', { key: KEY, body: { action: 'probe' }, cfg: config({ AI_GATEWAY_API_KEY: '' }) })).status, 409);
    const before = jev.calls;
    const res = await call('POST', { key: KEY, body: { action: 'probe' }, cfg: off });
    assert.equal(res.status, 200);
    const r = await res.json();
    assert.deepEqual([r.sent, r.ok, r.outcome, r.zdr, jev.calls - before], [true, true, 'answered', false, 1]);
    assert.ok(Number.isInteger(r.id));
    assert.equal((await call('POST', { key: KEY, body: { action: 'probe', wireIds: ['nope'] }, cfg: off })).status, 400);

    const probes = await (await call('GET', { key: KEY, query: '?view=probes' })).json();
    assert.equal(probes.probes[0].id, r.id);
    assert.match(probes.probes[0].raw, /"answers"/);
    assert.equal(probes.probes[0].created_by, 'system:decide');
    await assert.rejects(asSystem((tx) => tx.query('update comp_report.decide_probes set ok = false')), /append-only|permission denied/);
    assert.equal((await asAgent((tx) => tx.query('select * from comp_report.decide_probes'))).rows.length, 0, 'agents see none of it');
    await assert.rejects(asAgent((tx) => tx.query(
      "insert into comp_report.decide_probes (ok, outcome, zdr, registry_version, fixture_id, wire_ids) values (true, 'answered', true, 'x', 'f', '{}')")));
    const usage = (await asSystem((tx) => tx.query("select provider, purpose, user_email, input_tokens from comp_report.usage where purpose = 'decide:probe'"))).rows;
    assert.deepEqual(usage, [{ provider: 'jev', purpose: 'decide:probe', user_email: 'system:decide', input_tokens: 500 }]);
  });

  test('the labelled batch: an import\'s text, re-asked with every question by Jev and by Haiku, read back by batch', async () => {
    const r = await enqueueListingJudgments(
      { observationId, userEmail: 'ana@casa-blanca.com', record: { facts: {}, listing: { url: URL_A, confirmed: false, on_confirm: {}, history: [], description: 'Renovated in 2024, a two-bedroom with park views and a private terrace. Call Ana Agent to see it.' } } },
      { pool: P(), config: config(), origin: 'https://site.example', fetchImpl, now: clock.now },
    );
    assert.ok(r.queued);
    const imported = (await asSystem((tx) => tx.query('select source_url, state from comp_report.decide_requests where id = $1', [r.requestId]))).rows[0];
    assert.equal(imported.source_url, URL_A);
    assert.doesNotMatch(imported.state.listing, /Ana/);

    const res = await call('POST', { key: KEY, body: { action: 'labelled', batch: 'labels-v1', urls: [URL_A, URL_MISSING] } });
    assert.equal(res.status, 200);
    const queued = await res.json();
    assert.deepEqual([queued.requests.length, queued.missing, queued.kicked], [1, [URL_MISSING], true]);
    assert.equal((await call('POST', { key: KEY, body: { action: 'labelled', batch: 'labels-v1', urls: [URL_A] } })).status, 409, 'a name runs once');

    const report = await drainNow();
    assert.ok(report.answered >= 2, JSON.stringify(report));
    const view = await (await call('GET', { key: KEY, query: '?view=batch&batch=labels-v1' })).json();
    assert.equal(view.requests.length, 1);
    const req = view.requests[0];
    assert.deepEqual([req.status, req.url, req.questions], ['answered', URL_A, ALL]);
    assert.equal(req.state.listing, imported.state.listing, 'the same text Jev saw at import');
    const by = (p: string) => req.judgments.filter((j: { provider: string }) => j.provider === p).length;
    assert.deepEqual([by('jev'), by('haiku')], [7, 7]);
    const second = (await asSystem((tx) => tx.query(
      "select provider, user_email, detail->>'secondJudge' as second from comp_report.usage where detail->>'request' = $1 order by id", [String(req.id)]))).rows;
    assert.deepEqual(second.map((u) => [u.provider, u.user_email, u.second]), [['jev', 'system:decide-labelled', null], ['anthropic', 'system:decide-labelled', 'true']]);
  });

  test('the drift check: each fixture once a week, judged against its first answers', async () => {
    const first = await (await call('POST', { key: KEY, body: { action: 'drift' } })).json();
    assert.deepEqual([first.queued, first.batch, first.requests.length], [true, 'drift-2026-w42', FIXTURES.length]);
    const again = await call('POST', { key: KEY, body: { action: 'drift' } });
    assert.deepEqual([again.status, (await again.json()).why], [200, 'already-this-week']);
    await assert.rejects(asSystem((tx) => tx.query(
      `insert into comp_report.decide_requests (lane, target_kind, fixture_id, question_ids, wire_questions, registry_version, state, state_hash,
         not_before, enqueued_at, batch) values ('listing', 'fixture', $1, '{condition}', 2, 'v', '{}', $2, now(), now(), 'drift-2026-w42')`,
      [FIXTURES[0]!.id, 'd'.repeat(64)])), /duplicate key/, 'the database holds the once-a-week rule too');
    await assert.rejects(asSystem((tx) => tx.query(
      `insert into comp_report.decide_requests (lane, target_kind, question_ids, wire_questions, registry_version, state, state_hash, not_before, enqueued_at)
       values ('listing', 'fixture', '{condition}', 2, 'v', '{}', $1, now(), now())`, ['d'.repeat(64)])), /check constraint/, 'a fixture target names its fixture');

    await drainNow();
    const fixtureJudgments = (await asSystem((tx) => tx.query(
      "select count(*)::int as n, count(distinct fixture_id)::int as fixtures from comp_report.judgments where target_kind = 'fixture'"))).rows[0];
    assert.deepEqual(fixtureJudgments, { n: FIXTURES.length * 7, fixtures: FIXTURES.length });
    let drift = (await (await call('GET', { key: KEY })).json()).drift;
    assert.equal(drift.items.length, FIXTURES.length * 7);
    assert.equal(drift.moved, 0);

    // A week later, upstream has changed: every choice now picks differently.
    clock.t += 7 * 86_400_000;
    jev.flip = true;
    const next = await (await call('POST', { key: KEY, body: { action: 'drift' } })).json();
    assert.equal(next.batch, 'drift-2026-w43');
    await drainNow();
    drift = (await (await call('GET', { key: KEY })).json()).drift;
    assert.equal(drift.moved, FIXTURES.length * 3, 'every choice moved; the yes/no answers held');
    const moved = drift.items.find((i: { moved: boolean }) => i.moved);
    assert.equal(moved.runs, 2);
    assert.notEqual(moved.first.answer, moved.latest.answer);
  });

  test('the readout carries the latest probe, the batches, per-call latency, and cost per listing from imports only', async () => {
    const body = await (await call('GET', { token: 'tok-kimani-000000' })).json();
    assert.equal(body.probe.ok, true);
    assert.deepEqual(body.batches.map((b: { batch: string }) => b.batch), ['labels-v1', 'drift-2026-w42', 'drift-2026-w43']);
    assert.ok(body.latency.perCall.some((l: { provider: string }) => l.provider === 'jev'));
    assert.equal(body.cost.perListingUsd, Math.round((500 * 0.042 / 1e6) * 1e8) / 1e8, 'one import, one Jev call of 500 tokens');
    const asKey = await (await call('GET', { key: KEY })).json();
    assert.deepEqual(asKey.cost, body.cost, 'the key reads the same costs as an admin');
  });
});
