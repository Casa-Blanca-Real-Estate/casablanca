// StreetEasy links and typed-in comps (Dispatch 09, CR-3b phase 1) against a
// real PostgreSQL: which links are read, the background read from queued to a
// comp in the report, the one-tap confirm, failures that say why, the per-user
// limit, the home by link, and who may do any of it. The page reader is a
// stand-in that answers Abacus's listing fixtures; nothing reaches Firecrawl.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleComps } from '../server/api/comps.ts';
import { handleLinks, runLinkRead, type LinkReadDeps } from '../server/api/links.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleWorkspace, type LinkReadView, type WorkspaceData } from '../server/api/workspace.ts';
import type { PoolLike } from '../server/db.ts';
import { decideConfig } from '../server/decide/config.ts';
import { DRAIN_PATH } from '../server/decide/enqueue.ts';
import type { IdentityUser } from '../server/identity.ts';
import type { PageRead, PageReader } from '../server/links.ts';
import type { AuthDeps } from '../server/session.ts';
import type { CompJudgment } from '../workspace/state.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const fixture = (name: string) => {
  const data = JSON.parse(readFileSync(new URL(`../engine/test/fixtures/listings/${name}`, import.meta.url), 'utf8')) as Record<string, unknown>;
  delete data._fixture;
  return data;
};

const LINK = {
  chambers: 'https://streeteasy.com/building/200-chambers-street-new_york/10a',
  franklin: 'https://streeteasy.com/building/5-franklin-place-new_york/14a',
  fulton315: 'https://streeteasy.com/building/111-fulton-street-new_york/315',
  pine: 'https://streeteasy.com/building/20-pine-street-new_york/617',
  fulton309: 'https://streeteasy.com/building/111-fulton-street-new_york/309',
  wall: 'https://streeteasy.com/building/blocked-street-new_york/1a',
  rental: 'https://streeteasy.com/building/9-rental-street-new_york/2b',
  noAddress: 'https://streeteasy.com/sale/1234567',
  home: 'https://streeteasy.com/building/100-barclay-street-new_york/17l',
};

const PAGES: Record<string, PageRead> = {
  [LINK.chambers]: { ok: true, extract: fixture('sold-200-chambers-10a.json') },
  [LINK.franklin]: { ok: true, extract: fixture('sold-5-franklin-14a-approx-size.json') },
  [LINK.fulton315]: { ok: true, extract: fixture('in-contract-111-fulton-315.json') },
  [LINK.pine]: { ok: true, extract: fixture('active-20-pine-617.json') },
  [LINK.fulton309]: { ok: true, extract: fixture('off-market-111-fulton-309.json') },
  [LINK.wall]: { ok: false, code: 'blocked', message: 'StreetEasy asked for a “verify you’re human” check.' },
  [LINK.rental]: { ok: true, extract: { address: '9 Rental Street', unit: '#2B', city: 'New York', state: 'NY', status: 'For rent', last_ask: '$6,500/mo' } },
  [LINK.noAddress]: { ok: true, extract: { status: 'Sold', sale_price: '$1,200,000', sale_date: 'Aug 1, 2026' } },
  [LINK.home]: {
    ok: true,
    extract: {
      address: '100 Barclay Street', unit: '#17L', city: 'New York', state: 'NY', status: 'No longer available',
      last_ask: '$3,995,000', floor: '17', interior_size: '~2,000 ft²', beds: '3 beds', baths: '3 baths',
      common_charges: '$2,650/mo', taxes: '$2,480/mo', property_type: 'Condo',
    },
  },
};

const PEOPLE: Record<string, string> = {
  'tok-kimani-000000': 'kimani@casa-blanca.com',
  'tok-ana-000000000': 'ana@casa-blanca.com',
  'tok-ben-000000000': 'ben@casa-blanca.com',
};

describe('StreetEasy links and typed-in comps', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let deps: AuthDeps & { env: Record<string, string | undefined> };
  let readDeps: LinkReadDeps;
  const calls: string[] = [];

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
      env: { CR_LINK_READS_PER_DAY: '12' },
    };
    const reader: PageReader = {
      async read(url) {
        calls.push(url);
        await new Promise((r) => setTimeout(r, 20));
        return PAGES[url] ?? { ok: false, code: 'not_found', message: 'No such page.' };
      },
    };
    readDeps = { ...deps, reader, today: () => '2026-09-30' };
  });
  after(async () => {
    await pool.end();
    await db?.drop();
  });

  const request = (path: string, token: string | null, method = 'GET', body?: unknown) =>
    new Request(`https://site/${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const createReport = async (token: string, title: string) =>
    (await (await handleReports(request('api/comp-report/reports', token, 'POST', { title }), deps)).json()).report.id as string;
  type LinksBody = { queued: string[]; already: string[]; refused: { url: string; reason: string }[]; limit: { perDay: number; left: number }; reads: LinkReadView[]; comps: CompJudgment[] };
  const links = async (token: string | null, method: string, body?: unknown, query = '') => {
    const res = await handleLinks(request(`api/comp-report/links${query}`, token, method, body), deps);
    return { status: res.status, body: (await res.json()) as LinksBody & { error?: string } };
  };
  const run = async (token: string | null, reportId: string, readId: string) => {
    const res = await runLinkRead(request('.netlify/functions/comp-report-links-background', token, 'POST', { reportId, readId }), readDeps);
    return { status: res.status, body: (await res.json()) as { started?: boolean; status?: string; error?: string } };
  };
  const workspace = async (token: string, reportId: string) =>
    (await (await handleWorkspace(request(`api/comp-report/workspace?report=${reportId}`, token), deps)).json()) as WorkspaceData;
  const comps = (token: string, method: string, body: unknown) => handleComps(request('api/comp-report/comps', token, method, body), deps);
  const readOf = async (token: string, reportId: string, id: string) => (await workspace(token, reportId)).reads.find((r) => r.id === id)!;

  let report = '';

  test('every links endpoint, and the background read, needs a signed-in person', async () => {
    report = await createReport('tok-ana-000000000', '100 Barclay Street #17L');
    assert.equal((await links(null, 'GET', undefined, `?report=${report}`)).status, 401);
    assert.equal((await links(null, 'POST', { reportId: report, urls: [LINK.chambers] })).status, 401);
    assert.equal((await links(null, 'PATCH', { reportId: report, readId: report, dismissed: true })).status, 401);
    assert.equal((await run(null, report, report)).status, 401);
    assert.equal(calls.length, 0, 'nothing was read');
  });

  test('only StreetEasy listing links are queued: canonical, once each, with a reason for every refusal', async () => {
    const { status, body } = await links('tok-ana-000000000', 'POST', {
      reportId: report,
      urls: [
        `${LINK.chambers}?sst=abc123&utm=x`, LINK.chambers, 'streeteasy.com/building/5-franklin-place-new_york/14a',
        'https://streeteasy.com/rental/4455667', 'https://streeteasy.com/building/200-chambers-street-new_york',
        'https://www.zillow.com/homedetails/200-chambers', 'not a link at all', 'https://streeteasy.com/for-sale/tribeca',
      ],
    });
    assert.equal(status, 201);
    assert.equal(body.queued.length, 2);
    assert.deepEqual(body.reads.map((r) => [r.url, r.status, r.purpose]), [[LINK.chambers, 'queued', 'comp'], [LINK.franklin, 'queued', 'comp']]);
    const why = (url: string) => body.refused.find((r) => r.url === url)?.reason ?? '';
    assert.equal(body.refused.length, 5);
    assert.match(why('https://streeteasy.com/rental/4455667'), /rental listing/);
    assert.match(why('https://streeteasy.com/building/200-chambers-street-new_york'), /building’s page/);
    assert.match(why('https://www.zillow.com/homedetails/200-chambers'), /Only StreetEasy/);
    assert.match(why('not a link at all'), /Only StreetEasy/);
    assert.match(why('https://streeteasy.com/for-sale/tribeca'), /isn’t a listing/);
    // The same link again isn't read twice.
    const again = await links('tok-ana-000000000', 'POST', { reportId: report, urls: [LINK.chambers] });
    assert.deepEqual([again.body.queued.length, again.body.already.length], [0, 1]);
    // Bad requests.
    assert.equal((await links('tok-ana-000000000', 'POST', { reportId: report, urls: [] })).body.error, 'no_links');
    assert.equal((await links('tok-ana-000000000', 'POST', { reportId: report, urls: Array(21).fill(LINK.pine) })).body.error, 'too_many_links');
    assert.equal((await links('tok-ana-000000000', 'POST', { reportId: report, urls: [LINK.home, LINK.pine], purpose: 'subject' })).body.error, 'one_home');
    assert.equal((await links('tok-ana-000000000', 'POST', { reportId: report, urls: [LINK.pine], purpose: 'both' })).body.error, 'bad_purpose');
  });

  test('a read fills its row in: the property, what the page said as an observation, and the comp, unconfirmed and untiered', async () => {
    const { reads } = await workspace('tok-ana-000000000', report);
    const chambers = reads.find((r) => r.url === LINK.chambers)!;
    const res = await run('tok-ana-000000000', report, chambers.id);
    assert.deepEqual([res.status, res.body.started, res.body.status], [200, true, 'done']);
    const ws = await workspace('tok-ana-000000000', report);
    const read = ws.reads.find((r) => r.id === chambers.id)!;
    assert.deepEqual([read.status, read.asOf, read.error, read.extract], ['done', '2026-09-30', null, null], 'a comp’s extract rides on its comp, not its read');
    const comp = ws.comps.find((c) => c.reportCompId === read.reportCompId)!;
    assert.equal(comp.propertyKey, 'pk1|ny|new york|200 chambers st|10A', 'the export’s key: the same home from both dedupes');
    assert.deepEqual([comp.evidenceClass, comp.tier, comp.source.kind], ['sold', null, 'listing']);
    assert.ok(comp.source.kind === 'listing' && comp.source.confirmedAt === null && comp.source.url === LINK.chambers && comp.source.asOf === '2026-09-30');
    assert.deepEqual(comp.source.kind === 'listing' && comp.source.extract, PAGES[LINK.chambers]!.ok && (PAGES[LINK.chambers] as { extract: unknown }).extract, 'the extract, exactly as read');

    const owner = new pg.Client({ connectionString: db.ownerUrl });
    await owner.connect();
    try {
      // Row-level security binds the owner too: read as Ana.
      await owner.query(`begin`);
      await owner.query(`select comp_report.enter('user', 'ana@casa-blanca.com', 'agent', null)`);
      const { rows } = await owner.query(`select o.source, o.as_of::text as as_of, o.links, o.raw is not null as has_raw, o.parser_version from comp_report.property_observations o
        join comp_report.link_reads lr on lr.observation_id = o.id where lr.id = $1`, [chambers.id]);
      assert.deepEqual(rows, [{ source: 'listing', as_of: '2026-09-30', links: [LINK.chambers], has_raw: true, parser_version: rows[0].parser_version }]);
      assert.match(String(rows[0]?.parser_version), /\S/);
      await owner.query(`commit`);
    } finally {
      await owner.end();
    }
  });

  test('a read is claimed once: two starts at the same moment read the page once', async () => {
    const { reads } = await workspace('tok-ana-000000000', report);
    const franklin = reads.find((r) => r.url === LINK.franklin)!;
    const before = calls.filter((u) => u === LINK.franklin).length;
    const [a, b] = await Promise.all([run('tok-ana-000000000', report, franklin.id), run('tok-ana-000000000', report, franklin.id)]);
    assert.deepEqual([a.body.started, b.body.started].sort(), [false, true]);
    assert.equal(calls.filter((u) => u === LINK.franklin).length - before, 1);
    // Done is done: starting it again reads nothing.
    assert.equal((await run('tok-ana-000000000', report, franklin.id)).body.started, false);
  });

  test('the agent confirms a read comp in one tap; there’s nothing left to confirm after', async () => {
    const ws = await workspace('tok-ana-000000000', report);
    const comp = ws.comps.find((c) => c.source.kind === 'listing' && c.propertyKey.includes('200 chambers st'))!;
    const res = await comps('tok-ana-000000000', 'PATCH', { reportId: report, reportCompId: comp.reportCompId, confirmed: true });
    assert.equal(res.status, 200);
    const after = ((await res.json()) as WorkspaceData).comps.find((c) => c.reportCompId === comp.reportCompId)!;
    assert.ok(after.source.kind === 'listing' && after.source.confirmedAt);
    const again = await comps('tok-ana-000000000', 'PATCH', { reportId: report, reportCompId: comp.reportCompId, confirmed: true });
    assert.deepEqual([again.status, (await again.json()).error], [409, 'nothing_to_confirm']);
    assert.equal((await comps('tok-ana-000000000', 'PATCH', { reportId: report, reportCompId: comp.reportCompId, confirmed: false })).status, 400);
  });

  test('in contract, active and "didn’t sell" come in by link too, each with its status', async () => {
    const { body } = await links('tok-ana-000000000', 'POST', { reportId: report, urls: [LINK.fulton315, LINK.pine, LINK.fulton309] });
    for (const id of body.queued) assert.equal((await run('tok-ana-000000000', report, id)).body.status, 'done');
    const ws = await workspace('tok-ana-000000000', report);
    const status = (fragment: string) => ws.comps.find((c) => c.propertyKey.includes(fragment))!.evidenceClass;
    assert.deepEqual([status('111 fulton st|315'), status('20 pine st|617'), status('111 fulton st|309')], ['in_contract', 'active', 'off_market']);
  });

  test('a read that fails says why, keeps what the page said, can be cleared, and the link can be tried again', async () => {
    const { body } = await links('tok-ana-000000000', 'POST', { reportId: report, urls: [LINK.wall, LINK.rental, LINK.noAddress] });
    for (const id of body.queued) assert.equal((await run('tok-ana-000000000', report, id)).body.status, 'failed');
    const ws = await workspace('tok-ana-000000000', report);
    const byUrl = (u: string) => ws.reads.find((r) => r.url === u)!;
    assert.deepEqual([byUrl(LINK.wall).status, byUrl(LINK.wall).error, byUrl(LINK.wall).extract], ['failed', 'blocked', null]);
    assert.equal(byUrl(LINK.rental).error, 'rental');
    assert.equal(byUrl(LINK.noAddress).error, 'no_address');
    assert.deepEqual(byUrl(LINK.noAddress).extract, (PAGES[LINK.noAddress] as { extract: unknown }).extract, '“type it in” starts from what the page said');
    assert.ok(ws.comps.every((c) => !c.propertyKey.includes('rental')), 'a failed read makes no comp');

    const cleared = await links('tok-ana-000000000', 'PATCH', { reportId: report, readId: byUrl(LINK.wall).id, dismissed: true });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.reads.some((r) => r.url === LINK.wall), false);
    const retry = await links('tok-ana-000000000', 'POST', { reportId: report, urls: [LINK.wall] });
    assert.equal(retry.body.queued.length, 1, 'a failed link can be read again');
    // Only a failed read can be cleared.
    const done = ws.reads.find((r) => r.status === 'done')!;
    assert.equal((await links('tok-ana-000000000', 'PATCH', { reportId: report, readId: done.id, dismissed: true })).status, 409);
  });

  test('only the owner can queue or start a read; an admin can see them, not start them', async () => {
    const queued = (await workspace('tok-ana-000000000', report)).reads.find((r) => r.status === 'queued')!;
    assert.equal((await links('tok-ben-000000000', 'GET', undefined, `?report=${report}`)).status, 404);
    assert.equal((await links('tok-ben-000000000', 'POST', { reportId: report, urls: [LINK.pine] })).status, 404);
    assert.equal((await run('tok-ben-000000000', report, queued.id)).status, 404);
    assert.equal((await links('tok-kimani-000000', 'GET', undefined, `?report=${report}`)).status, 200);
    assert.equal((await run('tok-kimani-000000', report, queued.id)).status, 404);
    assert.equal((await readOf('tok-ana-000000000', report, queued.id)).status, 'queued', 'still waiting for its owner');
  });

  test('a read that died while running can be claimed again; one that’s just running can’t', async () => {
    const queued = (await workspace('tok-ana-000000000', report)).reads.find((r) => r.status === 'queued')!;
    const owner = new pg.Client({ connectionString: db.ownerUrl });
    await owner.connect();
    try {
      // Set the row up the way a crashed run leaves it, as Ana (row-level security holds for the owner too).
      await owner.query(`begin`);
      await owner.query(`select comp_report.enter('user', 'ana@casa-blanca.com', 'agent', null)`);
      await owner.query(`update comp_report.link_reads set status = 'running', started_at = now() where id = $1`, [queued.id]);
      await owner.query(`commit`);
      assert.equal((await run('tok-ana-000000000', report, queued.id)).body.started, false, 'running, and not stale');
      await owner.query(`begin`);
      await owner.query(`select comp_report.enter('user', 'ana@casa-blanca.com', 'agent', null)`);
      await owner.query(`update comp_report.link_reads set started_at = now() - interval '10 minutes' where id = $1`, [queued.id]);
      await owner.query(`commit`);
    } finally {
      await owner.end();
    }
    const res = await run('tok-ana-000000000', report, queued.id);
    assert.equal(res.body.started, true);
  });

  test('a read that died twice isn’t started a third time: it fails as too long, and says so', async () => {
    // Kimani's reads: Ana's and Ben's daily counts are tested below.
    const twice = await createReport('tok-kimani-000000', 'Died twice');
    const { body } = await links('tok-kimani-000000', 'POST', { reportId: twice, urls: [LINK.chambers] });
    const id = body.queued[0]!;
    const owner = new pg.Client({ connectionString: db.ownerUrl });
    await owner.connect();
    try {
      await owner.query(`begin`);
      await owner.query(`select comp_report.enter('user', 'kimani@casa-blanca.com', 'admin', null)`);
      await owner.query(`update comp_report.link_reads set status = 'running', attempts = 2, started_at = now() - interval '10 minutes' where id = $1`, [id]);
      await owner.query(`commit`);
    } finally {
      await owner.end();
    }
    const before = calls.length;
    assert.equal((await run('tok-kimani-000000', twice, id)).body.started, false);
    assert.equal(calls.length, before, 'no page read');
    const read = (await workspace('tok-kimani-000000', twice)).reads.find((r) => r.id === id)!;
    assert.deepEqual([read.status, read.error], ['failed', 'timeout']);
    assert.match(read.errorMessage ?? '', /more than 3 minutes/);
  });

  test('the home by link: read like a comp, but it makes no comp, and its details are confirmed once', async () => {
    const home = await createReport('tok-ana-000000000', '100 Barclay Street #17L');
    const { body } = await links('tok-ana-000000000', 'POST', { reportId: home, urls: [LINK.home], purpose: 'subject' });
    assert.equal(body.queued.length, 1);
    assert.equal((await run('tok-ana-000000000', home, body.queued[0]!)).body.status, 'done');
    const ws = await workspace('tok-ana-000000000', home);
    const read = ws.reads.find((r) => r.purpose === 'subject')!;
    assert.deepEqual([read.status, read.reportCompId, ws.comps.length], ['done', null, 0]);
    assert.equal((read.extract as { interior_size: string }).interior_size, '~2,000 ft²', 'the home’s read carries its extract, for the details screen');
    const confirmed = await links('tok-ana-000000000', 'PATCH', { reportId: home, readId: read.id, confirmed: true });
    assert.equal(confirmed.status, 200);
    assert.ok(confirmed.body.reads.find((r) => r.id === read.id)!.confirmedAt);
    assert.equal((await links('tok-ana-000000000', 'PATCH', { reportId: home, readId: read.id, confirmed: true })).status, 409);
  });

  test('a comp typed in is the agent’s record: read by the engine and kept as an observation', async () => {
    const res = await comps('tok-ana-000000000', 'POST', {
      reportId: report,
      manual: { address: '88 Greenwich Street, New York, NY', unit: '#602', status: 'sold', price: '$740,000', date: '2025-08-15', area_sqft: '735', floor: '6', junk: 'ignored' },
    });
    assert.equal(res.status, 201);
    const ws = (await res.json()) as WorkspaceData;
    const comp = ws.comps.find((c) => c.propertyKey === 'pk1|ny|new york|88 greenwich st|602')!;
    assert.deepEqual([comp.evidenceClass, comp.source.kind, comp.tier], ['sold', 'manual', null]);
    assert.ok(comp.source.kind === 'manual');
    assert.equal((comp.source.fields as Record<string, unknown>).junk, undefined, 'only a typed-in comp’s fields are kept');
    const bad = async (manual: unknown) => {
      const r = await comps('tok-ana-000000000', 'POST', { reportId: report, manual });
      return [r.status, (await r.json()).error];
    };
    assert.deepEqual(await bad({ status: 'sold', price: 1 }), [400, 'no_address']);
    assert.deepEqual(await bad({ address: '1 Main St', status: 'sold-ish' }), [400, 'bad_comp']);
    assert.deepEqual(await bad({ address: '1 Main St', status: 'sold', url: 'https://evil.example/x' }), [400, 'bad_url']);
    assert.equal((await comps('tok-ben-000000000', 'POST', { reportId: report, manual: { address: '1 Main St', status: 'sold' } })).status, 404);
  });
  test('each person has a daily limit on reads, across all their reports', async () => {
    // 12 a day here. Ana has used 10: 2, then 3, 3, a retry and her home's.
    const other = await createReport('tok-ana-000000000', 'Another home');
    const { body } = await links('tok-ana-000000000', 'POST', {
      reportId: other,
      urls: ['https://streeteasy.com/building/1-a-street-new_york/1', 'https://streeteasy.com/building/2-a-street-new_york/2', 'https://streeteasy.com/building/3-a-street-new_york/3'],
    });
    assert.equal(body.queued.length, 2);
    assert.equal(body.refused.length, 1);
    assert.match(body.refused[0]!.reason, /limit of 12/);
    assert.deepEqual(body.limit, { perDay: 12, left: 0 });
    // Someone else's count is their own.
    const ben = await createReport('tok-ben-000000000', 'Ben’s home');
    assert.equal((await links('tok-ben-000000000', 'POST', { reportId: ben, urls: [LINK.chambers] })).body.queued.length, 1);
  });

  test('a finished read queues its listing for Jev only in watch mode (CR-D); off, it queues nothing', async () => {
    const decideRows = async () => {
      const owner = new pg.Client({ connectionString: db.ownerUrl });
      await owner.connect();
      try {
        await owner.query('begin');
        await owner.query(`select comp_report.enter('user', 'kimani@casa-blanca.com', 'admin', null)`);
        const { rows } = await owner.query(`select r.observation_id::int as observation_id, r.status, r.drop_reason, r.user_email, r.question_ids,
            lr.url from comp_report.decide_requests r join comp_report.link_reads lr on lr.observation_id = r.observation_id order by r.id`);
        await owner.query('commit');
        return rows;
      } finally {
        await owner.end();
      }
    };
    // Every read above ran with CR_JEV_MODE unset: off, the production default.
    assert.deepEqual(await decideRows(), []);

    const benReport = (await (await handleReports(request('api/comp-report/reports', 'tok-ben-000000000'), deps)).json()).reports[0].id as string;
    const pending = (await workspace('tok-ben-000000000', benReport)).reads.find((r) => r.url === LINK.chambers)!;
    const kicks: string[] = [];
    const fetchImpl = (async (url: URL | string) => { kicks.push(String(url)); return new Response(null, { status: 202 }); }) as unknown as typeof fetch;
    const watchDeps = (env: Record<string, string>): LinkReadDeps => ({ ...readDeps, decide: { config: decideConfig({ CR_JEV_MODE: 'watch', ...env }), fetchImpl } });

    // Watch, with no Gateway key: recorded at once as dropped (no-key), nothing sent, no drainer started.
    const noKey = await runLinkRead(request('.netlify/functions/comp-report-links-background', 'tok-ben-000000000', 'POST', { reportId: benReport, readId: pending.id }), watchDeps({}));
    assert.equal((await noKey.json()).status, 'done');
    let rows = await decideRows();
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].url, rows[0].status, rows[0].drop_reason, rows[0].user_email], [LINK.chambers, 'dropped', 'no-key', 'ben@casa-blanca.com']);
    assert.ok(rows[0].question_ids.includes('condition'));
    assert.deepEqual(kicks, []);

    // Watch, with a key: a page with no description has nothing to ask, so nothing is queued…
    const keyed = watchDeps({ AI_GATEWAY_API_KEY: 'test-key-not-real' });
    const readOne = async (url: string) => {
      const queued = await links('tok-ben-000000000', 'POST', { reportId: benReport, urls: [url] });
      const res = await runLinkRead(request('.netlify/functions/comp-report-links-background', 'tok-ben-000000000', 'POST', { reportId: benReport, readId: queued.body.queued[0] }), keyed);
      assert.equal((await res.json()).status, 'done');
    };
    await readOne(LINK.pine);
    assert.equal((await decideRows()).length, 1);
    assert.deepEqual(kicks, []);
    // …and one with a description is queued for the drainer, and the drainer started.
    await readOne(LINK.fulton315);
    rows = await decideRows();
    assert.deepEqual(rows.map((r) => [r.url, r.status]), [[LINK.chambers, 'dropped'], [LINK.fulton315, 'queued']]);
    assert.deepEqual(kicks, [`https://site${DRAIN_PATH}`]);
  });

  test('Hubert’s find, approved by the agent from his card: read as his, confirmed, and untiered', async () => {
    const found = await createReport('tok-ben-000000000', 'Hubert’s find');
    const { body } = await links('tok-ben-000000000', 'POST', { reportId: found, urls: [LINK.chambers], purpose: 'comp', found: 'hubert' });
    assert.equal(body.queued.length, 1);
    assert.equal((await run('tok-ben-000000000', found, body.queued[0]!)).body.status, 'done');
    const ws = await workspace('tok-ben-000000000', found);
    const read = ws.reads.find((r) => r.id === body.queued[0])!;
    assert.deepEqual([read.foundBy, Boolean(read.confirmedAt)], ['hubert', true], 'the agent checked it before approving');
    const comp = ws.comps.find((c) => c.reportCompId === read.reportCompId)!;
    assert.equal(comp.tier, null, 'it counts toward nothing until the agent tiers it');
    assert.ok(comp.source.kind === 'listing' && comp.source.confirmedAt);
    // A subject link can't be marked as his.
    const home = await links('tok-ben-000000000', 'POST', { reportId: found, urls: [LINK.home], purpose: 'subject', found: 'hubert' });
    assert.equal(home.body.reads.find((r) => r.purpose === 'subject')!.foundBy, undefined);
  });
});
