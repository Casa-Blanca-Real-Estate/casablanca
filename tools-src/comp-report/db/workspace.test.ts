// The walkthrough's data (CR-3a) against a real PostgreSQL: saving each step,
// importing an export, sorting comps with append-only reasons, the anchor, the
// sample fills, and who may read or change what.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleComps } from '../server/api/comps.ts';
import { handleImports } from '../server/api/imports.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleSample } from '../server/api/sample.ts';
import { handleWorkspace, type WorkspaceData } from '../server/api/workspace.ts';
import type { PoolLike } from '../server/db.ts';
import type { IdentityUser } from '../server/identity.ts';
import { SAMPLE_INTAKE, SAMPLE_TIERS } from '../server/sample/barclay-17l.ts';
import { ENGINE_VERSION } from '../engine/index.ts';
import { neutralNumbers } from '../server/numbers.ts';
import { withActor } from '../server/db.ts';
import { answerResult } from '../workspace/reading.ts';
import type { RevealPin } from '../workspace/state.ts';
import type { AuthDeps } from '../server/session.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const HANNAH_CSV = readFileSync(new URL('../../../docs/comp-report/sources/streeteasy-comp-export-100-barclay-17l-2026-09-23.csv', import.meta.url));

const PEOPLE: Record<string, string> = {
  'tok-kimani-000000': 'kimani@casa-blanca.com',
  'tok-ana-000000000': 'ana@casa-blanca.com',
  'tok-ben-000000000': 'ben@casa-blanca.com',
};

describe('the walkthrough workspace', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let deps: AuthDeps;

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    deps = {
      verifier: {
        async verify(token: string) {
          const email = PEOPLE[token];
          return email ? ({ id: `id-${token}`, email, confirmed: true, provider: 'google', name: null } as IdentityUser) : null;
        },
        emailConfirmationRequired: async () => true,
      },
      access: accessConfig({ CR_ADMIN_EMAILS: 'kimani@casa-blanca.com' }),
      pool: pool as unknown as PoolLike,
    };
  });
  after(async () => {
    await pool.end();
    await db?.drop();
  });

  const request = (path: string, token: string, method = 'GET', body?: unknown) =>
    new Request(`https://site/api/comp-report/${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const createReport = async (token: string, title: string) =>
    (await (await handleReports(request('reports', token, 'POST', { title }), deps)).json()).report.id as string;
  const workspace = async (token: string, reportId: string, d: AuthDeps = deps) => {
    const res = await handleWorkspace(request(`workspace?report=${reportId}`, token), d);
    return { status: res.status, body: (await res.json()) as WorkspaceData };
  };
  const patch = (token: string, body: unknown) => handleWorkspace(request('workspace', token, 'PATCH', body), deps);
  const importFile = (token: string, body: unknown) => handleImports(request('imports', token, 'POST', body), deps);
  const comps = (token: string, method: string, body: unknown) => handleComps(request('comps', token, method, body), deps);

  let anaReport = '';

  test('a new report starts empty', async () => {
    anaReport = await createReport('tok-ana-000000000', '100 Barclay Street, #17L');
    const { status, body } = await workspace('tok-ana-000000000', anaReport);
    assert.equal(status, 200);
    assert.deepEqual([body.brief, body.call, body.target, body.state, body.imports, body.comps], [{}, null, null, {}, [], []]);
    assert.equal(body.report.sampleData, false);
    assert.equal(body.messageCount, 0);
  });

  test('each step saves, and survives a fresh connection pool', async () => {
    const state = { intake: { areaSqft: { value: 2000, asOf: '2026-09-29', estimate: true } } };
    const brief = { audience: { value: 'seller', asOf: '2026-09-29' } };
    const target = { price: { value: 4250000, asOf: '2026-09-29' } };
    const call = { low: 3400000, high: 4200000, at: '2026-09-29T12:00:00.000Z' };
    const res = await patch('tok-ana-000000000', { reportId: anaReport, state, brief, target, call });
    assert.equal(res.status, 200);
    const fresh = testPool(db.ownerUrl, 1);
    try {
      const { body } = await workspace('tok-ana-000000000', anaReport, { ...deps, pool: fresh as unknown as PoolLike });
      // The call pinned the reveal beside what was saved (no comps yet, so no range in it).
      const { reveal, ...saved } = body.state as { reveal?: Record<string, unknown> };
      assert.deepEqual([saved, body.brief, body.target, body.call], [state, brief, target, call]);
      assert.deepEqual([reveal?.low, reveal?.base, reveal?.high], [null, null, null]);
    } finally {
      await fresh.end();
    }
    // A skipped call reveals the range too; null clears a field.
    assert.equal((await patch('tok-ana-000000000', { reportId: anaReport, call: { skipped: true, at: '2026-09-29T12:01:00.000Z' }, target: null })).status, 200);
    const { body } = await workspace('tok-ana-000000000', anaReport);
    assert.deepEqual([body.call, body.target], [{ skipped: true, at: '2026-09-29T12:01:00.000Z' }, null]);
  });

  test('bad input is refused', async () => {
    const bad = async (body: unknown) => {
      const res = await patch('tok-ana-000000000', { reportId: anaReport, ...(body as object) });
      return [res.status, (await res.json()).error];
    };
    assert.deepEqual(await bad({ call: { low: 5, high: 4, at: 'x' } }), [400, 'bad_call']);
    assert.deepEqual(await bad({ call: { low: 3400000.5, high: 4200000, at: 'x' } }), [400, 'bad_call']);
    assert.deepEqual(await bad({ call: { low: 3400000, high: 4200000 } }), [400, 'bad_call']);
    assert.deepEqual(await bad({ target: { price: { value: -1 } } }), [400, 'bad_target']);
    assert.deepEqual(await bad({ target: { price: { value: 4250000, asOf: '2026-09-29' }, owner: 'broker' } }), [400, 'bad_target']);
    assert.deepEqual(await bad({ brief: { client: { priorities: ['price', 'price'] } } }), [400, 'bad_client']);
    assert.deepEqual(await bad({ brief: { client: { priorities: ['location'] } } }), [400, 'bad_client']);
    assert.deepEqual(await bad({ brief: { client: { urgency: { by: { value: 'soon', asOf: '2026-09-29' } } } } }), [400, 'bad_client']);
    assert.deepEqual(await bad({ brief: { client: { nonNegotiables: { value: 'Adults only building', asOf: '2026-09-29' } } } }), [400, 'fair_housing']);
    assert.deepEqual(await bad({ state: { dealTerms: { template: 'buyer_traditional', financing: { value: 'barter', asOf: '2026-09-29' } } } }), [400, 'bad_terms']);
    assert.deepEqual(await bad({ state: { dealTerms: { template: 'buyer_traditional', preApprovalAmount: { value: 0, asOf: '2026-09-29' } } } }), [400, 'bad_terms']);
    assert.deepEqual(await bad({ state: { dealTerms: { template: 'buyer_traditional', flexibility: { value: 'Wants a safe neighborhood', asOf: '2026-09-29' } } } }), [400, 'fair_housing']);
    assert.deepEqual(await bad({ state: [] }), [400, 'bad_state']);
    assert.deepEqual(await bad({ state: { big: 'x'.repeat(70 * 1024) } }), [413, 'too_large']);
    assert.deepEqual(await bad({}), [400, 'nothing_to_save']);
  });

  test('only the owner can change a report; an admin can read it; another agent can’t see it', async () => {
    assert.equal((await workspace('tok-ben-000000000', anaReport)).status, 404);
    assert.equal((await handleWorkspace(request('workspace', 'tok-ben-000000000', 'PATCH', { reportId: anaReport, brief: {} }), deps)).status, 404);
    assert.equal((await workspace('tok-kimani-000000', anaReport)).status, 200);
    assert.equal((await handleWorkspace(request('workspace', 'tok-kimani-000000', 'PATCH', { reportId: anaReport, brief: {} }), deps)).status, 404);
    assert.equal((await importFile('tok-ben-000000000', { reportId: anaReport, filename: 'x.csv', contentBase64: HANNAH_CSV.toString('base64') })).status, 404);
  });

  test('an export is read by the engine, stored as uploaded, and its comps join the report untiered', async () => {
    const res = await importFile('tok-ana-000000000', { reportId: anaReport, filename: 'hannah.csv', contentBase64: HANNAH_CSV.toString('base64'), asOf: '2026-09-23' });
    assert.equal(res.status, 201);
    const body = (await res.json()) as WorkspaceData;
    assert.equal(body.imports.length, 1);
    const imp = body.imports[0]!;
    assert.deepEqual([imp.format, imp.asOf, imp.compCount, imp.sample, imp.filename], ['csv', '2026-09-23', 11, false, 'hannah.csv']);
    assert.equal(Buffer.from(imp.contentBase64, 'base64').equals(HANNAH_CSV), true, 'stored exactly as uploaded');
    assert.deepEqual((imp.warnings as { code: string }[]).map((w) => w.code).sort(), ['approx_area', 'closing_record']);
    assert.equal(body.comps.length, 11);
    assert.ok(body.comps.every((c) => c.tier === null && c.reasons.length === 0 && !c.anchor && c.reviewedAt === null));
    const count = (evidence: string) => body.comps.filter((c) => c.evidenceClass === evidence).length;
    assert.deepEqual([count('sold'), count('in_contract'), count('active')], [5, 3, 3]);
  });

  test('sorting a comp records a reason, append-only; the anchor is unique; reviewed is recorded', async () => {
    const { body } = await workspace('tok-ana-000000000', anaReport);
    const chambers = body.comps.find((c) => c.propertyKey.includes('200 chambers st'))!;
    const franklin = body.comps.find((c) => c.propertyKey.includes('5 franklin pl'))!;
    let res = await comps('tok-ana-000000000', 'POST', { reportId: anaReport, reportCompId: chambers.reportCompId, tier: 'secondary', reason: 'Lower floor', reasonType: 'property' });
    assert.equal(res.status, 200);
    res = await comps('tok-ana-000000000', 'POST', { reportId: anaReport, reportCompId: chambers.reportCompId, tier: 'primary', reason: 'Closest match after all', reasonType: 'property' });
    let after = ((await res.json()) as WorkspaceData).comps.find((c) => c.reportCompId === chambers.reportCompId)!;
    assert.equal(after.tier, 'primary');
    assert.deepEqual(after.reasons.map((r) => [r.tier, r.reason, r.sample]), [['secondary', 'Lower floor', false], ['primary', 'Closest match after all', false]]);

    await comps('tok-ana-000000000', 'PATCH', { reportId: anaReport, reportCompId: chambers.reportCompId, anchor: true, reviewed: true });
    res = await comps('tok-ana-000000000', 'PATCH', { reportId: anaReport, reportCompId: franklin.reportCompId, anchor: true });
    const now = (await res.json()) as WorkspaceData;
    assert.deepEqual(now.comps.filter((c) => c.anchor).map((c) => c.reportCompId), [franklin.reportCompId]);
    after = now.comps.find((c) => c.reportCompId === chambers.reportCompId)!;
    assert.ok(after.reviewedAt);

    const bad = async (body: unknown, method = 'POST') => {
      const r = await comps('tok-ana-000000000', method, { reportId: anaReport, reportCompId: chambers.reportCompId, ...(body as object) });
      return [r.status, (await r.json()).error];
    };
    assert.deepEqual(await bad({ tier: 'primary', reason: '  ', reasonType: 'property' }), [400, 'no_reason']);
    assert.deepEqual(await bad({ tier: 'top', reason: 'x', reasonType: 'property' }), [400, 'bad_tier']);
    assert.deepEqual(await bad({ tier: 'primary', reason: 'x', reasonType: 'vibes' }), [400, 'bad_reason_type']);
    assert.deepEqual(await bad({}, 'PATCH'), [400, 'nothing_to_save']);
    const missing = await comps('tok-ana-000000000', 'PATCH', { reportId: anaReport, reportCompId: '00000000-0000-4000-8000-000000000000', reviewed: true });
    assert.equal(missing.status, 404);
  });

  test('importing the same export again adds the file but not duplicate comps, and keeps every tier', async () => {
    const res = await importFile('tok-ana-000000000', { reportId: anaReport, filename: 'hannah-again.csv', contentBase64: HANNAH_CSV.toString('base64'), asOf: '2026-09-24' });
    const body = (await res.json()) as WorkspaceData;
    assert.equal(body.imports.length, 2);
    assert.equal(body.comps.length, 11);
    assert.equal(body.comps.find((c) => c.propertyKey.includes('200 chambers st'))!.tier, 'primary');
  });

  test('an unreadable or empty file is refused before anything is stored', async () => {
    const empty = await importFile('tok-ana-000000000', { reportId: anaReport, filename: 'x.csv', contentBase64: '' });
    assert.deepEqual([empty.status, (await empty.json()).error], [400, 'no_file']);
    const junk = await importFile('tok-ana-000000000', { reportId: anaReport, filename: 'x.csv', contentBase64: Buffer.from('hello,world\n').toString('base64') });
    assert.equal(junk.status, 400);
    assert.equal((await workspace('tok-ana-000000000', anaReport)).body.imports.length, 2);
  });

  test('the sample is for admins: its import strips StreetEasy’s share tokens, and its sort follows the sample', async () => {
    assert.equal((await importFile('tok-ana-000000000', { reportId: anaReport, sample: true })).status, 403);
    assert.equal((await comps('tok-ana-000000000', 'POST', { reportId: anaReport, sample: true })).status, 403);
    assert.equal((await handleSample(request('sample', 'tok-ana-000000000'), deps)).status, 403);
    const sample = await handleSample(request('sample', 'tok-kimani-000000'), deps);
    assert.equal(sample.status, 200);
    assert.deepEqual(Object.keys(await sample.json()).sort(), ['brief', 'call', 'dealTerms', 'intake', 'propertyType', 'send', 'target', 'title']);

    const kimaniReport = await createReport('tok-kimani-000000', 'Sample walkthrough');
    const early = await comps('tok-kimani-000000', 'POST', { reportId: kimaniReport, sample: true });
    assert.deepEqual([early.status, (await early.json()).error], [409, 'no_sample_comps']);

    const res = await importFile('tok-kimani-000000', { reportId: kimaniReport, sample: true });
    assert.equal(res.status, 201);
    const imported = (await res.json()) as WorkspaceData;
    const csv = Buffer.from(imported.imports[0]!.contentBase64, 'base64').toString('utf8');
    assert.equal(imported.imports[0]!.sample, true);
    assert.equal(imported.report.sampleData, true, 'a sample import flags the report');
    assert.equal(csv.includes('sst='), false);
    assert.equal(csv.includes('streeteasy.com/building/200-chambers-street-new_york/10a'), true);

    const sorted = (await (await comps('tok-kimani-000000', 'POST', { reportId: kimaniReport, sample: true })).json()) as WorkspaceData;
    for (const s of SAMPLE_TIERS) {
      const comp = sorted.comps.find((c) => c.propertyKey === s.propertyKey)!;
      assert.equal(comp.tier, s.tier, s.propertyKey);
      assert.equal(comp.anchor, Boolean(s.anchor), s.propertyKey);
      assert.ok(comp.reviewedAt, s.propertyKey);
      assert.deepEqual(comp.reasons.map((r) => [r.reason, r.sample]), [[s.reason, true]]);
    }
    // Filling it again changes nothing that's already so.
    const again = (await (await comps('tok-kimani-000000', 'POST', { reportId: kimaniReport, sample: true })).json()) as WorkspaceData;
    assert.ok(again.comps.every((c) => c.reasons.length === 1));

    assert.equal((await handleWorkspace(request('workspace', 'tok-kimani-000000', 'PATCH', { reportId: kimaniReport, sampleData: true }), deps)).status, 200);
    const listed = (await (await handleReports(request('reports', 'tok-kimani-000000'), deps)).json()).reports as { id: string; sampleData: boolean }[];
    assert.equal(listed.find((r) => r.id === kimaniReport)!.sampleData, true);
    // The flag is sticky: false is not a way to clear it.
    await handleWorkspace(request('workspace', 'tok-kimani-000000', 'PATCH', { reportId: kimaniReport, sampleData: false, brief: {} }), deps);
    assert.equal((await workspace('tok-kimani-000000', kimaniReport)).body.report.sampleData, true);
  });
});

// §8.4's backstop (Dispatch 21, item 4): the range the agent first saw, pinned
// by the server under state.reveal. The browser never writes it.
describe('the reveal pin', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let superuser: pg.Pool;
  let deps: AuthDeps;
  const KIMANI = 'tok-kimani-000000';
  const ANA = 'tok-ana-000000000';

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    // A superuser with triggers off: it stages what the tests need (a call with no pin) behind the app's back.
    superuser = new pg.Pool({ connectionString: db.urlAs(new URL(process.env.CR_TEST_DATABASE_URL!).username || 'postgres'), max: 1, options: '-c session_replication_role=replica' });
    superuser.on('error', () => undefined);
    deps = {
      verifier: {
        async verify(token: string) {
          const email = PEOPLE[token];
          return email ? ({ id: `id-${token}`, email, confirmed: true, provider: 'google', name: null } as IdentityUser) : null;
        },
        emailConfirmationRequired: async () => true,
      },
      access: accessConfig({ CR_ADMIN_EMAILS: 'kimani@casa-blanca.com' }),
      pool: pool as unknown as PoolLike,
    };
  });
  after(async () => {
    await pool.end();
    await superuser.end();
    await db?.drop();
  });

  const request = (path: string, token: string, method = 'GET', body?: unknown) =>
    new Request(`https://site/api/comp-report/${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const patch = async (token: string, body: unknown) => {
    const res = await handleWorkspace(request('workspace', token, 'PATCH', body), deps);
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
    return res.json() as Promise<{ saved: true; reveal?: RevealPin }>;
  };
  const load = async (token: string, reportId: string) => {
    const res = await handleWorkspace(request(`workspace?report=${reportId}`, token), deps);
    assert.equal(res.status, 200);
    return (await res.json()) as WorkspaceData;
  };
  const stored = async (reportId: string) =>
    (await superuser.query<{ reveal: RevealPin | null }>(`select state -> 'reveal' as reveal from comp_report.reports where id = $1`, [reportId])).rows[0]!.reveal;
  const unpin = (reportId: string) => superuser.query(`update comp_report.reports set state = state - 'reveal', agent_call = null where id = $1`, [reportId]);
  const call = (at = new Date().toISOString()) => ({ low: 3400000, high: 4200000, at });
  const intake = { ...SAMPLE_INTAKE, areaSqft: { value: 2000, asOf: '2026-09-23' } };

  /** A report with the sample's comps, tiered as the sample tiers them, and a size: one with a range. */
  const sampleReport = async (token = KIMANI) => {
    const id = (await (await handleReports(request('reports', token, 'POST', { title: '100 Barclay Street, #17L' }), deps)).json()).report.id as string;
    assert.equal((await handleImports(request('imports', KIMANI, 'POST', { reportId: id, sample: true }), deps)).status, token === KIMANI ? 201 : 404);
    return id;
  };
  let report = '';
  /** The engine's numbers for the report, from what's stored: what the pin must hold. */
  let engine: { low: number | null; base: number | null; high: number | null } = { low: null, base: null, high: null };

  before(async () => {
    report = await sampleReport();
    await handleComps(request('comps', KIMANI, 'POST', { reportId: report, sample: true }), deps);
    await patch(KIMANI, { reportId: report, state: { intake } });
    const n = await withActor(pool as unknown as PoolLike, { kind: 'user', email: PEOPLE[KIMANI]!, role: 'admin' }, (tx) => neutralNumbers(tx, report));
    const r = n!.output.results[answerResult(n!.output)];
    engine = { low: r.range?.low.value ?? null, base: r.base?.value ?? null, high: r.range?.high.value ?? null };
    assert.ok(engine.low && engine.high && engine.base, 'the sample with a size has a range and a base');
  });

  test('(a) a state PATCH carrying a reveal, with none stored, stores none', async () => {
    await patch(KIMANI, { reportId: report, state: { intake, reveal: { at: 'x', low: 1, base: 2, high: 3, engineVersion: 'forged' } } });
    assert.equal(await stored(report), null);
  });

  test('(g) the call pins the engine’s numbers, whatever the body says; (e) a reveal outside state is ignored', async () => {
    const res = await patch(KIMANI, { reportId: report, call: call(), reveal: { at: 'x', low: 1, base: 2, high: 3, engineVersion: 'forged' } });
    const pin = await stored(report);
    assert.ok(pin);
    assert.deepEqual({ low: pin.low, base: pin.base, high: pin.high }, engine);
    assert.equal(pin.engineVersion, ENGINE_VERSION);
    assert.equal(pin.late, undefined);
    assert.deepEqual(res.reveal, pin, 'the PATCH answers with the pin');
  });

  test('(b) a state PATCH without a reveal keeps the stored one; (c) one with a changed reveal keeps it too', async () => {
    const before = await stored(report);
    await patch(KIMANI, { reportId: report, state: { intake, reached: 'findings' } });
    assert.deepEqual(await stored(report), before);
    await patch(KIMANI, { reportId: report, state: { intake, reveal: { ...before, low: 1 } } });
    assert.deepEqual(await stored(report), before);
    assert.equal((await load(KIMANI, report)).state.reached, undefined, 'the rest of the state is the latest save');
  });

  test('(d) clearing the call and giving a new one leaves the pin as it was', async () => {
    const before = await stored(report);
    await patch(KIMANI, { reportId: report, call: null });
    assert.deepEqual(await stored(report), before);
    // Fewer comps now: a fresh pin would differ, but the stored one stays.
    await patch(KIMANI, { reportId: report, state: { intake: SAMPLE_INTAKE }, call: { ...call(), low: 3000000 } });
    assert.deepEqual(await stored(report), before);
    await patch(KIMANI, { reportId: report, state: { intake } });
  });

  test('(f) a state autosave and a call at once leave exactly one pin, the engine’s', async () => {
    for (let i = 0; i < 4; i++) {
      await unpin(report);
      await Promise.all([
        patch(KIMANI, { reportId: report, state: { intake, reached: 'findings' } }),
        patch(KIMANI, { reportId: report, call: call() }),
      ]);
      const pin = await stored(report);
      assert.ok(pin, `round ${i}: pinned`);
      assert.deepEqual({ low: pin.low, base: pin.base, high: pin.high }, engine, `round ${i}`);
      const s = (await superuser.query<{ state: Record<string, unknown> }>('select state from comp_report.reports where id = $1', [report])).rows[0]!.state;
      assert.equal(s.reached, 'findings', `round ${i}: the autosave landed`);
    }
  });

  test('(h) a report with a call and no pin gets a late one on the owner’s first load; an admin’s load writes nothing', async () => {
    const anas = (await (await handleReports(request('reports', ANA, 'POST', { title: 'Ana’s report' }), deps)).json()).report.id as string;
    await patch(ANA, { reportId: anas, call: call('2026-10-01T15:00:00.000Z') });
    await superuser.query(`update comp_report.reports set state = state - 'reveal' where id = $1`, [anas]);
    assert.equal((await load(KIMANI, anas)).state.reveal, undefined);
    assert.equal(await stored(anas), null, 'the admin wrote nothing');
    const reveal = (await load(ANA, anas)).state.reveal as RevealPin;
    assert.deepEqual(reveal, { at: '2026-10-01T15:00:00.000Z', low: null, base: null, high: null, engineVersion: ENGINE_VERSION, late: true });
    assert.deepEqual(await stored(anas), reveal);
    // The owner's own sample report, revealed before the pin existed, gets the engine's numbers.
    await superuser.query(`update comp_report.reports set state = state - 'reveal' where id = $1`, [report]);
    const late = (await load(KIMANI, report)).state.reveal as RevealPin;
    assert.deepEqual({ low: late.low, base: late.base, high: late.high, late: late.late }, { ...engine, late: true });
  });
});
