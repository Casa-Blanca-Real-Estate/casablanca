// The assistant's read-only look at the numbers (get_numbers, CR-3a), end to
// end: the real turn endpoint against the fake Messages API and a real
// PostgreSQL. It never holds the agent's call or any target (§8.4), holds no
// results before the reveal (§3.1), and its figures are the browser's. And a
// conversation stays on the prompt and tools it started with (§8.3 rule 5).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import Anthropic from '@comp-report/anthropic-sdk';
import pg from 'pg';
import { compute, parseExport } from '../engine/index.ts';
import { accessConfig } from '../server/access.ts';
import { handleComps } from '../server/api/comps.ts';
import { handleImports } from '../server/api/imports.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleTurn, type TurnDeps } from '../server/api/turn.ts';
import { handleWorkspace, type WorkspaceData } from '../server/api/workspace.ts';
import { CURRENT_PROMPT, PROMPTS } from '../server/assistant.ts';
import { withActor, type PoolLike } from '../server/db.ts';
import type { IdentityUser } from '../server/identity.ts';
import { newYorkToday, numbersFor } from '../server/numbers.ts';
import { startFakeAnthropic, type FakeAnthropic, type Script } from '../dev/fake-anthropic.ts';
import { engineInput, namedPrices, workspaceComps } from '../workspace/engine-input.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

type Block = Record<string, unknown>;

const HANNAH_CSV = readFileSync(new URL('../../../docs/comp-report/sources/streeteasy-comp-export-100-barclay-17l-2026-09-23.csv', import.meta.url));
const ANA = 'tok-ana-000000000';
const ana = { kind: 'user' as const, email: 'ana@casa-blanca.com', role: 'agent' as const };

// Distinctive figures, so a leak would show: none of these is in the export.
const CALL = { low: 3_333_333, high: 4_111_111 };
const TARGET = 4_444_444;
const SELLER_TARGET = 4_555_555;

describe('get_numbers and prompt versions', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let fake: FakeAnthropic;
  let scripts: Script[];
  let deps: TurnDeps;

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
    };
  });
  after(async () => {
    await fake?.close();
    await pool?.end();
    await db?.drop();
  });

  const request = (path: string, method = 'GET', body?: unknown) =>
    new Request(`https://site/api/comp-report/${path}`, {
      method, headers: { authorization: `Bearer ${ANA}` }, body: body === undefined ? undefined : JSON.stringify(body),
    });
  const createReport = async (title: string) =>
    (await (await handleReports(request('reports', 'POST', { title }), deps)).json()).report.id as string;
  async function turn(reportId: string, message?: string) {
    const res = await handleTurn(request('turn', 'POST', { reportId, message }), deps);
    assert.equal(res.status, 200);
    await res.text();
  }
  const lastSent = () => fake.requests.at(-1)!.body;
  const messageRows = (reportId: string) => withActor(pool as unknown as PoolLike, ana, async (tx) =>
    (await tx.query<{ seq: number; role: string; prompt_version: string | null }>(
      'select seq, role, prompt_version from comp_report.messages where report_id = $1 order by seq', [reportId])).rows);

  /** Asks for get_numbers and returns what the model is sent back. */
  async function getNumbers(reportId: string): Promise<{ raw: string; numbers: Record<string, unknown> }> {
    scripts.push({ content: [{ type: 'tool_use', id: `toolu_${Date.now()}`, name: 'get_numbers', input: {} }], stopReason: 'tool_use' });
    await turn(reportId, 'What do the numbers say?');
    scripts.push({ content: [{ type: 'text', text: 'Here they are.' }], stopReason: 'end_turn' });
    await turn(reportId);
    const sent = lastSent().messages as Array<{ role: string; content: Block[] }>;
    const result = sent.at(-1)!.content.find((b) => b.type === 'tool_result')!;
    assert.equal(result.is_error, undefined, String(result.content));
    return { raw: String(result.content), numbers: JSON.parse(String(result.content)) };
  }

  test('a conversation from before prompt versions stays on CR-1’s prompt and tools', async () => {
    const reportId = await createReport('A CR-1 conversation');
    // As CR-1 stored it: no prompt_version on either message.
    await withActor(pool as unknown as PoolLike, ana, async (tx) => {
      await tx.query(`insert into comp_report.messages (report_id, seq, role, content) values ($1, 1, 'user', $2)`,
        [reportId, JSON.stringify([{ type: 'text', text: 'Hello' }])]);
      await tx.query(`insert into comp_report.messages (report_id, seq, role, content, stop_reason) values ($1, 2, 'assistant', $2, 'end_turn')`,
        [reportId, JSON.stringify([{ type: 'thinking', thinking: 'Old turn.', signature: 'sig-old' }, { type: 'text', text: 'Hi.' }])]);
    });
    scripts.push({ content: [{ type: 'text', text: 'Still on CR-1.' }], stopReason: 'end_turn' });
    await turn(reportId, 'And now?');
    const sent = lastSent();
    assert.deepEqual((sent.tools as Block[]).map((t) => t.name), ['get_report'], 'no new tool in an old conversation');
    assert.equal((sent.system as Block[])[0]!.text, PROMPTS['cr1-2026-09-25']!.system);
    assert.deepEqual((await messageRows(reportId)).slice(2).map((r) => r.prompt_version), ['cr1-2026-09-25', 'cr1-2026-09-25']);

    // And a get_numbers call it could never have been offered is refused, not run.
    scripts.push({ content: [{ type: 'tool_use', id: 'toolu_old', name: 'get_numbers', input: {} }], stopReason: 'tool_use' });
    await turn(reportId, 'Numbers?');
    scripts.push({ content: [{ type: 'text', text: 'ok' }], stopReason: 'end_turn' });
    await turn(reportId);
    const back = (lastSent().messages as Array<{ content: Block[] }>).at(-1)!.content[0]!;
    assert.deepEqual([back.is_error, back.content], [true, 'Unknown tool get_numbers']);
  });

  test('a new conversation gets get_numbers: no results before the reveal, and never the call or a target', async () => {
    const reportId = await createReport('100 Barclay Street, #17L');
    const imported = (await (await handleImports(request('imports', 'POST', {
      reportId, filename: 'hannah.csv', contentBase64: HANNAH_CSV.toString('base64'), asOf: '2026-09-23',
    }), deps)).json()) as WorkspaceData;
    const id = (key: string) => imported.comps.find((c) => c.propertyKey === key)!.reportCompId;
    for (const key of ['pk1|ny|new york|200 chambers st|10A', 'pk1|ny|new york|5 franklin pl|14A', 'pk1|ny|new york|66 leonard st|12A']) {
      const res = await handleComps(request('comps', 'POST', { reportId, reportCompId: id(key), tier: 'primary', reason: 'Close match', reasonType: 'property' }), deps);
      assert.equal(res.status, 200);
    }
    const intake = { areaSqft: { value: 2000, asOf: '2026-09-29', estimate: true }, beds: { value: 3, asOf: '2026-09-29' } };
    const saved = await handleWorkspace(request('workspace', 'PATCH', {
      reportId,
      state: { intake, dealTerms: { template: 'seller_pricing', sellerTarget: { value: SELLER_TARGET, asOf: '2026-09-29' } } },
      target: { price: { value: TARGET, asOf: '2026-09-29' } },
    }), deps);
    assert.equal(saved.status, 200);

    const before = await getNumbers(reportId);
    const sent = lastSent();
    assert.deepEqual((sent.tools as Block[]).map((t) => t.name), ['get_report', 'get_numbers', 'get_email', 'edit_email', 'edit_comp', 'web_search', 'read_page']);
    assert.equal((sent.system as Block[])[0]!.text, CURRENT_PROMPT.system);
    assert.ok((await messageRows(reportId)).every((r) => r.prompt_version === CURRENT_PROMPT.id));
    assert.equal(before.numbers.revealed, false);
    assert.equal('results' in before.numbers, false, 'no results before the call');
    const comps = before.numbers.comps as Array<{ comp: string; tier: string; price_per_sqft: number | null }>;
    assert.equal(comps.length, 11);
    assert.equal(comps.filter((c) => c.tier === 'primary').length, 3);
    assert.equal(comps.find((c) => c.comp === '200 Chambers Street #10A')!.price_per_sqft, 2112, '$/sqft as the agent sees it: truncated');
    for (const secret of [TARGET, SELLER_TARGET]) assert.equal(before.raw.includes(String(secret)), false, `${secret} leaked`);

    // The agent gives their call. Now the results are in — still without the call or the target.
    const at = new Date().toISOString();
    assert.equal((await handleWorkspace(request('workspace', 'PATCH', { reportId, call: { ...CALL, at } }), deps)).status, 200);
    const after = await getNumbers(reportId);
    assert.equal(after.numbers.revealed, true);
    for (const secret of [CALL.low, CALL.high, TARGET, SELLER_TARGET]) assert.equal(after.raw.includes(String(secret)), false, `${secret} leaked`);

    // The same figures the browser shows: the engine on the same inputs, with the call and target it evaluates.
    const parsed = parseExport(new Uint8Array(HANNAH_CSV), { as_of: '2026-09-23', filename: 'hannah.csv' });
    const ws = (await (await handleWorkspace(request(`workspace?report=${reportId}`), deps)).json()) as WorkspaceData;
    const browserComps = workspaceComps([{ importId: ws.imports[0]!.id, createdAt: ws.imports[0]!.createdAt, parsed }], ws.comps);
    const browser = compute(engineInput({
      asOf: newYorkToday(), intake, comps: browserComps,
      prices: namedPrices({ ...CALL, at }, { price: { value: TARGET, asOf: '2026-09-29' } }),
    }));
    const results = after.numbers.results as Record<string, { base: number | null; range: { low: number; high: number } | null }>;
    for (const kind of ['on_facts', 'with_estimates'] as const) {
      const r = browser.results[kind];
      assert.equal(results[kind]!.base, r.base ? Math.round(r.base.value) : null, kind);
      assert.deepEqual(results[kind]!.range && [results[kind]!.range!.low, results[kind]!.range!.high],
        r.range ? [Math.round(r.range.low.value), Math.round(r.range.high.value)] : null, kind);
    }
    assert.ok(results.with_estimates!.base, 'with estimates has a base from the estimated size');
    assert.equal(results.on_facts!.base, null, 'on the facts has none: the size is only an estimate');
  });
  test('a buyer’s client facts reach get_numbers after the reveal only, without the client’s name (Your client)', async () => {
    const reportId = await createReport('A buyer with a pre-approval');
    const PRE_APPROVAL = 3_777_777;
    const saved = await handleWorkspace(request('workspace', 'PATCH', {
      reportId,
      brief: {
        audience: { value: 'buyer', asOf: '2026-10-29' },
        clientName: { value: 'Jordan Ames', asOf: '2026-10-29' },
        client: { urgency: { pace: { value: 'asap', asOf: '2026-10-29' } }, motivations: { value: 'Lease ends in March', asOf: '2026-10-29' } },
      },
      state: { dealTerms: { template: 'buyer_traditional', financing: { value: 'mortgage', asOf: '2026-10-29' }, preApproved: { value: true, asOf: '2026-10-29' }, preApprovalAmount: { value: PRE_APPROVAL, asOf: '2026-10-29' } } },
    }), deps);
    assert.equal(saved.status, 200);
    const read = () => withActor(pool as unknown as PoolLike, ana, (tx) => numbersFor(tx, reportId));
    const before = await read();
    assert.equal('client' in before!, false, 'nothing about the client before the reveal');
    assert.equal(JSON.stringify(before).includes('3,777,777'), false);

    const res = await handleWorkspace(request('workspace', 'PATCH', { reportId, call: { skipped: true, at: new Date().toISOString() } }), deps);
    assert.equal(res.status, 200);
    const after = await read();
    const client = (after as Record<string, unknown>).client as Record<string, unknown>;
    assert.equal(client.side, 'buyer');
    assert.equal(client.pre_approved, true);
    assert.equal(client.pre_approved_for, '$3,777,777');
    assert.equal(client.how_soon, 'as soon as possible');
    assert.equal(client.what_is_moving_them, 'Lease ends in March');
    assert.equal(JSON.stringify(after).includes('Jordan'), false, 'never the client’s name');

    // The pace is one of two, and a hard fair-housing term in what's moving them isn't saved.
    const bad = await handleWorkspace(request('workspace', 'PATCH', { reportId, brief: { client: { urgency: { pace: { value: 'yesterday', asOf: '2026-10-29' } } } } }), deps);
    assert.equal(bad.status, 400);
    const fh = await handleWorkspace(request('workspace', 'PATCH', { reportId, brief: { client: { motivations: { value: 'Wants a building with no children', asOf: '2026-10-29' } } } }), deps);
    assert.equal(fh.status, 400);
  });
  test('the home’s time on the market, from its StreetEasy read, reaches get_numbers', async () => {
    const reportId = await createReport('100 Barclay Street #17L');
    const asOf = newYorkToday();
    await withActor(pool as unknown as PoolLike, ana, (tx) => tx.query(
      `insert into comp_report.link_reads (report_id, purpose, url, status, as_of, extract)
       values ($1, 'subject', 'https://streeteasy.com/building/100-barclay-street-new_york/17l', 'done', $2, $3)`,
      [reportId, asOf, JSON.stringify({ address: '100 Barclay Street', unit: '#17L', status: 'For sale', last_ask: '$4,250,000', original_ask: '$4,500,000', days_on_market: '72 days' })],
    ));
    const numbers = await withActor(pool as unknown as PoolLike, ana, (tx) => numbersFor(tx, reportId));
    assert.deepEqual((numbers!.subject as Record<string, unknown>).on_the_market, {
      days_on_market: 72, days_on_market_is: 'as the listing or export says', original_asking_price: 4_500_000,
    });
  });
});
