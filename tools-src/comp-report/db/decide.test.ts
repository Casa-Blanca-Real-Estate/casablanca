// The decision layer against a real PostgreSQL (Dispatch 10, CR-D): the
// tables' row-level security, the lease two drainers race for, the queue as
// its own drop ledger, a drain end to end through the background handler, and
// the admin readout refusing anyone signed out or not an admin.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleDecide } from '../server/api/decide.ts';
import { handleDecideDrain } from '../server/api/decide-drain.ts';
import { withActor, type PoolLike } from '../server/db.ts';
import { decideConfig } from '../server/decide/config.ts';
import { DRAIN_PATH, enqueueListingJudgments } from '../server/decide/enqueue.ts';
import { PgStore } from '../server/decide/pg-store.ts';
import { REGISTRY_VERSION } from '../server/decide/registry.ts';
import type { NewRequest } from '../server/decide/store.ts';
import type { IdentityUser } from '../server/identity.ts';
import type { AuthDeps } from '../server/session.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const PEOPLE: Record<string, Partial<IdentityUser>> = {
  'tok-ana-000000000': { email: 'ana@casa-blanca.com', name: 'Ana Agent' },
  'tok-kimani-000000': { email: 'kimani@casa-blanca.com', name: 'Kimani Admin' },
};

const DESCRIPTION =
  'Gut renovated in 2024, this sun-filled two-bedroom has a private terrace facing the park. ' +
  'Sponsor sale: no board approval required. Contact Ana Agent at 212-555-0100 to see it.';

function jevAnswers(): Response {
  const probs = { renovated: 0.94, good: 0.03, needs_work: 0.01, not_stated: 0.02 };
  const body: Record<string, unknown> = {
    condition__fwd: { type: 'choice', choice: 'renovated', probabilities: probs },
    condition__rev: { type: 'choice', choice: 'renovated', probabilities: probs },
    view__fwd: { type: 'choice', choice: 'notable', probabilities: { notable: 0.9, ordinary: 0.05, not_stated: 0.05 } },
    view__rev: { type: 'choice', choice: 'notable', probabilities: { notable: 0.7, ordinary: 0.1, not_stated: 0.2 } },
    outdoor__fwd: { type: 'choice', choice: 'private', probabilities: { private: 0.95, shared_only: 0.02, not_stated: 0.03 } },
    outdoor__rev: { type: 'choice', choice: 'private', probabilities: { private: 0.93, shared_only: 0.03, not_stated: 0.04 } },
    sponsor_unit: { type: 'boolean', probability: 0.97 },
    estate_or_as_is: { type: 'boolean', probability: 0.03 },
    tenant_in_place: { type: 'boolean', probability: 0.02 },
    // parking_or_storage_included left out: a 200 missing an answer.
  };
  return Response.json({ model: 'typesafe-ai/jev', answers: body, usage: { inputTokens: 520 } });
}

describe('the decision layer in the database', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let pool2: pg.Pool;
  let deps: AuthDeps;
  let observationId: number;
  const watch = decideConfig({ CR_JEV_MODE: 'watch', AI_GATEWAY_API_KEY: 'test-key-not-real', JEV_MIN_INTERVAL_MS: '0' });

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    pool2 = testPool(db.ownerUrl, 4);
    deps = {
      verifier: {
        async verify(token: string) {
          const p = PEOPLE[token];
          return p ? ({ id: `id-${token}`, confirmed: true, provider: 'google', name: null, ...p } as IdentityUser) : null;
        },
        emailConfirmationRequired: async () => true,
      },
      access: accessConfig({ CR_ADMIN_EMAILS: 'kimani@casa-blanca.com' }),
      pool: pool as unknown as PoolLike,
    };
    // Ana signs in (so her name is among the names to scrub), and imports a listing.
    await withActor(pool as unknown as PoolLike, { kind: 'system', does: 'sign-in' }, (tx) => tx.query(
      "insert into comp_report.users (email, name, role) values ('ana@casa-blanca.com', 'Ana Agent', 'agent')",
    ));
    observationId = await withActor(pool as unknown as PoolLike, { kind: 'user', email: 'ana@casa-blanca.com', role: 'agent' }, async (tx) => {
      const p = await tx.query<{ id: string }>(
        "insert into comp_report.properties (property_key, address, unit) values ('pk1|test|1', '1 Test Street', '1') returning id",
      );
      const o = await tx.query<{ id: string }>(
        "insert into comp_report.property_observations (property_id, source, facts) values ($1, 'listing', '{}') returning id",
        [p.rows[0]!.id],
      );
      return Number(o.rows[0]!.id);
    });
  });
  after(async () => {
    await pool?.end();
    await pool2?.end();
    await db?.drop();
  });

  const P = () => pool as unknown as PoolLike;
  const request = (n = 1): NewRequest => ({
    lane: 'listing', target: { kind: 'property_observation', observationId }, questionIds: ['condition'], wireQuestions: 2,
    registryVersion: REGISTRY_VERSION, state: { listing: `[listing] test ${n}` }, stateHash: 'b'.repeat(64), userEmail: 'ana@casa-blanca.com',
  });
  const asAgent = <T>(fn: (tx: pg.PoolClient) => Promise<T>) =>
    withActor(P(), { kind: 'user', email: 'ana@casa-blanca.com', role: 'agent' }, fn as never) as Promise<T>;
  const asSystem = <T>(fn: (tx: pg.PoolClient) => Promise<T>) =>
    withActor(P(), { kind: 'system', does: 'test' }, fn as never) as Promise<T>;

  test('two drainers racing for the lease: exactly one gets it, every time', async () => {
    const a = new PgStore(P());
    const b = new PgStore(pool2 as unknown as PoolLike);
    for (let i = 0; i < 10; i++) {
      const now = Date.now();
      const got = await Promise.all([a.acquireLease('a', now, 60_000), b.acquireLease('b', now, 60_000)]);
      assert.equal(got.filter(Boolean).length, 1, `round ${i}: ${got}`);
      await a.releaseLease('a');
      await b.releaseLease('b');
    }
  });

  test("an expired lease can be taken; a live one can't; renewing needs to hold it", async () => {
    const store = new PgStore(P());
    const t = Date.now();
    assert.ok(await store.acquireLease('dead', t, 1_000));
    assert.equal(await store.acquireLease('next', t + 500, 60_000), false);
    assert.equal(await store.renewLease('next', t + 500, 60_000), false);
    assert.ok(await store.acquireLease('next', t + 1_001, 60_000));
    assert.equal(await store.renewLease('dead', t + 1_002, 60_000), false, 'the dead drainer has lost it');
    await store.releaseLease('next');
  });

  test('the queue: claimed oldest first, requeued once when stranded, then dropped as out-of-time; the cap drops as queue-full', async () => {
    const store = new PgStore(P());
    const t = Date.now();
    const { id } = await store.enqueue(request(1), t, 5_000);
    const claimed = await store.claimNext('dead', t);
    assert.equal(claimed?.id, id);
    assert.deepEqual(claimed?.state, { listing: '[listing] test 1' });
    assert.equal(await store.claimNext('dead', t), null);
    assert.deepEqual(await store.recoverStranded('alive', t), { requeued: 1, dropped: 0 });
    await store.claimNext('dead-again', t);
    assert.deepEqual(await store.recoverStranded('alive', t), { requeued: 0, dropped: 1 });
    const row = (await asSystem((tx) => tx.query('select status, drop_reason, requeues from comp_report.decide_requests where id = $1', [id]))).rows[0];
    assert.deepEqual(row, { status: 'dropped', drop_reason: 'out-of-time', requeues: 1 });

    const capped = await store.enqueue(request(2), t, 0);
    assert.equal(capped.status, 'dropped');
    const full = (await asSystem((tx) => tx.query('select drop_reason from comp_report.decide_requests where id = $1', [capped.id]))).rows[0];
    assert.equal(full.drop_reason, 'queue-full');
  });

  test('pacing and the cool-down are shared, and a cool-down never shortens', async () => {
    const store = new PgStore(P());
    const t = Date.now();
    await store.setNextStart(t + 12_500);
    await store.coolDown(t + 60_000);
    await store.coolDown(t + 5_000);
    const p = await store.pacing();
    assert.ok(Math.abs(p.nextStartAt - (t + 12_500)) < 2);
    assert.ok(Math.abs(p.coolUntil - (t + 60_000)) < 2);
  });

  test('a kick token works once, and only before it expires', async () => {
    const store = new PgStore(P());
    const t = Date.now();
    const token = await store.issueKick(t, 60_000);
    assert.equal(await store.redeemKick('0'.repeat(64), t), false);
    assert.equal(await store.redeemKick(token, t), true);
    assert.equal(await store.redeemKick(token, t), false, 'spent');
    const late = await store.issueKick(t, 1_000);
    assert.equal(await store.redeemKick(late, t + 2_000), false, 'expired');
  });

  test('agents see none of it and write none of it; admins read it', async () => {
    const counts = await asAgent(async (tx) => ({
      requests: (await tx.query('select * from comp_report.decide_requests')).rowCount,
      runtime: (await tx.query('select * from comp_report.decide_runtime')).rowCount,
      judgments: (await tx.query('select * from comp_report.judgments')).rowCount,
    }));
    assert.deepEqual(counts, { requests: 0, runtime: 0, judgments: 0 });
    await assert.rejects(asAgent((tx) => tx.query(
      `insert into comp_report.decide_requests (lane, target_kind, observation_id, question_ids, wire_questions, registry_version, state, state_hash, not_before, enqueued_at)
       values ('listing', 'property_observation', $1, '{condition}', 2, 'x', '{}', $2, now(), now())`, [observationId, 'c'.repeat(64)],
    )), /row-level security/);
    const updated = await asAgent((tx) => tx.query("update comp_report.decide_runtime set lease_holder = 'me'"));
    assert.equal(updated.rowCount, 0);
    await assert.rejects(asSystem((tx) => tx.query(
      "insert into comp_report.usage (user_email, provider, model, purpose) values ('x@y.z', 'anthropic', 'm', 'assistant')",
    )), /row-level security/, 'the system writes only decision usage rows');
    const admin = await withActor(P(), { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' }, (tx) =>
      tx.query<{ n: number }>('select count(*)::int as n from comp_report.decide_requests'));
    assert.ok(admin.rows[0]!.n > 0);
  });

  test('a judgment can\'t land above watch without a measured bar, and judgments are append-only', async () => {
    const store = new PgStore(P());
    const { id } = await store.enqueue(request(3), Date.now(), 5_000);
    const insert = (landed: string, bar: string) => asSystem((tx) => tx.query(
      `insert into comp_report.judgments (request_id, target_kind, observation_id, lane, question_id, question_version, question_type,
         registry_version, provider, model, answer, probability, order_stable, probabilities, band, landed, bar, state_hash, option_order_hash)
       values ($1, 'property_observation', $2, 'listing', 'condition', 1, 'choice', 'x', 'jev', 'typesafe-ai/jev', 'good', 0.9, true, '{}',
         'high', $3, $4, $5, $5)`, [id, observationId, landed, bar, 'd'.repeat(64)]));
    await assert.rejects(insert('applied', 'uncalibrated'), /check constraint/);
    await insert('watch', 'uncalibrated');
    await assert.rejects(asSystem((tx) => tx.query("update comp_report.judgments set landed = 'applied'")), /append-only|permission denied/);
  });

  test('off: an import queues nothing and records nothing', async () => {
    const before = (await asSystem((tx) => tx.query('select count(*)::int as n from comp_report.decide_requests'))).rows[0].n;
    const r = await enqueueListingJudgments(
      { observationId, record: { facts: {}, listing: { url: null, confirmed: false, on_confirm: {}, history: [], description: DESCRIPTION } } },
      { pool: P(), config: decideConfig({}), origin: 'https://site', fetchImpl: (async () => { throw new Error('no kick'); }) as unknown as typeof fetch },
    );
    assert.deepEqual(r, { queued: false, why: 'off' });
    const after = (await asSystem((tx) => tx.query('select count(*)::int as n from comp_report.decide_requests'))).rows[0].n;
    assert.equal(after, before);
  });

  test('watch with no key and no fallback: recorded dropped as no-key at once, nothing sent', async () => {
    const r = await enqueueListingJudgments(
      { observationId, record: { facts: {}, listing: { url: null, confirmed: false, on_confirm: {}, history: [], description: DESCRIPTION } } },
      { pool: P(), config: decideConfig({ CR_JEV_MODE: 'watch' }), origin: 'https://site', fetchImpl: (async () => { throw new Error('no kick'); }) as unknown as typeof fetch },
    );
    assert.equal(r.queued && r.status, 'dropped');
    const row = (await asSystem((tx) => tx.query('select status, drop_reason from comp_report.decide_requests where id = $1', [r.queued ? r.requestId : 0]))).rows[0];
    assert.deepEqual(row, { status: 'dropped', drop_reason: 'no-key' });
  });

  test('end to end: an import queues, the kick starts the drainer, Jev answers, it all lands as watch', async () => {
    // Clear the earlier tests' queue so the drain sees only this listing, and
    // the pacing test's cool-down, which a drainer would rightly wait out.
    await asSystem(async (tx) => {
      await tx.query(
        "update comp_report.decide_requests set status = 'dropped', drop_reason = 'out-of-time', finished_at = now(), claimed_by = null where status in ('queued', 'running')");
      await tx.query("update comp_report.decide_runtime set cool_until = '-infinity', next_start_at = '-infinity'");
    });
    const kicks: Array<{ url: string; token: string }> = [];
    const jevCalls: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (url: URL | string, init: RequestInit) => {
      const u = String(url);
      if (u.endsWith(DRAIN_PATH)) { kicks.push({ url: u, token: JSON.parse(String(init.body)).token }); return new Response(null, { status: 202 }); }
      jevCalls.push(JSON.parse(String(init.body)));
      return jevAnswers();
    }) as unknown as typeof fetch;

    const r = await enqueueListingJudgments(
      { observationId, userEmail: 'ana@casa-blanca.com', record: { facts: {}, listing: { url: null, confirmed: false, on_confirm: {}, history: [], description: DESCRIPTION } } },
      { pool: P(), config: watch, origin: 'https://site.example', fetchImpl },
    );
    assert.ok(r.queued && r.status === 'queued' && r.kicked, JSON.stringify(r));
    assert.equal(kicks.length, 1);
    assert.equal(kicks[0]!.url, `https://site.example${DRAIN_PATH}`);

    const drainReq = (token: string) => new Request(`https://site.example${DRAIN_PATH}`, { method: 'POST', body: JSON.stringify({ token }) });
    assert.equal((await handleDecideDrain(drainReq('f'.repeat(64)), { pool: P(), config: watch, fetchImpl })).status, 401, 'no drain without a live token');
    const res = await handleDecideDrain(drainReq(kicks[0]!.token), { pool: P(), config: watch, fetchImpl });
    const report = await res.json();
    assert.equal(report.answered, 1, JSON.stringify(report));
    assert.equal(kicks.length, 1, 'an emptied queue hands on to no one');
    assert.equal((await handleDecideDrain(drainReq(kicks[0]!.token), { pool: P(), config: watch, fetchImpl })).status, 401, 'the token is spent');

    // What went to Jev: the scrubbed listing and nothing else, with both privacy flags.
    assert.equal(jevCalls.length, 1);
    const sent = jevCalls[0]! as { state: { listing: string }; providerOptions: unknown; questions: Record<string, unknown> };
    assert.deepEqual(Object.keys(sent.state), ['listing']);
    assert.match(sent.state.listing, /^\[listing\] Gut renovated in 2024/);
    assert.doesNotMatch(sent.state.listing, /Ana|212-555/);
    assert.deepEqual(sent.providerOptions, { gateway: { disallowPromptTraining: true, zeroDataRetention: true } });
    assert.equal(Object.keys(sent.questions).length, 10, 'three choices in both orders and four yes/no questions, one request');

    const reqRow = (await asSystem((tx) => tx.query(
      'select status, drop_reason, provider, model, unanswered, attempts from comp_report.decide_requests where id = $1', [r.queued ? r.requestId : 0]))).rows[0];
    assert.deepEqual(reqRow, { status: 'answered', drop_reason: 'unanswered', provider: 'jev', model: 'typesafe-ai/jev', unanswered: ['parking_or_storage_included'], attempts: 1 });
    const judgments = (await asSystem((tx) => tx.query(
      'select question_id, answer, round(probability::numeric, 3)::float8 as p, order_stable, band, landed, bar, created_by from comp_report.judgments where request_id = $1 order by id',
      [r.queued ? r.requestId : 0]))).rows;
    assert.deepEqual(judgments.map((j) => [j.question_id, j.answer, j.p, j.landed, j.bar]), [
      ['condition', 'renovated', 0.94, 'watch', 'uncalibrated'],
      ['view', 'notable', 0.8, 'watch', 'uncalibrated'],
      ['outdoor', 'private', 0.94, 'watch', 'uncalibrated'],
      ['sponsor_unit', 'true', 0.97, 'watch', 'uncalibrated'],
      ['estate_or_as_is', 'false', 0.97, 'watch', 'uncalibrated'],
      ['tenant_in_place', 'false', 0.98, 'watch', 'uncalibrated'],
    ]);
    assert.ok(judgments.every((j) => j.created_by === 'system:decide'));
    const usage = (await withActor(P(), { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' }, (tx) => tx.query(
      "select user_email, provider, model, purpose, input_tokens, output_tokens, estimated_cost_usd::float8 as usd from comp_report.usage where purpose like 'decide:%'"))).rows;
    assert.deepEqual(usage, [{ user_email: 'ana@casa-blanca.com', provider: 'jev', model: 'typesafe-ai/jev', purpose: 'decide:listing', input_tokens: 520, output_tokens: 0, usd: 0.000022 }]);
  });

  test('the ledger takes zdr-required (CR_JEV_ZDR), and still refuses a reason it doesn\'t know', async () => {
    const store = new PgStore(P());
    const { id } = await store.enqueueDropped(request(9), Date.now(), 'zdr-required');
    const row = (await asSystem((tx) => tx.query('select status, drop_reason from comp_report.decide_requests where id = $1', [id]))).rows[0];
    assert.deepEqual(row, { status: 'dropped', drop_reason: 'zdr-required' });
    await assert.rejects(store.enqueueDropped(request(10), Date.now(), 'made-up' as never), /check constraint/);
  });

  test('the readout: admins only; coverage by reason, cost at Jev\'s price', async () => {
    const get = (token?: string) => handleDecide(new Request('https://site/api/comp-report/decide', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }), { ...deps, config: watch });
    assert.equal((await get()).status, 401);
    assert.equal((await get('tok-ana-000000000')).status, 403);
    const res = await get('tok-kimani-000000');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.setup.mode, 'watch');
    assert.equal(body.setup.jevKey, true);
    assert.equal(body.setup.zdr, true, 'zero retention is on unless CR_JEV_ZDR is off');
    assert.doesNotMatch(JSON.stringify(body), /test-key-not-real/);
    assert.equal(body.coverage.questions.answered, 6);
    assert.equal(body.coverage.droppedQuestionsByReason.unanswered, 1);
    assert.ok(body.coverage.droppedRequestsByReason['no-key'] >= 1);
    assert.ok(body.coverage.droppedRequestsByReason['out-of-time'] >= 1);
    assert.deepEqual(body.cost.byModel.map((c: { provider: string; inputTokens: number; usd: number }) => [c.provider, c.inputTokens, c.usd]), [['jev', 520, 0.00002184]]);
    assert.equal(body.agreement.state, 'unmeasured');
    const post = (token: string, action: string) => handleDecide(new Request('https://site/api/comp-report/decide', {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action }),
    }), { ...deps, config: watch, fetchImpl: (async () => new Response(null, { status: 202 })) as unknown as typeof fetch });
    assert.equal((await post('tok-ana-000000000', 'drain')).status, 403);
    assert.deepEqual(await (await post('tok-kimani-000000', 'drain')).json(), { kicked: true });
    assert.equal((await post('tok-kimani-000000', 'nope')).status, 400);
  });
});
