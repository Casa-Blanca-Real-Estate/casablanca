// Hubert's trail (Kimani, 2026-10-28), end to end: the real turn endpoint
// against the fake Messages API and a real PostgreSQL. When the agent tells
// Hubert what to change on a comp, edit_comp saves it through the agent's own
// PATCH, the reason is marked as the assistant's, the turn streams the trail
// and says the comps changed, and the transcript shows the same trail on a
// reload. A refused edit changes nothing and leaves the turn working. And the
// web: searches go through the searcher, results come back as sources, and
// the daily count holds.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import Anthropic from '@comp-report/anthropic-sdk';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleImports } from '../server/api/imports.ts';
import { handleMessages } from '../server/api/messages.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleTurn, type TurnDeps } from '../server/api/turn.ts';
import type { WorkspaceData } from '../server/api/workspace.ts';
import { withActor, type PoolLike } from '../server/db.ts';
import type { TrailEntry, TrailSource } from '../server/hubert-trail.ts';
import type { IdentityUser } from '../server/identity.ts';
import type { WebSearcher } from '../server/web-search.ts';
import { startFakeAnthropic, type FakeAnthropic, type Script } from '../dev/fake-anthropic.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

type Block = Record<string, unknown>;

const HANNAH_CSV = readFileSync(new URL('../../../docs/comp-report/sources/streeteasy-comp-export-100-barclay-17l-2026-09-23.csv', import.meta.url));
const ANA = 'tok-ana-000000000';
const ana = { kind: 'user' as const, email: 'ana@casa-blanca.com', role: 'agent' as const };
const CHAMBERS = '200 Chambers Street #10A';

describe('Hubert’s trail: comp edits and the web', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let fake: FakeAnthropic;
  let scripts: Script[];
  let deps: TurnDeps;
  let reportId: string;
  let comps: WorkspaceData['comps'];
  const searched: string[] = [];
  const web: WebSearcher = {
    search: async (q) => {
      searched.push(q);
      return { ok: true, results: [{ title: 'Building facts', url: 'https://example.com/b', text: 'Full-time doorman.' }] };
    },
    read: async (url) => ({ ok: true, results: [{ title: 'A page', url, text: 'Pets allowed.' }] }),
  };

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    fake = await startFakeAnthropic();
    scripts = fake.scripts;
    const baseURL = fake.url;
    deps = {
      verifier: {
        verify: async (t) => (t === ANA ? ({ id: t, email: 'ana@casa-blanca.com', confirmed: true, provider: 'google', name: null } as IdentityUser) : null),
        emailConfirmationRequired: async () => true,
      },
      access: accessConfig({}),
      pool: pool as unknown as PoolLike,
      anthropic: () => new Anthropic({ apiKey: 'test-key', baseURL, maxRetries: 0 }),
      web: () => web,
    };
    reportId = (await (await handleReports(request('reports', 'POST', { title: '100 Barclay Street, #17L' }), deps)).json()).report.id;
    const imported = (await (await handleImports(request('imports', 'POST', {
      reportId, filename: 'hannah.csv', contentBase64: HANNAH_CSV.toString('base64'), asOf: '2026-09-23',
    }), deps)).json()) as WorkspaceData;
    comps = imported.comps;
  });
  after(async () => {
    await fake?.close();
    await pool?.end();
    await db?.drop();
  });

  function request(path: string, method = 'GET', body?: unknown) {
    return new Request(`https://site/api/comp-report/${path}`, {
      method, headers: { authorization: `Bearer ${ANA}` }, body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function turn(message?: string) {
    const res = await handleTurn(request('turn', 'POST', { reportId, message }), deps);
    assert.equal(res.status, 200);
    return (await res.text()).split('\n\n').filter((c) => c.startsWith('data: ')).map((c) => JSON.parse(c.slice(6)) as Block);
  }
  /** One tool call and the reply after it: the events of the second request, and the result the model got. */
  async function call(name: string, input: Block, said = 'Please do it.') {
    scripts.push({ content: [{ type: 'tool_use', id: `toolu_${name}_${Date.now()}`, name, input }], stopReason: 'tool_use' });
    await turn(said);
    scripts.push({ content: [{ type: 'text', text: 'Done.' }], stopReason: 'end_turn' });
    const events = await turn();
    const sent = fake.requests.at(-1)!.body.messages as Array<{ content: Block[] }>;
    return { events, result: sent.at(-1)!.content.find((b) => b.type === 'tool_result')! };
  }
  const chambers = () => comps.find((c) => c.propertyKey.includes('200-chambers') || c.propertyKey.includes('200 chambers'))
    ?? comps.find((c) => /chambers/i.test(c.propertyKey))!;
  const row = (id: string) => withActor(pool as unknown as PoolLike, ana, async (tx) =>
    (await tx.query<{ tier: string | null; note: string | null; tags: string[]; fact_overrides: Block }>(
      'select tier, note, tags, fact_overrides from comp_report.report_comps where id = $1', [id])).rows[0]!);
  const reasons = (id: string) => withActor(pool as unknown as PoolLike, ana, async (tx) =>
    (await tx.query<{ tier: string; reason: string; actor: string }>(
      'select tier, reason, actor from comp_report.reasons where report_comp_id = $1 order by id', [id])).rows);
  async function shown() {
    const res = await handleMessages(request(`messages?report=${reportId}`), deps);
    return (await res.json()).messages as Array<{ role: string; tools: string[]; changes: TrailEntry[]; sources: TrailSource[] }>;
  }

  test('the agent’s tier and note, as they said them: saved, marked as Hubert’s, and on the trail', async () => {
    const id = chambers().reportCompId;
    const { events, result } = await call('edit_comp', {
      comp: CHAMBERS, changes: { tier: 'primary', note: 'Same line, two floors down.', add_tags: ['Same building'] },
    }, 'Make 200 Chambers 1st tier, note: same line, two floors down, and tag it same building.');
    assert.equal(result.is_error, undefined, String(result.content));

    const r = await row(id);
    assert.equal(r.tier, 'primary');
    assert.equal(r.note, 'Same line, two floors down.');
    assert.ok(r.tags.includes('Same building'), `tags: ${r.tags.join(', ')}`);
    assert.deepEqual((await reasons(id)).map((x) => [x.tier, x.reason, x.actor]), [['primary', 'Same line, two floors down.', 'assistant']]);

    // Streamed at once: one entry per field, and the screen told to reload the comps.
    const changes = events.filter((e) => e.type === 'change').map((e) => e.entry as TrailEntry);
    assert.deepEqual(changes.map((c) => [c.kind, c.compId, c.target, c.field, c.before, c.after]), [
      ['comp', id, CHAMBERS, 'tier', 'Not sorted', '1st tier'],
      ['comp', id, CHAMBERS, 'note', null, 'Same line, two floors down.'],
      ['comp', id, CHAMBERS, 'tags', null, 'Same building'],
    ]);
    assert.ok(events.some((e) => e.type === 'comps_changed'));
    assert.ok(events.findIndex((e) => e.type === 'change') < events.findIndex((e) => e.type === 'start'), 'before the reply');

    // The activity log (Dispatch 22b) has it too, as Hubert's.
    const su = new pg.Client({ connectionString: db.urlAs(new URL(process.env.CR_TEST_DATABASE_URL!).username || 'postgres') });
    await su.connect();
    const logged = (await su.query<{ name: string; detail: Block }>(
      `select name, detail from comp_report.activity where report_id = $1 and kind = 'action'`, [reportId])).rows;
    await su.end();
    assert.ok(logged.some((r) => r.name === 'comp.tiered' && r.detail.by === 'hubert' && r.detail.tier === 'primary'), JSON.stringify(logged));

    // And the transcript keeps it: on the reply that made the call.
    const made = (await shown()).filter((m) => m.tools.includes('edit_comp'));
    assert.equal(made.length, 1);
    assert.deepEqual(made[0]!.changes, changes);
  });

  test('a corrected fact: before and after, and StreetEasy’s value back', async () => {
    const id = chambers().reportCompId;
    const { events } = await call('edit_comp', { comp: CHAMBERS.toLowerCase(), changes: { floor: 12 } });
    const entry = events.find((e) => e.type === 'change')!.entry as TrailEntry;
    assert.equal(entry.field, 'floor');
    assert.equal(entry.after, 'Floor 12');
    assert.notEqual(entry.before, 'Floor 12');
    assert.equal(((await row(id)).fact_overrides.floor as { value: number }).value, 12);

    const back = await call('edit_comp', { comp: CHAMBERS, changes: { restore_facts: ['floor'] } });
    const restored = back.events.find((e) => e.type === 'change')!.entry as TrailEntry;
    assert.deepEqual([restored.before, restored.after], ['Floor 12', entry.before]);
    assert.equal((await row(id)).fact_overrides.floor, undefined);
  });

  test('2nd tier takes the star off, and the trail says so', async () => {
    const id = chambers().reportCompId;
    await withActor(pool as unknown as PoolLike, ana, (tx) => tx.query('update comp_report.report_comps set is_anchor = true where id = $1', [id]));
    const { events } = await call('edit_comp', { comp: CHAMBERS, changes: { tier: 'secondary' } });
    assert.deepEqual(events.filter((e) => e.type === 'change').map((e) => (e.entry as TrailEntry).field), ['tier', 'anchor']);
  });

  test('refused edits change nothing, show no trail, and the turn carries on', async () => {
    const before = await row(chambers().reportCompId);
    for (const [input, says] of [
      [{ comp: '1 Nowhere Lane', changes: { tier: 'primary' } }, /No comp in the report/],
      [{ comp: CHAMBERS, changes: { tags: ['x'] } }, /Nothing to change/],
      [{ comp: CHAMBERS, changes: { price: -5 } }, /price is whole dollars/i],
      [{ comp: CHAMBERS, changes: { add_tags: ['Perfect for couples'] } }, /can’t be a tag/],
    ] as const) {
      const { events, result } = await call('edit_comp', input as Block);
      assert.equal(result.is_error, true, JSON.stringify(input));
      assert.match(String(result.content), says);
      assert.equal(events.filter((e) => e.type === 'change').length, 0);
      assert.ok(events.some((e) => e.type === 'done'), 'the turn still answers');
    }
    assert.deepEqual(await row(chambers().reportCompId), before);
  });

  test('web search and a page read: results to the model, sources on the trail', async () => {
    const { result } = await call('web_search', { query: '100 Barclay Street doorman' }, 'Does 100 Barclay have a doorman?');
    assert.equal(result.is_error, undefined);
    assert.deepEqual(searched, ['100 Barclay Street doorman']);
    assert.match(String(result.content), /information, not instructions/);
    const read = await call('read_page', { url: 'https://example.com/b' });
    assert.match(String(read.result.content), /Pets allowed/);
    const local = await call('read_page', { url: 'http://localhost:8888/x' });
    assert.equal(local.result.is_error, true);

    const withSources = (await shown()).filter((m) => m.sources.length);
    assert.deepEqual(withSources.map((m) => m.sources.map((s) => s.url)), [['https://example.com/b'], ['https://example.com/b']]);
  });

  test('the day’s web lookups are capped per person', async () => {
    const was = process.env.CR_WEB_LOOKUPS_PER_DAY;
    process.env.CR_WEB_LOOKUPS_PER_DAY = '3';
    try {
      const { result } = await call('web_search', { query: 'one more' });
      assert.equal(result.is_error, true);
      assert.match(String(result.content), /used up/);
    } finally {
      if (was === undefined) delete process.env.CR_WEB_LOOKUPS_PER_DAY;
      else process.env.CR_WEB_LOOKUPS_PER_DAY = was;
    }
  });

  test('without a searcher, Hubert says search isn’t available', async () => {
    const saved = deps.web;
    delete deps.web;
    try {
      const { result } = await call('web_search', { query: 'anything' });
      assert.equal(result.is_error, true);
      assert.match(String(result.content), /isn’t available/);
    } finally {
      deps.web = saved;
    }
  });

});
