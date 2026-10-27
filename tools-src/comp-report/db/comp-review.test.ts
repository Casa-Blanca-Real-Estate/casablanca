// The per-comp review on Sort (Dispatch 25), against a real PostgreSQL and the
// fake Messages API: the human drives. A practice agent's take is refused
// until a feedback round on the comp is stored; feedback needs the agent's
// note (and a practice agent's tags); each round is appended to the comp's
// review, grounded, and never sets a tier; a browser state save can't drop a
// round; the request never carries the call, the target or the deal terms;
// and the sample sort stores Hubert's review of each sample comp.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Anthropic from '@comp-report/anthropic-sdk';
import pg from 'pg';
import { startFakeAnthropic, type FakeAnthropic } from '../dev/fake-anthropic.ts';
import { accessConfig } from '../server/access.ts';
import { handleCompReview, type CompReviewDeps } from '../server/api/comp-review.ts';
import { handleComps } from '../server/api/comps.ts';
import { handleImports } from '../server/api/imports.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleWorkspace, type WorkspaceData } from '../server/api/workspace.ts';
import { withActor, type PoolLike } from '../server/db.ts';
import type { IdentityUser } from '../server/identity.ts';
import { SAMPLE_INTAKE } from '../server/sample/barclay-17l.ts';
import type { ReviewEntry } from '../workspace/review.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const PEOPLE: Record<string, string> = {
  'tok-kimani-000000': 'kimani@casa-blanca.com',
  'tok-new-000000000': 'new@casa-blanca.com',
  'tok-ana-000000000': 'ana@casa-blanca.com',
};
const CALL = { low: 3_456_789, high: 3_987_654, note: 'my private read on it', at: '2026-10-22T12:00:00.000Z' };
const TARGET = { price: { value: 4_111_111, asOf: '2026-10-22' }, note: { value: 'the owners’ secret number', asOf: '2026-10-22' } };
const DEAL = { template: 'buyer_traditional', price: { value: 4_222_222, asOf: '2026-10-22' } };

describe('the per-comp review on Sort', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let fake: FakeAnthropic;
  let deps: CompReviewDeps;

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    fake = await startFakeAnthropic();
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
      env: {},
      anthropic: () => new Anthropic({ apiKey: 'test', baseURL: fake.url, maxRetries: 0 }),
    };
  });
  after(async () => {
    await fake.close();
    await pool.end();
    await db?.drop();
  });

  const request = (path: string, token: string, method = 'GET', body?: unknown) =>
    new Request(`https://site/${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const json = async <T>(res: Response) => ({ status: res.status, body: (await res.json()) as T & { error?: string } });
  const ask = (token: string, body: Record<string, unknown>) =>
    handleCompReview(request('api/comp-report/comp-review', token, 'POST', body), deps).then(json<{ workspace: WorkspaceData; entry: ReviewEntry; dropped: number }>);
  const load = (token: string, report: string) => handleWorkspace(request(`workspace?report=${report}`, token), deps).then(json<WorkspaceData>);
  const edit = (token: string, body: Record<string, unknown>) => handleComps(request('comps', token, 'PATCH', body), deps).then(json<WorkspaceData>);

  /** A report with the sample export's comps, unsorted (the sample import is an admin's). */
  async function report(token: string): Promise<{ id: string; comps: WorkspaceData['comps'] }> {
    const id = (await (await handleReports(request('reports', token, 'POST', { title: '100 Barclay Street #17L' }), deps)).json()).report.id as string;
    assert.equal((await handleImports(request('imports', token, 'POST', { reportId: id, sample: true }), deps)).status, 201);
    return { id, comps: (await load(token, id)).body.comps };
  }

  let kimani = { id: '', comps: [] as WorkspaceData['comps'] };

  test('a full agent: feedback needs a note; his take comes first, grounded, and sets no tier', async () => {
    kimani = await report('tok-kimani-000000');
    assert.equal((await handleWorkspace(request('workspace', 'tok-kimani-000000', 'PATCH', { reportId: kimani.id, call: CALL, target: TARGET, state: { intake: SAMPLE_INTAKE, dealTerms: DEAL } }), deps)).status, 200);
    const rc = kimani.comps[0]!.reportCompId;
    const noNote = await ask('tok-kimani-000000', { reportId: kimani.id, reportCompId: rc, job: 'feedback' });
    assert.deepEqual([noNote.status, noNote.body.error], [409, 'no_note']);

    const before = fake.requests.length;
    const t = await ask('tok-kimani-000000', { reportId: kimani.id, reportCompId: rc, job: 'take' });
    assert.equal(t.status, 200);
    assert.equal(t.body.entry.kind, 'take');
    assert.ok(t.body.entry.tier);
    assert.ok(!t.body.entry.text.includes('9,876,543'), 'the invented figure is dropped');
    assert.equal(t.body.dropped, 1);
    const comp = t.body.workspace.comps.find((c) => c.reportCompId === rc)!;
    assert.equal(comp.tier, null, 'his tier is advice: the comp stays untiered');
    assert.equal(comp.review?.length, 1);
    const sent = JSON.stringify(fake.requests.slice(before));
    for (const secret of ['3456789', '3987654', '4111111', '4222222', 'my private read', 'secret number']) assert.ok(!sent.includes(secret), secret);
    assert.equal(fake.requests.at(-1)!.body.model, 'claude-opus-5-5');

    // Told what he's missing, he looks again: appended, with what the agent said.
    const again = await ask('tok-kimani-000000', { reportId: kimani.id, reportCompId: rc, job: 'take', asks: 'It was gut renovated last year.' });
    assert.equal(again.body.entry.asked, 'It was gut renovated last year.');
    assert.match(JSON.stringify(fake.requests.at(-1)!.body), /gut renovated/);
    assert.equal(again.body.workspace.comps.find((c) => c.reportCompId === rc)!.review?.length, 2);
  });

  test('the agent’s note gets feedback; the tier the agent sets is the comp’s tier, whatever Hubert said', async () => {
    const rc = kimani.comps[1]!.reportCompId;
    assert.equal((await edit('tok-kimani-000000', { reportId: kimani.id, reportCompId: rc, note: 'Close in size, invent a figure', tags: ['Similar size'] })).status, 200);
    const fb = await ask('tok-kimani-000000', { reportId: kimani.id, reportCompId: rc, job: 'feedback' });
    assert.equal(fb.status, 200);
    assert.equal(fb.body.entry.note, 'Close in size, invent a figure');
    assert.deepEqual(fb.body.entry.tags, ['Similar size']);
    assert.match(fb.body.entry.text, /^What holds up:/);
    const t = await ask('tok-kimani-000000', { reportId: kimani.id, reportCompId: rc, job: 'take' });
    const mine = t.body.entry.tier === 'excluded' ? 'primary' : 'excluded';
    const tiered = await edit('tok-kimani-000000', { reportId: kimani.id, reportCompId: rc, tier: mine });
    assert.equal(tiered.body.comps.find((c) => c.reportCompId === rc)!.tier, mine);
  });

  test('a browser state save never drops a round, and the state it loads doesn’t carry them', async () => {
    const loaded = await load('tok-kimani-000000', kimani.id);
    assert.equal('reviews' in loaded.body.state, false);
    const stale = { ...loaded.body.state, reviews: {} };
    assert.equal((await handleWorkspace(request('workspace', 'tok-kimani-000000', 'PATCH', { reportId: kimani.id, state: stale }), deps)).status, 200);
    const after = await load('tok-kimani-000000', kimani.id);
    assert.equal(after.body.comps[0]!.review?.length, 2);
    assert.equal(after.body.comps[1]!.review?.length, 2);
  });

  test('only the owner asks', async () => {
    const r = await ask('tok-ana-000000000', { reportId: kimani.id, reportCompId: kimani.comps[0]!.reportCompId, job: 'take' });
    assert.equal(r.status, 404);
  });

  test('a practice agent: tags with the note, and no take before a feedback round', async () => {
    // A report handed to a new agent, still practising: the owner is who asks.
    const mine = await report('tok-kimani-000000');
    await handleReports(request('reports', 'tok-new-000000000'), deps); // signs the new agent in
    await withActor(pool as unknown as PoolLike, { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' }, async (tx) => {
      await tx.query(`update comp_report.users set capability = 'practice' where email = 'new@casa-blanca.com'`);
      await tx.query(`update comp_report.reports set owner_email = 'new@casa-blanca.com' where id = $1`, [mine.id]);
    });
    const rc = mine.comps[0]!.reportCompId;
    const early = await ask('tok-new-000000000', { reportId: mine.id, reportCompId: rc, job: 'take' });
    assert.deepEqual([early.status, early.body.error], [409, 'feedback_first'], 'his take waits for feedback on theirs');
    assert.equal((await edit('tok-new-000000000', { reportId: mine.id, reportCompId: rc, note: 'Same area, similar size.' })).status, 200);
    const noTags = await ask('tok-new-000000000', { reportId: mine.id, reportCompId: rc, job: 'feedback' });
    assert.deepEqual([noTags.status, noTags.body.error], [409, 'no_tags']);
    assert.equal((await edit('tok-new-000000000', { reportId: mine.id, reportCompId: rc, tags: ['Same area'] })).status, 200);
    assert.equal((await ask('tok-new-000000000', { reportId: mine.id, reportCompId: rc, job: 'feedback' })).status, 200);
    const t = await ask('tok-new-000000000', { reportId: mine.id, reportCompId: rc, job: 'take' });
    assert.equal(t.status, 200, 'after one round of feedback');
    // An admin viewing as a new agent asks as one: the rule only gets stricter.
    const other = kimani.comps[5]!.reportCompId;
    const viewing = await ask('tok-kimani-000000', { reportId: kimani.id, reportCompId: other, job: 'take', practice: true });
    assert.deepEqual([viewing.status, viewing.body.error], [409, 'feedback_first']);
  });

  test('the sample sort stores Hubert’s review of each sample comp, once', async () => {
    const s = await report('tok-kimani-000000');
    const sorted = await handleComps(request('comps', 'tok-kimani-000000', 'POST', { reportId: s.id, sample: true }), deps).then(json<WorkspaceData>);
    const reviewed = sorted.body.comps.filter((c) => c.review?.length);
    assert.equal(reviewed.length, sorted.body.comps.length);
    for (const c of reviewed) {
      assert.deepEqual(c.review!.map((e) => e.kind), ['feedback', 'take']);
      assert.ok(c.review!.every((e) => e.sample));
    }
    const again = await handleComps(request('comps', 'tok-kimani-000000', 'POST', { reportId: s.id, sample: true }), deps).then(json<WorkspaceData>);
    assert.ok(again.body.comps.every((c) => c.review?.length === 2), 'run again, nothing doubles');
  });

  test('every round is logged in usage', async () => {
    const n = await withActor(pool as unknown as PoolLike, { kind: 'user', email: 'kimani@casa-blanca.com', role: 'admin' }, (tx) =>
      tx.query<{ n: string }>(`select count(*) as n from comp_report.usage where purpose = 'comp_review'`));
    assert.ok(Number(n.rows[0]!.n) >= 5);
  });
});
