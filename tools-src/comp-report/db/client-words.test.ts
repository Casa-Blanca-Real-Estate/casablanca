// The client's words on Send (Dispatch 26), against a real PostgreSQL and the
// fake Messages API: the human drives. A practice agent's version of a comp's
// paragraph (Hubert's draft) is refused until a feedback round on that step is
// stored, and so is the overview's Draft from notes; a full agent drafts at
// once and can redraft with what to change; each round is appended, grounded;
// a browser state save can't drop a round; the paragraph is saved as the
// comp's clientLine; the sample sort writes one for each sample comp; and the
// email's photos are copied only from what's stored, for the report's owner.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Anthropic from '@comp-report/anthropic-sdk';
import pg from 'pg';
import { startFakeAnthropic, type FakeAnthropic } from '../dev/fake-anthropic.ts';
import { accessConfig } from '../server/access.ts';
import { handleClientWords } from '../server/api/client-words.ts';
import { handleComps } from '../server/api/comps.ts';
import { handleEmailPhoto, handleEmailPhotos } from '../server/api/email-photos.ts';
import { handleImports } from '../server/api/imports.ts';
import { handleLines } from '../server/api/lines.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleWorkspace, type WorkspaceData } from '../server/api/workspace.ts';
import { withActor, type PoolLike } from '../server/db.ts';
import { memoryEmailPhotoStore, type PhotoFetch } from '../server/email-photos.ts';
import type { IdentityUser } from '../server/identity.ts';
import { SAMPLE_INTAKE } from '../server/sample/barclay-17l.ts';
import { neutralNumbers } from '../server/numbers.ts';
import { answerResult } from '../workspace/reading.ts';
import { clientSteps, type ClientRound } from '../workspace/client-words.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const PEOPLE: Record<string, string> = {
  'tok-kimani-000000': 'kimani@casa-blanca.com',
  'tok-new-000000000': 'new@casa-blanca.com',
  'tok-ana-000000000': 'ana@casa-blanca.com',
};
const CALL = { low: 3_456_789, high: 3_987_654, note: 'my private read on it', at: '2026-10-27T12:00:00.000Z' };
const TARGET = { price: { value: 4_111_111, asOf: '2026-10-27' }, note: { value: 'the owners’ secret number', asOf: '2026-10-27' } };
const DEAL = { template: 'buyer_traditional', price: { value: 4_222_222, asOf: '2026-10-27' } };
const PHOTO = 'https://photos.zillowstatic.com/fp/client-words-test-se_large_800_400.jpg';
const ADMIN = { kind: 'user' as const, email: 'kimani@casa-blanca.com', role: 'admin' as const };

type Reply = { workspace: WorkspaceData; round: ClientRound; dropped: number };
const roundsOf = (ws: WorkspaceData) => (ws.state.clientRounds ?? {}) as Record<string, ClientRound[]>;

describe('the client’s words on Send', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  /** Past row-level security, to set up what the tests need. */
  let su: pg.Pool;
  let fake: FakeAnthropic;
  const photos = memoryEmailPhotoStore();
  const fetched: string[] = [];
  const fetchPhoto: PhotoFetch = async (url) => {
    fetched.push(url);
    return { ok: true, data: new Uint8Array([0xff, 0xd8, 0xff, 1]).buffer, contentType: 'image/jpeg' };
  };
  let deps: Parameters<typeof handleClientWords>[1] & Parameters<typeof handleEmailPhotos>[1];

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    su = testPool(db.urlAs('postgres'), 1);
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
      emailPhotos: photos,
      fetchPhoto,
    };
  });
  after(async () => {
    await fake.close();
    await pool.end();
    await su.end();
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
    handleClientWords(request('api/comp-report/client-words', token, 'POST', body), deps).then(json<Reply>);
  const load = (token: string, report: string) => handleWorkspace(request(`workspace?report=${report}`, token), deps).then(json<WorkspaceData>);
  const edit = (token: string, body: Record<string, unknown>) => handleComps(request('comps', token, 'PATCH', body), deps).then(json<WorkspaceData>);
  const save = (token: string, report: string, body: Record<string, unknown>) =>
    handleWorkspace(request('workspace', token, 'PATCH', { reportId: report, ...body }), deps);

  const setUp = (sql: string, args: unknown[]) => withActor(su as unknown as PoolLike, ADMIN, (tx) => tx.query(sql, args));

  /** The sample, sorted, revealed, with its sample paragraphs cleared: the agent writes from scratch. */
  async function sorted(token = 'tok-kimani-000000'): Promise<{ id: string; shown: string[] }> {
    const id = (await (await handleReports(request('reports', token, 'POST', { title: '100 Barclay Street #17L' }), deps)).json()).report.id as string;
    assert.equal((await handleImports(request('imports', token, 'POST', { reportId: id, sample: true }), deps)).status, 201);
    assert.equal((await handleComps(request('comps', token, 'POST', { reportId: id, sample: true }), deps)).status, 200);
    await setUp(`update comp_report.report_comps set client_line = null where report_id = $1`, [id]);
    // The comps the email shows, as the client step has them.
    const shown = await withActor(pool as unknown as PoolLike, ADMIN, async (tx) => {
      const n = (await neutralNumbers(tx, id))!;
      return clientSteps(n.output, answerResult(n.output), n.comps).map((c) => c.judgment!.reportCompId);
    });
    return { id, shown };
  }

  let kimani = { id: '', shown: [] as string[] };

  test('the sample sort writes a paragraph for each sample comp, with no figures', async () => {
    const id = (await (await handleReports(request('reports', 'tok-kimani-000000', 'POST', { title: 'sample' }), deps)).json()).report.id as string;
    await handleImports(request('imports', 'tok-kimani-000000', 'POST', { reportId: id, sample: true }), deps);
    const s = await handleComps(request('comps', 'tok-kimani-000000', 'POST', { reportId: id, sample: true }), deps).then(json<WorkspaceData>);
    assert.ok(s.body.comps.length > 0);
    for (const c of s.body.comps) {
      assert.ok(c.clientLine?.text, c.propertyKey);
      assert.doesNotMatch(c.clientLine!.text, /\d/);
    }
  });

  test('before the agent’s number there are no client words', async () => {
    kimani = await sorted();
    assert.ok(kimani.shown.length >= 3);
    const early = await ask('tok-kimani-000000', { reportId: kimani.id, target: kimani.shown[0], job: 'draft' });
    assert.deepEqual([early.status, early.body.error], [409, 'not_revealed']);
    assert.equal((await save('tok-kimani-000000', kimani.id, { call: CALL, target: TARGET, state: { intake: SAMPLE_INTAKE, dealTerms: DEAL, send: {} } })).status, 200);
  });

  test('bad asks are refused: the overview has no draft here, an unknown target, a long ask', async () => {
    const r = (body: Record<string, unknown>) => ask('tok-kimani-000000', { reportId: kimani.id, ...body });
    assert.deepEqual([(await r({ target: 'overview', job: 'draft' })).body.error], ['bad_job']);
    assert.deepEqual([(await r({ target: 'nope', job: 'feedback' })).body.error], ['bad_target']);
    assert.deepEqual([(await r({ target: kimani.shown[0], job: 'tweak' })).body.error], ['bad_job']);
    assert.deepEqual([(await r({ target: kimani.shown[0], job: 'draft', asks: 'x'.repeat(1001) })).body.error], ['bad_asks']);
    assert.deepEqual([(await r({ target: '00000000-0000-4000-8000-000000000000', job: 'draft' })).status], [404]);
  });

  test('a full agent: Hubert’s version at once, grounded, never seeing the number, the target or the terms; then redrafted', async () => {
    const rc = kimani.shown[0]!;
    const before = fake.requests.length;
    const d = await ask('tok-kimani-000000', { reportId: kimani.id, target: rc, job: 'draft' });
    assert.equal(d.status, 200);
    assert.equal(d.body.round.kind, 'draft');
    assert.ok(d.body.round.text);
    assert.ok(!d.body.round.text.includes('9,876,543'), 'the invented figure is dropped');
    assert.equal(d.body.dropped, 1);
    const sent = JSON.stringify(fake.requests.slice(before));
    for (const secret of ['3456789', '3987654', '4111111', '4222222', 'my private read', 'secret number']) assert.ok(!sent.includes(secret), secret);
    assert.equal(fake.requests.at(-1)!.body.model, 'claude-opus-5-5');
    assert.equal(roundsOf(d.body.workspace)[rc]?.length, 1);

    const again = await ask('tok-kimani-000000', { reportId: kimani.id, target: rc, job: 'draft', asks: 'Mention the renovated kitchen.' });
    assert.equal(again.status, 200);
    assert.equal(again.body.round.asked, 'Mention the renovated kitchen.');
    const body = JSON.stringify(fake.requests.at(-1)!.body);
    assert.match(body, /renovated kitchen/);
    assert.match(body, /last_draft/);
    assert.equal(roundsOf(again.body.workspace)[rc]?.length, 2);
  });

  test('feedback needs the agent’s words; the paragraph is the comp’s clientLine, checked', async () => {
    const rc = kimani.shown[1]!;
    const none = await ask('tok-kimani-000000', { reportId: kimani.id, target: rc, job: 'feedback' });
    assert.deepEqual([none.status, none.body.error], [409, 'nothing_written']);
    for (const bad of [{ text: 5, by: 'agent' }, { text: 'ok', by: 'someone' }, { text: 'x'.repeat(1201), by: 'agent' }, 'text']) {
      const r = await edit('tok-kimani-000000', { reportId: kimani.id, reportCompId: rc, clientLine: bad });
      assert.deepEqual([r.status, r.body.error], [400, 'bad_client_line'], JSON.stringify(bad));
    }
    const saved = await edit('tok-kimani-000000', { reportId: kimani.id, reportCompId: rc, clientLine: { text: '  Same line, a safe neighborhood.  ', by: 'agent' } });
    assert.equal(saved.status, 200);
    const line = saved.body.comps.find((c) => c.reportCompId === rc)!.clientLine!;
    assert.equal(line.text, 'Same line, a safe neighborhood.');
    assert.equal(line.by, 'agent');
    assert.ok(line.at);
    const fb = await ask('tok-kimani-000000', { reportId: kimani.id, target: rc, job: 'feedback' });
    assert.equal(fb.status, 200);
    assert.equal(fb.body.round.wrote, 'Same line, a safe neighborhood.');
    assert.match(fb.body.round.text, /Fair housing:\n- “safe neighborhood” reads as a preference/);
    assert.ok(!fb.body.round.text.includes('9,876,543'));
    const cleared = await edit('tok-kimani-000000', { reportId: kimani.id, reportCompId: rc, clientLine: null });
    assert.equal(cleared.body.comps.find((c) => c.reportCompId === rc)!.clientLine, undefined);
  });

  test('the overview gets feedback on the agent’s lines', async () => {
    const empty = await ask('tok-kimani-000000', { reportId: kimani.id, target: 'overview', job: 'feedback' });
    assert.deepEqual([empty.status, empty.body.error], [409, 'nothing_written']);
    const send = { headline: { value: 'The closest sales put #17L in a narrow band.', asOf: '2026-10-27' }, chosen: { value: 'Same building first.', asOf: '2026-10-27' } };
    assert.equal((await save('tok-kimani-000000', kimani.id, { state: { intake: SAMPLE_INTAKE, dealTerms: DEAL, send } })).status, 200);
    const fb = await ask('tok-kimani-000000', { reportId: kimani.id, target: 'overview', job: 'feedback' });
    assert.equal(fb.status, 200);
    assert.match(fb.body.round.wrote!, /Same building first/);
  });

  test('a browser state save never drops a round', async () => {
    const loaded = await load('tok-kimani-000000', kimani.id);
    const count = Object.values(roundsOf(loaded.body)).reduce((n, r) => n + r.length, 0);
    assert.equal(count, 4);
    assert.equal((await save('tok-kimani-000000', kimani.id, { state: { ...loaded.body.state, clientRounds: {} } })).status, 200);
    const after = await load('tok-kimani-000000', kimani.id);
    assert.equal(Object.values(roundsOf(after.body)).reduce((n, r) => n + r.length, 0), 4);
  });

  test('a practice agent writes first: no version of Hubert’s, and no Draft from notes, before feedback', async () => {
    const mine = await sorted();
    await handleReports(request('reports', 'tok-new-000000000'), deps); // signs the new agent in
    await withActor(pool as unknown as PoolLike, ADMIN, async (tx) => {
      await tx.query(`update comp_report.users set capability = 'practice' where email = 'new@casa-blanca.com'`);
      await tx.query(`update comp_report.reports set owner_email = 'new@casa-blanca.com' where id = $1`, [mine.id]);
    });
    const revealed = await save('tok-new-000000000', mine.id, { call: { ...CALL, note: 'Same building lines anchor it, and the lower floors trade a little under; I weighed the two closest sales most of all.' }, state: { intake: SAMPLE_INTAKE, send: {} } });
    assert.equal(revealed.status, 200, await revealed.clone().text());
    const rc = mine.shown[0]!;
    const early = await ask('tok-new-000000000', { reportId: mine.id, target: rc, job: 'draft' });
    assert.deepEqual([early.status, early.body.error], [409, 'feedback_first'], 'his version waits for feedback on theirs');
    assert.equal((await edit('tok-new-000000000', { reportId: mine.id, reportCompId: rc, clientLine: { text: 'Same line, lower floor.', by: 'agent' } })).status, 200);
    assert.equal((await ask('tok-new-000000000', { reportId: mine.id, target: rc, job: 'feedback' })).status, 200);
    const d = await ask('tok-new-000000000', { reportId: mine.id, target: rc, job: 'draft' });
    assert.equal(d.status, 200, 'after one round of feedback');
    const other = await ask('tok-new-000000000', { reportId: mine.id, target: mine.shown[1], job: 'draft' });
    assert.equal(other.body.error, 'feedback_first', 'each step on its own');

    const lines = (token: string, report: string, practice?: boolean) =>
      handleLines(request('api/comp-report/lines', token, 'POST', { reportId: report, job: 'draft', practice }), deps).then(json<{ lines: Record<string, string> }>);
    const noNotes = await lines('tok-new-000000000', mine.id);
    assert.deepEqual([noNotes.status, noNotes.body.error], [409, 'feedback_first']);
    await save('tok-new-000000000', mine.id, { state: { intake: SAMPLE_INTAKE, send: { headline: { value: 'A narrow band.', asOf: '2026-10-27' }, chosen: { value: 'Same building.', asOf: '2026-10-27' } } } });
    assert.equal((await ask('tok-new-000000000', { reportId: mine.id, target: 'overview', job: 'feedback' })).status, 200);
    assert.equal((await lines('tok-new-000000000', mine.id)).status, 200, 'after feedback on the overview');

    // An admin viewing as a new agent asks as one: the rule only gets stricter.
    const viewing = await ask('tok-kimani-000000', { reportId: kimani.id, target: kimani.shown[2], job: 'draft', practice: true });
    assert.deepEqual([viewing.status, viewing.body.error], [409, 'feedback_first']);
    assert.equal((await lines('tok-kimani-000000', kimani.id, true)).status, 200, 'his overview already has feedback');
  });

  test('the email’s photos: copied from what’s stored, once, and served by the key issued', async () => {
    const a = kimani.shown[0]!;
    const b = kimani.shown[1]!;
    // A listing read's photo on one comp and an off-host one on another, as if read so: observations are
    // append-only, so this setup steps past the trigger.
    const client = await su.connect();
    try {
      await client.query('begin');
      await client.query('set local session_replication_role = replica');
      for (const [id, url] of [[a, PHOTO], [b, 'https://evil.test/x.jpg']]) {
        await client.query(
          `update comp_report.property_observations set raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('heroImageUrl', $2::text)
            where id = (select observation_id from comp_report.report_comps where id = $1)`, [id, url]);
      }
      await client.query('commit');
    } finally {
      client.release();
    }
    const post = (token: string, body: Record<string, unknown>) =>
      handleEmailPhotos(request('api/comp-report/email-photos', token, 'POST', body), deps).then(json<{ comps: Record<string, string>; home: string | null }>);
    const r = await post('tok-kimani-000000', { reportId: kimani.id, reportCompIds: [a, b] });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body.comps), [a]);
    assert.equal(r.body.home, null, 'the sample has no home read');
    assert.deepEqual(fetched, [PHOTO], 'an off-host photo is never fetched');
    const path = r.body.comps[a]!;
    assert.match(path, /^\/api\/comp-report\/email-photo\?k=[A-Za-z0-9_-]{43}$/);
    assert.equal((await post('tok-kimani-000000', { reportId: kimani.id, reportCompIds: [a] })).body.comps[a], path, 'reused');
    assert.equal(fetched.length, 1);

    const served = await handleEmailPhoto(new Request(`https://site${path}`), deps);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/jpeg');
    assert.equal((await handleEmailPhoto(new Request('https://site/api/comp-report/email-photo?k=' + 'A'.repeat(43)), deps)).status, 404);

    assert.equal((await post('tok-ana-000000000', { reportId: kimani.id, reportCompIds: [a] })).status, 404, 'only who can open the report');
    assert.equal((await post('tok-kimani-000000', { reportId: kimani.id, reportCompIds: ['x'] })).body.error, 'bad_comps');
  });

  test('only the owner asks, and every round is logged in usage', async () => {
    const r = await ask('tok-ana-000000000', { reportId: kimani.id, target: kimani.shown[0], job: 'draft' });
    assert.equal(r.status, 404);
    const n = await withActor(pool as unknown as PoolLike, ADMIN, (tx) =>
      tx.query<{ n: string }>(`select count(*) as n from comp_report.usage where purpose = 'client_words'`));
    assert.ok(Number(n.rows[0]!.n) >= 7);
  });
});
