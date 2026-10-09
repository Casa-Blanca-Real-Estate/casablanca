// MindBinder's verify-jev-transport.ts, ported to the durable queue: a
// simulated Gateway on a fake clock. The Gateway is modelled as MindBinder
// measured it after Jev's free window closed — a per-minute window of a few
// requests, a 429 whose Retry-After counts down to the window's end, and 503s
// for up to ~2 minutes at a stretch. No network, no real time.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decideConfig } from './config.ts';
import { drain, type Clock } from './drain.ts';
import type { HaikuClient } from './haiku.ts';
import { JEV_MAX_ATTEMPTS, jevRetryDelayMs, JEV_MAX_RETRY_WAIT_MS } from './jev.ts';
import { REGISTRY_VERSION } from './registry.ts';
import { wireCount } from './render.ts';
import { MemoryStore, type NewRequest } from './store.ts';

const KEYED = decideConfig({ CR_JEV_MODE: 'watch', AI_GATEWAY_API_KEY: 'test-key-not-real', JEV_MIN_INTERVAL_MS: '1000' });
const QIDS = ['condition', 'sponsor_unit'];

/** A full, valid answer to QIDS. */
function answerBody(extra: Record<string, unknown> = {}) {
  const probs = { renovated: 0.9, good: 0.05, needs_work: 0.03, not_stated: 0.02 };
  return JSON.stringify({
    model: 'typesafe-ai/jev',
    answers: {
      condition__fwd: { type: 'choice', choice: 'renovated', probabilities: probs },
      condition__rev: { type: 'choice', choice: 'renovated', probabilities: probs },
      sponsor_unit: { type: 'boolean', probability: 0.97 },
      ...extra,
    },
    usage: { inputTokens: 400 },
  });
}

function fakeClock(): Clock & { t: number } {
  const c = { t: 1_000_000, now: () => c.t, sleep: async (ms: number) => { c.t += Math.max(0, ms); } };
  return c;
}

function request(n: number): NewRequest {
  return {
    lane: 'listing',
    target: { kind: 'property_observation', observationId: n },
    questionIds: QIDS,
    wireQuestions: wireCount(QIDS),
    registryVersion: REGISTRY_VERSION,
    state: { listing: `[listing] A renovated home, number ${n}, with a new kitchen and baths.` },
    stateHash: 'a'.repeat(64),
    userEmail: 'ana@casa-blanca.com',
  };
}

async function fill(store: MemoryStore, clock: Clock, n: number) {
  for (let i = 1; i <= n; i++) await store.enqueue(request(i), clock.now(), 5_000);
}

/** A Gateway with a fixed per-minute window: `perMinute` requests, then 429 + Retry-After to the window's end. */
function rateLimitedGateway(clock: Clock, perMinute: number) {
  let windowStart = 0;
  let used = 0;
  const starts: number[] = [];
  const rejectedAt: number[] = [];
  const fetchImpl = (async () => {
    const t = clock.now();
    if (t >= windowStart + 60_000) { windowStart = t - (t % 60_000); used = 0; }
    starts.push(t);
    if (used >= perMinute) {
      rejectedAt.push(t);
      return new Response('rate limited', { status: 429, headers: { 'retry-after': String(Math.ceil((windowStart + 60_000 - t) / 1000)) } });
    }
    used++;
    return new Response(answerBody(), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, starts, rejectedAt };
}

const run = (store: MemoryStore, clock: Clock, fetchImpl: typeof fetch, extra: Partial<Parameters<typeof drain>[0]> = {}) =>
  drain({ store, clock, config: KEYED, fetchImpl, haiku: null, holder: 'drainer-a', budgetMs: 3 * 60 * 60_000, ...extra });

describe('the wait before a retry', () => {
  test('Retry-After wins, as seconds or a date, clamped to 1 s – 180 s; otherwise 2 s doubling to 60 s', () => {
    assert.equal(jevRetryDelayMs(1, '60', 0), 60_000);
    assert.equal(jevRetryDelayMs(1, '0', 0), 1_000);
    assert.equal(jevRetryDelayMs(1, '0.2', 0), 1_000);
    assert.equal(jevRetryDelayMs(1, '86400', 0), JEV_MAX_RETRY_WAIT_MS);
    const now = Date.parse('2026-09-26T12:00:00Z');
    assert.equal(jevRetryDelayMs(1, 'Sat, 26 Sep 2026 12:00:30 GMT', now), 30_000);
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((a) => jevRetryDelayMs(a, null, 0)), [2000, 4000, 8000, 16000, 32000, 60000, 60000]);
  });
});

describe('the durable queue on a simulated Gateway', () => {
  test('a burst under a per-minute limit: every request answered, and a 429 holds the whole queue', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 20);
    const gw = rateLimitedGateway(clock, 3);
    const report = await run(store, clock, gw.fetchImpl);
    assert.equal(report.answered, 20, JSON.stringify(report));
    assert.equal(report.dropped, 0);
    assert.ok(store.rows.every((r) => r.status === 'answered'));
    assert.ok(gw.rejectedAt.length <= 7, `about one 429 per window (${gw.rejectedAt.length})`);
    // After a 429, no request starts until its Retry-After has passed.
    for (const r of gw.rejectedAt) assert.ok(!gw.starts.some((s) => s > r && s < r + 1_000), 'the whole queue waits');
    const gaps = gw.starts.slice(1).map((s, i) => s - gw.starts[i]!);
    assert.ok(gaps.every((g) => g >= 1_000), `paced at least the interval apart (${gaps.join(',')})`);
    assert.equal(store.judgments.length, 40, 'two registry questions per listing');
    assert.ok(store.judgments.every((j) => j.landed === 'watch'), 'nothing lands above watch');
  });

  test('before: the old two-try client keeps 3 of the same 20', async () => {
    const clock = fakeClock();
    const gw = rateLimitedGateway(clock, 3);
    let answered = 0;
    for (let i = 0; i < 20; i++) {
      for (let a = 1; a <= 2; a++) {
        const r = await gw.fetchImpl('x' as unknown as URL);
        if (r.ok) { answered++; break; }
      }
    }
    assert.equal(answered, 3);
  });

  test('pacing: requests start at least JEV_MIN_INTERVAL_MS apart (12.5 s by default)', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 5);
    const starts: number[] = [];
    const config = decideConfig({ CR_JEV_MODE: 'watch', AI_GATEWAY_API_KEY: 'k' });
    assert.equal(config.minIntervalMs, 12_500);
    await run(store, clock, (async () => { starts.push(clock.now()); return new Response(answerBody()); }) as unknown as typeof fetch, { config });
    const gaps = starts.slice(1).map((s, i) => s - starts[i]!);
    assert.ok(gaps.every((g) => g >= 12_500), gaps.join(','));
  });

  test('112 s of 503s is ridden out', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 1);
    const t0 = clock.now();
    let calls = 0;
    const report = await run(store, clock, (async () => {
      calls++;
      return clock.now() - t0 < 112_000 ? new Response('upstream down', { status: 503 }) : new Response(answerBody());
    }) as unknown as typeof fetch);
    assert.equal(report.answered, 1);
    assert.ok(calls <= JEV_MAX_ATTEMPTS, `answered after ${calls} attempts`);
    assert.ok(clock.now() - t0 >= 112_000);
  });

  test('a 503 that never clears: 12 attempts, then dropped as retries-exhausted', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 1);
    let calls = 0;
    await run(store, clock, (async () => { calls++; return new Response('down', { status: 503 }); }) as unknown as typeof fetch);
    assert.equal(calls, JEV_MAX_ATTEMPTS);
    assert.equal(store.rows[0]!.dropReason, 'retries-exhausted');
  });

  test('a dropped connection is retried for that request only, and the others go on', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 2);
    const seen: number[] = [];
    let first = 0;
    const report = await run(store, clock, (async (_url: unknown, init: RequestInit) => {
      const n = JSON.parse(String(init.body)).state.listing.match(/number (\d+)/)[1];
      seen.push(Number(n));
      if (n === '1' && ++first < 3) throw new Error('socket hang up');
      return new Response(answerBody());
    }) as unknown as typeof fetch);
    assert.equal(report.answered, 2);
    assert.deepEqual(seen.slice(0, 2), [1, 2], 'request 2 went while request 1 backed off');
    assert.equal(store.rows[0]!.item.attempts, 3);
  });

  test('a network that never comes back: dropped as network after 12 attempts', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 1);
    let calls = 0;
    await run(store, clock, (async () => { calls++; throw new Error('ECONNRESET'); }) as unknown as typeof fetch);
    assert.equal(calls, JEV_MAX_ATTEMPTS);
    assert.equal(store.rows[0]!.dropReason, 'network');
  });

  test('not retried: a malformed body, a 403 account gate, a 400 privacy refusal', async () => {
    for (const [res, reason] of [
      [() => new Response('{not json', { status: 200 }), 'malformed'],
      [() => new Response('{"error":"customer_verification_required"}', { status: 403 }), 'http-403'],
      [() => new Response('no provider satisfies zeroDataRetention', { status: 400 }), 'http-400'],
    ] as const) {
      const clock = fakeClock();
      const store = new MemoryStore();
      await fill(store, clock, 1);
      let calls = 0;
      await run(store, clock, (async () => { calls++; return res(); }) as unknown as typeof fetch);
      assert.equal(calls, 1, reason);
      assert.equal(store.rows[0]!.dropReason, reason);
    }
  });

  test('no key: nothing is sent, and the drop is named no-key', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 2);
    const config = decideConfig({ CR_JEV_MODE: 'watch' });
    const report = await run(store, clock, (async () => { throw new Error('must not be called'); }) as unknown as typeof fetch, { config });
    assert.equal(report.dropped, 2);
    assert.ok(store.rows.every((r) => r.dropReason === 'no-key'));
  });

  test('a 200 missing some answers records them as unanswered', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 1);
    const partial = JSON.parse(answerBody());
    delete partial.answers.condition__rev;
    await run(store, clock, (async () => new Response(JSON.stringify(partial))) as unknown as typeof fetch);
    const row = store.rows[0]!;
    assert.equal(row.status, 'answered');
    assert.deepEqual(row.unanswered, ['condition'], 'a choice with one order missing is unanswered');
    assert.equal(row.dropReason, 'unanswered');
    assert.deepEqual(store.judgments.map((j) => j.questionId), ['sponsor_unit']);
  });

  test('queue-full: past the cap, a request is recorded dropped at once', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    for (let i = 1; i <= 3; i++) await store.enqueue(request(i), clock.now(), 2);
    assert.deepEqual(store.rows.map((r) => r.status), ['queued', 'queued', 'dropped']);
    assert.equal(store.rows[2]!.dropReason, 'queue-full');
  });

  test('a drainer out of time requeues its request once, and the second time drops it as out-of-time', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 1);
    const busy = (async () => new Response('down', { status: 503, headers: { 'retry-after': '120' } })) as unknown as typeof fetch;
    const first = await run(store, clock, busy, { budgetMs: 90_000 });
    assert.equal(first.again, true, 'it asks to be invoked again');
    assert.equal(store.rows[0]!.status, 'queued');
    assert.equal(store.rows[0]!.item.requeues, 1);
    await run(store, clock, busy, { budgetMs: 90_000, holder: 'drainer-b' });
    assert.equal(store.rows[0]!.status, 'dropped');
    assert.equal(store.rows[0]!.dropReason, 'out-of-time');
  });
});

describe('one drainer at a time', () => {
  test('two drainers racing for the lease: one drains, the other stands down', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 3);
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = (async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      return new Response(answerBody());
    }) as unknown as typeof fetch;
    const [a, b] = await Promise.all([run(store, clock, fetchImpl), run(store, clock, fetchImpl, { holder: 'drainer-b' })]);
    assert.equal([a, b].filter((r) => r.ran).length, 1);
    assert.equal(a.answered + b.answered, 3);
    assert.equal(maxInFlight, 1);
  });

  test("a dead drainer's lease expires, and the next one requeues what it left running", async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 1);
    // A drainer takes the lease and a request, then dies.
    assert.ok(await store.acquireLease('dead', clock.now(), 120_000));
    await store.claimNext('dead', clock.now());
    const early = await run(store, clock, (async () => new Response(answerBody())) as unknown as typeof fetch);
    assert.equal(early.ran, false, 'not while its lease lives');
    clock.t += 121_000;
    const later = await run(store, clock, (async () => new Response(answerBody())) as unknown as typeof fetch);
    assert.equal(later.ran, true);
    assert.equal(later.requeued, 1);
    assert.equal(store.rows[0]!.status, 'answered');
  });
});

describe('the fallback', () => {
  function haikuClient(calls: Array<Record<string, unknown>>): HaikuClient {
    return {
      messages: {
        async create(params) {
          calls.push(params);
          const schema = (params.output_config as { format: { schema: { properties: Record<string, unknown> } } }).format.schema;
          const out: Record<string, unknown> = {};
          for (const id of Object.keys(schema.properties)) {
            out[id] = id.startsWith('condition')
              ? { choice: 'good', probabilities: { renovated: 0.1, good: 0.8, needs_work: 0.05, not_stated: 0.05 } }
              : { probability_yes: 0.2 };
          }
          return { model: 'claude-haiku-4-5-20251001', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 900, output_tokens: 80 } };
        },
      },
    };
  }

  test('runs when Jev can\'t answer and its switch is on, through the same registry and parser', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 1);
    const calls: Array<Record<string, unknown>> = [];
    const config = decideConfig({ CR_JEV_MODE: 'watch', CR_DECIDE_FALLBACK: 'haiku', ANTHROPIC_API_KEY: 'x' });
    await run(store, clock, (async () => { throw new Error('no Jev call without a key'); }) as unknown as typeof fetch, { config, haiku: haikuClient(calls) });
    assert.equal(calls.length, 2, 'one call per option order');
    assert.equal(calls[0]!.model, 'claude-haiku-4-5-20251001');
    const row = store.rows[0]!;
    assert.equal(row.status, 'answered');
    assert.equal(row.provider, 'haiku');
    assert.deepEqual(store.judgments.map((j) => [j.questionId, j.provider, j.answer, j.landed]), [
      ['condition', 'haiku', 'good', 'watch'], ['sponsor_unit', 'haiku', 'false', 'watch'],
    ]);
    assert.equal(store.usage[0]!.provider, 'anthropic');
    assert.equal(store.usage[0]!.costUsd, (2 * 900 * 1 + 2 * 80 * 5) / 1e6, "both calls, at Haiku's own price");
    // The choice is constrained to its option keys.
    const schema = (calls[0]!.output_config as { format: { schema: { properties: { condition__fwd: { properties: { choice: { enum: string[] } } } } } } }).format.schema;
    assert.deepEqual(schema.properties.condition__fwd.properties.choice.enum, ['renovated', 'good', 'needs_work', 'not_stated']);
    const rev = (calls[1]!.output_config as { format: { schema: { properties: Record<string, { properties: { choice: { enum: string[] } } }> } } }).format.schema;
    assert.deepEqual(rev.properties.condition__rev!.properties.choice.enum, ['not_stated', 'needs_work', 'good', 'renovated']);
  });

  test('also after retries are exhausted; never while its switch is off; never after a 400 refusal', async () => {
    const cases = [
      { fallback: 'haiku', status: 503, expectCalls: 2, reason: null },
      { fallback: 'off', status: 503, expectCalls: 0, reason: 'retries-exhausted' },
      { fallback: 'haiku', status: 400, expectCalls: 0, reason: 'http-400' },
    ];
    for (const c of cases) {
      const clock = fakeClock();
      const store = new MemoryStore();
      await fill(store, clock, 1);
      const calls: Array<Record<string, unknown>> = [];
      const config = decideConfig({ ...{ CR_JEV_MODE: 'watch', AI_GATEWAY_API_KEY: 'k', JEV_MIN_INTERVAL_MS: '0' }, CR_DECIDE_FALLBACK: c.fallback, ANTHROPIC_API_KEY: 'x' });
      await run(store, clock, (async () => new Response('x', { status: c.status })) as unknown as typeof fetch, { config, haiku: haikuClient(calls) });
      assert.equal(calls.length, c.expectCalls, JSON.stringify(c));
      assert.equal(store.rows[0]!.dropReason, c.reason, JSON.stringify(c));
    }
  });

  test('a question neither provider answers is recorded dropped — never guessed', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 1);
    const failing: HaikuClient = { messages: { create: async () => { throw Object.assign(new Error('overloaded'), { status: 529 }); } } };
    const config = decideConfig({ CR_JEV_MODE: 'watch', CR_DECIDE_FALLBACK: 'haiku', ANTHROPIC_API_KEY: 'x' });
    await run(store, clock, (async () => new Response('')) as unknown as typeof fetch, { config, haiku: failing });
    const row = store.rows[0]!;
    assert.equal(row.status, 'dropped');
    assert.equal(row.dropReason, 'no-key');
    assert.deepEqual(row.detail.fallback, { reason: 'http-529' });
    assert.equal(store.judgments.length, 0);
  });
});

describe('zero retention as a switch (CR_JEV_ZDR)', () => {
  test('off, a public lane is sent with no training only, and the ledger says so', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 1);
    const bodies: Array<{ providerOptions: unknown }> = [];
    const config = decideConfig({ CR_JEV_MODE: 'watch', AI_GATEWAY_API_KEY: 'k', CR_JEV_ZDR: 'off' });
    await run(store, clock, (async (_u: unknown, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return new Response(answerBody()); }) as unknown as typeof fetch, { config });
    assert.deepEqual(bodies.map((b) => b.providerOptions), [{ gateway: { disallowPromptTraining: true } }]);
    assert.equal(store.rows[0]!.status, 'answered');
    assert.equal(store.rows[0]!.detail.zdr, false);
    assert.equal(store.usage[0]!.detail.zdr, false);
  });

  test('off, a private lane is refused before it is sent — by Jev and by the fallback — as zdr-required', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 2);
    const haikuCalls: unknown[] = [];
    const haiku: HaikuClient = { messages: { create: async (p) => { haikuCalls.push(p); throw new Error('must not be called'); } } };
    const config = decideConfig({ CR_JEV_MODE: 'watch', AI_GATEWAY_API_KEY: 'k', CR_JEV_ZDR: 'off', CR_DECIDE_FALLBACK: 'haiku', ANTHROPIC_API_KEY: 'x' });
    const report = await run(store, clock, (async () => { throw new Error('must not be called'); }) as unknown as typeof fetch,
      { config, haiku, lanes: { listing: 'private' } });
    assert.equal(report.dropped, 2);
    assert.deepEqual(report.byReason, { 'zdr-required': 2 });
    assert.ok(store.rows.every((r) => r.status === 'dropped' && r.dropReason === 'zdr-required'));
    assert.deepEqual(haikuCalls, []);
    assert.equal(store.usage.length, 0);
  });

  test('on (the default), a private lane is sent, with both flags', async () => {
    const clock = fakeClock();
    const store = new MemoryStore();
    await fill(store, clock, 1);
    const bodies: Array<{ providerOptions: unknown }> = [];
    await run(store, clock, (async (_u: unknown, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return new Response(answerBody()); }) as unknown as typeof fetch,
      { lanes: { listing: 'private' } });
    assert.deepEqual(bodies.map((b) => b.providerOptions), [{ gateway: { disallowPromptTraining: true, zeroDataRetention: true } }]);
    assert.equal(store.rows[0]!.status, 'answered');
  });
});
