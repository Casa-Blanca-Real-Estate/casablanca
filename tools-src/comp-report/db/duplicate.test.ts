// Duplicate report (Kimani, 2026-11-06), against a real PostgreSQL: POST /reports {duplicateOf, carryChat}
// copies the owner's own report with its comps, tiers, details and finished reads; the chat only when asked,
// with comp ids swapped everywhere but inside Hubert's signed thinking. Nobody else's report can be copied.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleComps } from '../server/api/comps.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleSample } from '../server/api/sample.ts';
import { handleWorkspace } from '../server/api/workspace.ts';
import type { IdentityUser } from '../server/identity.ts';
import { memorySamplePhotoStore } from '../server/sample/photos.ts';
import type { AuthDeps } from '../server/session.ts';
import { copyTitle, remapContent } from '../server/api/duplicate.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const PEOPLE: Record<string, string> = {
  'tok-kimani-000000': 'kimani@casa-blanca.com',
  'tok-erez-00000000': 'erez@casa-blanca.com',
};
const KIMANI = 'tok-kimani-000000';
const EREZ = 'tok-erez-00000000';

test('copyTitle keeps the 200-character limit; remapContent leaves signed thinking alone', () => {
  assert.equal(copyTitle('60 Collister'), '60 Collister (copy)');
  assert.equal(copyTitle('x'.repeat(200)).length, 200);
  const ids = new Map([['aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002']]);
  const out = remapContent([
    { type: 'thinking', thinking: 'comp aaaaaaaa-0000-4000-8000-000000000001', signature: 's' },
    { type: 'tool_use', id: 't', name: 'set_tier', input: { compId: 'aaaaaaaa-0000-4000-8000-000000000001' } },
  ], ids) as { thinking?: string; input?: { compId: string } }[];
  assert.equal(out[0]!.thinking, 'comp aaaaaaaa-0000-4000-8000-000000000001');
  assert.equal(out[1]!.input!.compId, 'bbbbbbbb-0000-4000-8000-000000000002');
});

describe('duplicate a report, through the API', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let su: pg.Pool;
  let deps: AuthDeps & { samplePhotos: ReturnType<typeof memorySamplePhotoStore> };

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    su = testPool(db.urlAs(new URL(process.env.CR_TEST_DATABASE_URL!).username), 1);
    deps = {
      verifier: {
        async verify(token: string) {
          const email = PEOPLE[token];
          return email ? ({ id: `id-${token}`, email, confirmed: true, provider: 'google', name: null } as IdentityUser) : null;
        },
        emailConfirmationRequired: async () => true,
      },
      access: accessConfig({ CR_ADMIN_EMAILS: 'kimani@casa-blanca.com, erez@casa-blanca.com' }),
      pool,
      samplePhotos: memorySamplePhotoStore(),
    };
  });
  after(async () => {
    await pool.end();
    await su.end();
    await db?.drop();
  });

  function req(token: string, path: string, method = 'GET', body?: unknown) {
    return new Request(`https://site${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  const workspace = async (token: string, id: string) => {
    const res = await handleWorkspace(req(token, `/api/comp-report/workspace?report=${id}`), deps);
    assert.equal(res.status, 200, await res.clone().text());
    return res.json();
  };
  const duplicate = (token: string, body: unknown) => handleReports(req(token, '/api/comp-report/reports', 'POST', body), deps);
  /** Writes as Kimani, past the API, for the parts a test plants (a chat, a read, the state). */
  const asKimani = async (fn: (c: pg.PoolClient) => Promise<void>) => {
    const c = await su.connect();
    try {
      await c.query('begin');
      await c.query(`select comp_report.enter('user', 'kimani@casa-blanca.com', 'admin', null)`);
      await fn(c);
      await c.query('commit');
    } finally {
      c.release();
    }
  };

  async function built() {
    const res = await handleSample(req(KIMANI, '/api/comp-report/sample', 'POST', { action: 'fill', kind: 'condo', title: '60 Collister Street #4A' }), deps);
    assert.equal(res.status, 201, await res.clone().text());
    const { report } = await res.json();
    assert.equal((await handleComps(req(KIMANI, '/api/comp-report/comps', 'POST', { reportId: report.id, sample: true }), deps)).status, 200);
    const ws = await workspace(KIMANI, report.id);
    const comp = ws.comps[0].reportCompId as string;
    await asKimani(async (c) => {
      await c.query(
        `update comp_report.reports set state = state || jsonb_build_object('reviews', jsonb_build_object($2::text, '{"rounds":1}'::jsonb),
                'send', '{"sentAt":"2026-11-06T12:00:00.000Z","headline":"Hi"}'::jsonb) where id = $1`,
        [report.id, comp],
      );
      await c.query(`insert into comp_report.messages (report_id, seq, role, content, prompt_version) values
        ($1, 1, 'user', '[{"type":"text","text":"sup!"}]'::jsonb, 'hb-voice-2026-11-06'),
        ($1, 2, 'assistant', $2::jsonb, 'hb-voice-2026-11-06')`,
        [report.id, JSON.stringify([
          { type: 'thinking', thinking: `about ${comp}`, signature: 'sig' },
          { type: 'text', text: `Comp ${comp} looks primary.` },
        ])]);
      await c.query(`insert into comp_report.link_reads (report_id, purpose, url, status, attempts, started_at, finished_at, as_of, extract, report_comp_id)
        values ($1, 'comp', 'https://streeteasy.com/building/x/1a', 'done', 1, now(), now(), current_date, '{}'::jsonb, $2),
               ($1, 'comp', 'https://streeteasy.com/building/x/2b', 'queued', 0, null, null, null, null, null)`,
        [report.id, comp]);
    });
    return { report, ws: await workspace(KIMANI, report.id), comp };
  }

  test('the copy has every comp with its tier and reasons, the details and the state (unsent), the finished reads, and a fresh Hubert', async () => {
    const { report, ws, comp } = await built();
    const res = await duplicate(KIMANI, { duplicateOf: report.id });
    assert.equal(res.status, 201, await res.clone().text());
    const copy = (await res.json()).report;
    assert.notEqual(copy.id, report.id);
    assert.equal(copy.title, '60 Collister Street #4A (copy)');
    assert.equal(copy.ownerEmail, 'kimani@casa-blanca.com');
    assert.equal(copy.sampleData, true);

    const cws = await workspace(KIMANI, copy.id);
    assert.equal(cws.comps.length, ws.comps.length);
    const tiers = (w: { comps: { tier: string | null; reasons: unknown[] }[] }) => w.comps.map((c) => [c.tier, c.reasons.length]).sort();
    assert.ok(ws.comps.some((c: { tier: string | null }) => c.tier !== null), 'the original has tiered comps to copy');
    assert.deepEqual(tiers(cws), tiers(ws));
    assert.ok(cws.comps.every((c: { reportCompId: string }) => !ws.comps.some((o: { reportCompId: string }) => o.reportCompId === c.reportCompId)), 'new comp ids');
    assert.deepEqual(cws.brief, ws.brief);
    assert.equal(cws.imports.length, ws.imports.length);
    assert.equal(cws.state.send.sentAt, undefined, 'a copy is not sent');
    assert.equal(cws.state.send.headline, 'Hi');
    assert.equal(cws.messageCount, 0, 'Hubert starts fresh by default');

    const { rows: reviews } = await su.query(`select state -> 'reviews' as r from comp_report.reports where id = $1`, [copy.id]);
    const key = Object.keys(reviews[0].r)[0]!;
    assert.notEqual(key, comp, 'the review is keyed by the new comp id');
    assert.ok(cws.comps.some((c: { reportCompId: string }) => c.reportCompId === key));

    const { rows: reads } = await su.query(`select url, status, report_comp_id, finished_at < created_at as before from comp_report.link_reads where report_id = $1`, [copy.id]);
    assert.equal(reads.length, 1, 'the queued read is left behind');
    assert.equal(reads[0].status, 'done');
    assert.equal(reads[0].report_comp_id, key);
    assert.equal(reads[0].before, true, 'counted as free by the daily read limit');

    const { rows: original } = await su.query('select count(*)::int as n from comp_report.messages where report_id = $1', [report.id]);
    assert.equal(original[0].n, 2, 'the original is untouched');
  });

  test('with carryChat the chat comes too: the same seqs and prompt version, ids swapped outside the thinking', async () => {
    const { report, comp } = await built();
    const res = await duplicate(KIMANI, { duplicateOf: report.id, carryChat: true });
    assert.equal(res.status, 201, await res.clone().text());
    const copy = (await res.json()).report;
    const { rows } = await su.query('select seq, content, prompt_version from comp_report.messages where report_id = $1 order by seq', [copy.id]);
    assert.deepEqual(rows.map((r) => r.seq), [1, 2]);
    assert.ok(rows.every((r) => r.prompt_version === 'hb-voice-2026-11-06'));
    assert.equal(rows[1].content[0].thinking, `about ${comp}`);
    assert.doesNotMatch(rows[1].content[1].text, new RegExp(comp));
  });

  test('only the owner duplicates: another admin gets 404, a bad id 400, and nothing is made', async () => {
    const { report } = await built();
    const count = async () => Number((await su.query('select count(*) as n from comp_report.reports')).rows[0].n);
    const n = await count();
    assert.equal((await duplicate(EREZ, { duplicateOf: report.id })).status, 404);
    assert.equal((await duplicate(KIMANI, { duplicateOf: 'nope' })).status, 400);
    assert.equal(await count(), n);
  });
});
