// Phase 2, before the first live call (Dispatch 10), with no network: the
// fixtures, the go/no-go call, Haiku as a second judge, the weekly drift
// check, the labelled batch, the labels sheet and the agreement maths, and the
// session key's setting. The database side is in db/decide.test.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkListingLink } from '../links.ts';
import { agreement, BAR_RULE, isPositive, proposeBar, readLabelSheet, reportBand, SHEET_HEADER, type LabelRow } from './agreement.ts';
import { configSummary, decideConfig } from './config.ts';
import { drain, type Clock } from './drain.ts';
import { driftBatch, enqueueDriftCheck, fixtureRequest } from './drift.ts';
import { canonicalSourceUrl, DRAIN_PATH, listingRequest } from './enqueue.ts';
import { FIXTURES, fixtureState, PROBE_FIXTURE } from './fixtures.ts';
import type { HaikuClient } from './haiku.ts';
import { JEV_PROVIDER_OPTIONS, JEV_PROVIDER_OPTIONS_NO_ZDR } from './jev.ts';
import { enqueueLabelledBatch } from './labelled.ts';
import { QUESTION_BY_ID, QUESTIONS, REGISTRY_VERSION } from './registry.ts';
import { renderRequest, wireCount } from './render.ts';
import { scrubListingText } from './scrub.ts';
import { probeInput, ProbeInputError, runProbe } from './probe.ts';
import { MemoryStore, type NewRequest } from './store.ts';
import { sameKey } from '../api/decide.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');

const env = (extra: Record<string, string> = {}) => decideConfig({
  CR_JEV_MODE: 'watch', AI_GATEWAY_API_KEY: 'test-key-not-real', JEV_MIN_INTERVAL_MS: '1000', ...extra,
});

function fakeClock(): Clock & { t: number } {
  const c = { t: 2_000_000, now: () => c.t, sleep: async (ms: number) => { c.t += Math.max(0, ms); } };
  return c;
}

/** A Gateway that answers every wire question it's asked, with the given choice and P(true). */
function answeringGateway(opts: { choice?: (wire: string, keys: string[]) => string; p?: number; omit?: string[] } = {}) {
  const calls: Array<Record<string, any>> = [];
  const fetchImpl = (async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push(body);
    const answers: Record<string, unknown> = {};
    for (const [id, q] of Object.entries(body.questions as Record<string, any>)) {
      if (opts.omit?.includes(id)) continue;
      if (q.type === 'choice') {
        const keys = Object.keys(q.criteria);
        const pick = opts.choice ? opts.choice(id, keys) : keys[0]!;
        answers[id] = { type: 'choice', choice: pick, probabilities: Object.fromEntries(keys.map((k) => [k, k === pick ? 0.91 : 0.09 / (keys.length - 1)])) };
      } else {
        answers[id] = { type: 'boolean', probability: opts.p ?? 0.95 };
      }
    }
    return new Response(JSON.stringify({ model: 'typesafe-ai/jev', answers, usage: { inputTokens: 600 } }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** A Haiku client that answers the first option of every choice and P(yes) = 0.8, in whatever order it's given. */
function fakeHaiku() {
  const calls: Array<Record<string, any>> = [];
  const client: HaikuClient = {
    messages: {
      async create(params) {
        calls.push(params);
        const schema = (params as any).output_config.format.schema as { properties: Record<string, any> };
        const out: Record<string, unknown> = {};
        for (const [id, s] of Object.entries(schema.properties)) {
          if (s.properties.choice) {
            const keys: string[] = s.properties.choice.enum;
            out[id] = { choice: keys[0], probabilities: Object.fromEntries(keys.map((k, i) => [k, i === 0 ? 0.7 : 0.3 / (keys.length - 1)])) };
          } else {
            out[id] = { probability_yes: 0.8 };
          }
        }
        return { model: 'claude-haiku-4-5-20251001', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 900, output_tokens: 120 } };
      },
    },
  };
  return { client, calls };
}

const ALL = QUESTIONS.map((q) => q.id);
function listingReq(n: number, extra: Partial<NewRequest> = {}): NewRequest {
  const state = { listing: `[listing] A renovated home, number ${n}, with a new kitchen and baths.` };
  return {
    lane: 'listing', target: { kind: 'property_observation', observationId: n }, questionIds: ALL, wireQuestions: wireCount(ALL),
    registryVersion: REGISTRY_VERSION, state, stateHash: 'c'.repeat(64), userEmail: 'ana@casa-blanca.com', ...extra,
  };
}

describe('the fixtures', () => {
  test('hold no user data: the scrub leaves every text exactly as written', () => {
    for (const f of FIXTURES) {
      const s = scrubListingText(f.text, { names: ['Ana Agent', 'Kimani Admin'] });
      assert.equal(s.text, `[listing] ${f.text}`, f.id);
      assert.deepEqual(s.removed, { emails: 0, phones: 0, links: 0, lines: 0, names: 0 }, f.id);
      assert.deepEqual(fixtureState(f), { listing: `[listing] ${f.text}` });
    }
  });

  test('each expects a real answer to every question, and the probe\'s fixture has a clear yes or a named class for each', () => {
    const ids = new Set<string>();
    for (const f of FIXTURES) {
      assert.match(f.id, /^[a-z0-9][a-z0-9-]{0,47}$/);
      assert.ok(!ids.has(f.id));
      ids.add(f.id);
      assert.deepEqual(Object.keys(f.expected).sort(), [...ALL].sort(), f.id);
      for (const [qid, v] of Object.entries(f.expected)) {
        const q = QUESTION_BY_ID.get(qid)!;
        if (q.type === 'choice') assert.ok(q.options.some((o) => o.key === v), `${f.id}.${qid}`);
        else assert.ok(v === 'true' || v === 'false', `${f.id}.${qid}`);
      }
    }
    for (const q of QUESTIONS) {
      if (q.type === 'choice') assert.notEqual(PROBE_FIXTURE.expected[q.id], q.abstain, `the go/no-go fixture names a class for ${q.id}`);
    }
    const yes = QUESTIONS.filter((q) => q.type === 'boolean' && PROBE_FIXTURE.expected[q.id] === 'true').length;
    assert.ok(yes >= 3, 'and says yes to most of the yes/no questions');
  });
});

describe('the go/no-go call', () => {
  const run = (store: MemoryStore, fetchImpl: typeof fetch, config = env(), extra: Partial<Parameters<typeof runProbe>[0]> = {}) =>
    runProbe({ store, config, fetchImpl, clock: fakeClock(), ...extra });

  test('go: one request — the fixture and every question, both orders — answered whole, its raw body kept, at Jev\'s price', async () => {
    const store = new MemoryStore();
    const gw = answeringGateway({ choice: (_id, keys) => keys[0]! });
    const r = await run(store, gw.fetchImpl, env({ CR_JEV_ZDR: 'off' }));
    assert.equal(gw.calls.length, 1);
    const sent = gw.calls[0]!;
    assert.deepEqual(sent.state, fixtureState(PROBE_FIXTURE));
    assert.deepEqual(Object.keys(sent.questions).sort(), Object.keys(renderRequest(ALL)).sort());
    assert.equal(Object.keys(sent.questions).length, 10);
    assert.deepEqual(sent.providerOptions, JEV_PROVIDER_OPTIONS_NO_ZDR, 'zero retention off: no training only');
    assert.equal(r.sent, true);
    assert.equal(r.ok, true);
    assert.equal(r.outcome, 'answered');
    assert.equal(r.status, 200);
    assert.equal(r.zdr, false);
    assert.deepEqual(r.unanswered, []);
    assert.match(r.raw!, /"answers"/);
    assert.equal(store.probes.length, 1);
    assert.equal(store.probes[0]!.raw, r.raw);
    assert.deepEqual(store.usage.map((u) => [u.provider, u.purpose, u.inputTokens, u.costUsd]), [['jev', 'decide:probe', 600, 600 * 0.042 / 1e6]]);
    assert.equal(store.nextStartAt > 0, true, 'it takes its turn in the shared pacing');
    assert.equal(r.matches.condition, true, 'the first option is "renovated", as the fixture expects');
  });

  test('zero retention on (the default): both flags on the wire', async () => {
    const gw = answeringGateway();
    await run(new MemoryStore(), gw.fetchImpl);
    assert.deepEqual(gw.calls[0]!.providerOptions, JEV_PROVIDER_OPTIONS);
  });

  test('no-go: an account gate\'s 403 is sent once, kept raw, and named — no retry, no usage', async () => {
    const store = new MemoryStore();
    let calls = 0;
    const fetchImpl = (async () => { calls++; return new Response('{"error":"customer_verification_required"}', { status: 403 }); }) as unknown as typeof fetch;
    const r = await run(store, fetchImpl);
    assert.equal(calls, 1);
    assert.deepEqual([r.ok, r.outcome, r.status], [false, 'http-403', 403]);
    assert.match(r.raw!, /customer_verification_required/);
    assert.equal(store.usage.length, 0);
    assert.equal(store.probes[0]!.outcome, 'http-403');
  });

  test('no-go: a 503 stops it, and its Retry-After holds every request', async () => {
    const store = new MemoryStore();
    const clock = fakeClock();
    const fetchImpl = (async () => new Response('busy', { status: 503, headers: { 'retry-after': '40' } })) as unknown as typeof fetch;
    const r = await runProbe({ store, config: env(), fetchImpl, clock });
    assert.deepEqual([r.ok, r.outcome, r.retryInMs], [false, 'busy-503', 40_000]);
    assert.equal(store.coolUntil, clock.now() + 40_000);
  });

  test('a 200 missing an answer is no-go, naming what\'s missing; a body that isn\'t a response is malformed', async () => {
    const r = await run(new MemoryStore(), answeringGateway({ omit: ['tenant_in_place'] }).fetchImpl);
    assert.deepEqual([r.ok, r.outcome, r.unanswered], [false, 'unanswered', ['tenant_in_place']]);
    const m = await run(new MemoryStore(), (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch);
    assert.deepEqual([m.ok, m.outcome, m.raw], [false, 'malformed', '<html>']);
  });

  test('nothing is sent with no key, or while the shared pacing or a cool-down says wait', async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return new Response('{}'); }) as unknown as typeof fetch;
    const noKey = await run(new MemoryStore(), fetchImpl, decideConfig({}));
    assert.deepEqual([noKey.sent, noKey.outcome], [false, 'no-key']);
    const store = new MemoryStore();
    store.coolUntil = 2_000_000 + 30_000;
    const busy = await run(store, fetchImpl);
    assert.deepEqual([busy.sent, busy.outcome, busy.retryInMs], [false, 'busy', 30_000]);
    assert.equal(calls, 0);
    assert.equal(store.probes.length, 0);
  });

  test('another fixture, or one wire question alone: the order check; unknown ids are refused', async () => {
    const gw = answeringGateway();
    const r = await run(new MemoryStore(), gw.fetchImpl, env(), { fixtureId: 'estate-needs-work', wireIds: ['condition__rev'] });
    assert.deepEqual(Object.keys(gw.calls[0]!.questions), ['condition__rev']);
    assert.equal(gw.calls[0]!.state.listing, fixtureState(FIXTURES[1]!).listing);
    assert.equal(r.ok, true, 'every wire question asked came back');
    assert.ok((r.answers as any).wire.condition__rev, 'the raw answer per wire question is kept');
    assert.equal((r.answers as any).condition, undefined, 'one order alone makes no verdict');
    assert.throws(() => probeInput({ fixtureId: 'no-such' }), ProbeInputError);
    assert.throws(() => probeInput({ wireIds: ['condition'] }), ProbeInputError, 'a choice is asked by its order');
    assert.throws(() => probeInput({ wireIds: [] }), ProbeInputError);
  });
});

describe('Haiku as a second judge (the labelled batch only)', () => {
  const run = (store: MemoryStore, fetchImpl: typeof fetch, extra: Partial<Parameters<typeof drain>[0]> = {}) =>
    drain({ store, clock: fakeClock(), config: env(), fetchImpl, haiku: null, holder: 'd', budgetMs: 60 * 60_000, ...extra });

  test('a request that asks for one gets Jev\'s answers and Haiku\'s, each a judgment of its own; the request is Jev\'s', async () => {
    const store = new MemoryStore();
    await store.enqueue(listingReq(1, { secondJudge: true, batch: 'labels-v1' }), 0, 100);
    const h = fakeHaiku();
    const report = await run(store, answeringGateway().fetchImpl, { secondJudge: h.client });
    assert.equal(report.answered, 1);
    assert.equal(h.calls.length, 2, 'both option orders');
    const by = (p: string) => store.judgments.filter((j) => j.provider === p).map((j) => j.questionId);
    assert.deepEqual(by('jev'), ALL);
    assert.deepEqual(by('haiku'), ALL);
    assert.ok(store.judgments.every((j) => j.landed === 'watch'));
    assert.equal(store.rows[0]!.provider, 'jev');
    assert.deepEqual(store.usage.map((u) => [u.provider, u.detail.secondJudge ?? false]), [['jev', false], ['anthropic', true]]);
    assert.deepEqual(store.rows[0]!.detail.secondJudge, { answered: 7, unanswered: [] });
  });

  test('when Jev drops the request, Haiku\'s answers are still kept; the drop keeps its name', async () => {
    const store = new MemoryStore();
    await store.enqueue(listingReq(2, { secondJudge: true }), 0, 100);
    const h = fakeHaiku();
    const gate = (async () => new Response('gate', { status: 403 })) as unknown as typeof fetch;
    await run(store, gate, { secondJudge: h.client });
    assert.deepEqual([store.rows[0]!.status, store.rows[0]!.dropReason], ['dropped', 'http-403']);
    assert.equal(store.judgments.filter((j) => j.provider === 'haiku').length, 7);
  });

  test('never asked for an import\'s request, never without a key, never for private text with zero retention off', async () => {
    const plain = new MemoryStore();
    await plain.enqueue(listingReq(3), 0, 100);
    const h = fakeHaiku();
    await run(plain, answeringGateway().fetchImpl, { secondJudge: h.client });
    assert.equal(h.calls.length, 0);
    assert.ok(plain.judgments.every((j) => j.provider === 'jev'));

    const noKey = new MemoryStore();
    await noKey.enqueue(listingReq(4, { secondJudge: true }), 0, 100);
    await run(noKey, answeringGateway().fetchImpl, { secondJudge: null });
    assert.deepEqual(noKey.rows[0]!.detail.secondJudge, { reason: 'no-key' });

    const priv = new MemoryStore();
    await priv.enqueue(listingReq(5, { secondJudge: true }), 0, 100);
    let sent = 0;
    await run(priv, (async () => { sent++; return new Response('{}'); }) as unknown as typeof fetch, {
      secondJudge: h.client, config: env({ CR_JEV_ZDR: 'off' }), lanes: { listing: 'private' },
    });
    assert.deepEqual([priv.rows[0]!.dropReason, sent, h.calls.length], ['zdr-required', 0, 0]);
  });
});

describe('the weekly drift check', () => {
  test('one batch per ISO week, named for it', () => {
    assert.equal(driftBatch(Date.parse('2026-10-14T12:00:00Z')), 'drift-2026-w42');
    assert.equal(driftBatch(Date.parse('2026-10-12T00:00:00Z')), 'drift-2026-w42', 'Monday starts it');
    assert.equal(driftBatch(Date.parse('2026-10-18T23:59:00Z')), 'drift-2026-w42', 'Sunday ends it');
    assert.equal(driftBatch(Date.parse('2027-01-01T08:00:00Z')), 'drift-2026-w53', '2026 has 53 weeks');
    assert.equal(driftBatch(Date.parse('2025-12-29T08:00:00Z')), 'drift-2026-w01');
  });

  test('queues every fixture with every question, once a week, and only in watch mode with the key', async () => {
    const now = Date.parse('2026-10-14T12:00:00Z');
    const kicks: string[] = [];
    const fetchImpl = (async (url: URL | string) => { kicks.push(String(url)); return new Response(null, { status: 202 }); }) as unknown as typeof fetch;
    const store = new MemoryStore();
    assert.deepEqual(await enqueueDriftCheck({ store, config: decideConfig({}), nowMs: now, origin: 'https://site' }), { queued: false, why: 'off', batch: 'drift-2026-w42' });
    assert.equal((await enqueueDriftCheck({ store, config: decideConfig({ CR_JEV_MODE: 'watch' }), nowMs: now, origin: 'https://site' })).queued, false);
    const r = await enqueueDriftCheck({ store, config: env(), nowMs: now, origin: 'https://site', fetchImpl });
    assert.ok(r.queued);
    assert.equal(r.requests.length, FIXTURES.length);
    assert.deepEqual(kicks, [`https://site${DRAIN_PATH}`]);
    for (const [i, row] of store.rows.entries()) {
      assert.deepEqual(row.item.target, { kind: 'fixture', fixtureId: FIXTURES[i]!.id });
      assert.deepEqual(row.item.questionIds, ALL);
      assert.equal(row.item.batch, 'drift-2026-w42');
      assert.equal(row.item.secondJudge, false);
    }
    assert.deepEqual(await enqueueDriftCheck({ store, config: env(), nowMs: now + 86_400_000, origin: 'https://site', fetchImpl }),
      { queued: false, why: 'already-this-week', batch: 'drift-2026-w42' });
    assert.equal(store.rows.length, FIXTURES.length);
  });

  test('a fixture request drains like a listing\'s, and its judgments name the fixture', async () => {
    const store = new MemoryStore();
    await store.enqueue(fixtureRequest('nothing-stated', 'drift-2026-w42'), 0, 100);
    await drain({ store, clock: fakeClock(), config: env(), fetchImpl: answeringGateway().fetchImpl, haiku: null, holder: 'd' });
    assert.equal(store.judgments.length, 7);
    assert.ok(store.judgments.every((j) => j.target.kind === 'fixture' && j.target.fixtureId === 'nothing-stated'));
  });
});

describe('the labelled batch', () => {
  const URL_A = 'https://streeteasy.com/building/100-barclay/11f';
  const URL_B = 'https://streeteasy.com/building/the-leonard/5b';

  test('an import records the page its text came from, canonical or not at all', () => {
    const rec = (url: string | null) => listingRequest({
      observationId: 7, record: { facts: {}, listing: { url, confirmed: false, on_confirm: {}, history: [], description: 'A renovated two-bedroom with a new kitchen, new baths and a park view.' } },
    }, []);
    assert.equal((rec(URL_A) as NewRequest).sourceUrl, URL_A);
    assert.equal((rec(null) as NewRequest).sourceUrl, null);
    assert.equal(canonicalSourceUrl(`${URL_A}?sst=abc`), null);
    assert.equal(canonicalSourceUrl('https://example.com/x'), null);
  });

  test('re-asks each page\'s import text with every question and a second judge; reports pages never read', async () => {
    const store = new MemoryStore();
    const imported = await store.enqueue({ ...listingReq(11), questionIds: ['condition'], wireQuestions: 2, sourceUrl: URL_A }, 0, 100);
    const kicks: string[] = [];
    const fetchImpl = (async (url: URL | string) => { kicks.push(String(url)); return new Response(null, { status: 202 }); }) as unknown as typeof fetch;
    const r = await enqueueLabelledBatch({
      store, config: env(), urls: [URL_A, `${URL_A}?sst=x`, URL_B, 'https://example.com/nope'], batch: 'labels-v1', nowMs: 5, origin: 'https://site', fetchImpl,
    });
    assert.ok(r.queued);
    assert.deepEqual(r.requests.map((x) => x.url), [URL_A], 'a repeat of the same page is asked once');
    assert.deepEqual(r.missing, [URL_B]);
    assert.deepEqual(r.invalid, ['https://example.com/nope']);
    assert.equal(kicks.length, 1);
    const row = store.rows.find((x) => x.item.id === r.requests[0]!.requestId)!;
    assert.deepEqual(row.item.questionIds, ALL);
    assert.equal(row.item.secondJudge, true);
    assert.equal(row.item.batch, 'labels-v1');
    assert.deepEqual(row.item.state, store.rows.find((x) => x.item.id === imported.id)!.item.state);
    assert.deepEqual(row.item.target, { kind: 'property_observation', observationId: 11 });
    assert.equal((await store.latestListingState(URL_A))!.requestId, imported.id, 'the batch\'s own rows are never its source');
  });

  test('a name runs once unless rerun; refused in mode off, with no key, or a bad name', async () => {
    const store = new MemoryStore();
    await store.enqueue({ ...listingReq(12), sourceUrl: URL_A }, 0, 100);
    const go = (extra: Partial<Parameters<typeof enqueueLabelledBatch>[0]>) => enqueueLabelledBatch({
      store, config: env(), urls: [URL_A], batch: 'labels-v1', nowMs: 5, origin: null, ...extra,
    });
    assert.equal((await go({})).queued, true);
    assert.deepEqual(await go({}), { queued: false, why: 'batch-exists', batch: 'labels-v1' });
    assert.equal((await go({ rerun: true })).queued, true);
    assert.equal((await go({ config: decideConfig({}) }) as { why: string }).why, 'off');
    assert.equal((await go({ config: decideConfig({ CR_JEV_MODE: 'watch' }) }) as { why: string }).why, 'no-key');
    assert.equal((await go({ batch: 'Labels V1' }) as { why: string }).why, 'bad-batch');
    assert.equal((await go({ batch: 'drift-2026-w42' }) as { why: string }).why, 'bad-batch', 'drift names are the drift check\'s');
    assert.equal((await go({ urls: [] }) as { why: string }).why, 'no-urls');
  });
});

describe('the labels sheet', () => {
  const sheet = readFileSync(join(repo, 'docs/comp-report/jev-labels.csv'), 'utf8');

  test('is well formed: its header, 30 listings, canonical StreetEasy links, every filled cell a real class', () => {
    const { rows, problems } = readLabelSheet(sheet);
    assert.deepEqual(problems, []);
    assert.equal(rows.length, 30);
    assert.equal(sheet.split('\n')[0], SHEET_HEADER.join(','));
    for (const r of rows) assert.ok(checkListingLink(r.url).ok, r.url);
  });

  test('a mistyped cell, a repeated link or a changed header is named, never guessed', () => {
    const head = SHEET_HEADER.join(',');
    const row = (id: string, url: string, cells: Partial<Record<string, string>> = {}) =>
      SHEET_HEADER.map((h) => (h === 'id' ? id : h === 'url' ? url : cells[h] ?? '')).join(',');
    const u = 'https://streeteasy.com/building/100-barclay/11f';
    const { rows, problems } = readLabelSheet([head,
      row('L01', u, { condition: 'Renovated', sponsor_unit: 'Yes', tenant_in_place: 'no' }),
      row('L02', u, { view: 'great' }),
      row('L01', 'https://streeteasy.com/building/the-leonard/5b?x=1', { estate_or_as_is: 'maybe', has_text: 'perhaps' }),
    ].join('\n'));
    assert.deepEqual(rows[0]!.labels, { condition: 'renovated', sponsor_unit: 'true', tenant_in_place: 'false' });
    assert.equal(problems.length, 6, problems.join('\n'));
    assert.ok(problems.some((p) => /view is one of notable, ordinary, not_stated/.test(p)));
    assert.ok(problems.some((p) => /already in the sheet/.test(p)));
    assert.ok(problems.some((p) => /id L01 is used twice/.test(p)));
    assert.ok(problems.some((p) => /write the link as/.test(p)));
    assert.ok(problems.some((p) => /estate_or_as_is is yes or no/.test(p)));
    assert.ok(problems.some((p) => /has_text is yes, no or blank/.test(p)));
    assert.deepEqual(readLabelSheet('id,url\nL01,x').problems.length, 1);
  });
});

describe('agreement with the labels', () => {
  test('a positive label names a class or says yes', () => {
    assert.equal(isPositive('condition', 'good'), true);
    assert.equal(isPositive('condition', 'not_stated'), false);
    assert.equal(isPositive('sponsor_unit', 'true'), true);
    assert.equal(isPositive('sponsor_unit', 'false'), false);
  });

  test('the reporting bands: an order flip is its own band; 0.4–0.6 is "ask"', () => {
    assert.equal(reportBand(0.99, false), 'order-flip');
    assert.equal(reportBand(0.35, true), '<0.4');
    assert.equal(reportBand(0.6, true), '0.4–0.6');
    assert.equal(reportBand(0.61, true), '0.6–0.8');
    assert.equal(reportBand(0.85, true), '0.8–0.9');
    assert.equal(reportBand(0.93, true), '0.9–0.95');
    assert.equal(reportBand(0.95, true), '≥0.95');
  });

  test('a bar is proposed only at a threshold with enough order-stable answers that agree', () => {
    const many = (n: number, p: number, agree: boolean, stable = true, positive = true) => Array.from({ length: n }, () => ({ p, stable, agree, positive }));
    assert.equal(proposeBar(many(BAR_RULE.minAnswers - 1, 0.97, true)).verdict, 'not ready', 'too few');
    const ten = proposeBar(many(10, 0.92, true));
    assert.deepEqual([ten.verdict, ten.high], ['proposed', 0.6]);
    const mixed = proposeBar([...many(10, 0.96, true), ...many(5, 0.75, false)]);
    assert.equal(mixed.high, 0.8, 'below 0.8 the misses pull it under 95%');
    assert.equal(proposeBar(many(20, 0.97, true, false)).verdict, 'not ready', 'order flips never count');
    const mid = proposeBar([...many(9, 0.9, true), ...many(1, 0.9, false)]);
    assert.deepEqual([mid.verdict, mid.middling], ['not ready', 0.6], '90% is a middling bar, not a high one');
    assert.equal(proposeBar([...many(12, 0.97, true, true, false), ...many(2, 0.97, true)]).verdict, 'not ready',
      'agreeing on "not stated" and "no" alone proposes nothing');
    assert.equal(proposeBar([...many(12, 0.97, true, true, false), ...many(3, 0.97, true)]).verdict, 'proposed');
  });

  test('counts per question × provider, skips what isn\'t labelled or has no text, and lists every disagreement', () => {
    const rows: LabelRow[] = [
      { id: 'L01', url: 'u1', hasText: 'yes' as const, labels: { condition: 'renovated', sponsor_unit: 'false' } },
      { id: 'L02', url: 'u2', hasText: '' as const, labels: { condition: 'needs_work' } },
      { id: 'L03', url: 'u3', hasText: 'no' as const, labels: { condition: 'good' } },
    ];
    const j = (url: string, provider: string, question: string, answer: string | null, probability = 0.9, orderStable = true) =>
      ({ url, provider, question, answer, probability, orderStable });
    const result = agreement(rows, [
      j('u1', 'jev', 'condition', 'renovated', 0.97), j('u2', 'jev', 'condition', 'good', 0.7), j('u3', 'jev', 'condition', 'good'),
      j('u1', 'haiku', 'condition', 'renovated', 0.8), j('u1', 'jev', 'sponsor_unit', 'false', 0.99), j('u1', 'jev', 'view', 'notable'),
      j('u2', 'jev', 'sponsor_unit', 'true'),
    ]);
    const c = result.find((r) => r.question === 'condition' && r.provider === 'jev')!;
    assert.deepEqual([c.labelled, c.answered, c.agree], [2, 2, 1]);
    assert.deepEqual(c.bands['≥0.95'], { n: 1, agree: 1 });
    assert.deepEqual(c.bands['0.6–0.8'], { n: 1, agree: 0 });
    assert.deepEqual(c.disagreements.map((d) => [d.id, d.label, d.answer]), [['L02', 'needs_work', 'good']]);
    assert.deepEqual(result.map((r) => `${r.question}/${r.provider}`), ['condition/haiku', 'condition/jev', 'sponsor_unit/jev']);
  });
});

describe('the session key', () => {
  test('needs 32 characters or more; the summary says whether one is set, never what it is', () => {
    assert.equal(decideConfig({ CR_DECIDE_KEY: 'short' }).decideKey, null);
    const k = 'k'.repeat(40);
    const c = decideConfig({ CR_DECIDE_KEY: `  ${k}  ` });
    assert.equal(c.decideKey, k);
    assert.equal(configSummary(c).sessionKey, true);
    assert.doesNotMatch(JSON.stringify(configSummary(c)), /kkkk/);
    assert.equal(configSummary(decideConfig({})).sessionKey, false);
  });

  test('is compared in constant time, whatever the lengths', () => {
    assert.equal(sameKey('a'.repeat(40), 'a'.repeat(40)), true);
    assert.equal(sameKey('a'.repeat(40), 'a'.repeat(39)), false);
    assert.equal(sameKey('', 'a'.repeat(40)), false);
  });
});
