// Distance's locations (Dispatch 11) against a real PostgreSQL: the home's and
// every comp's building looked up after a save, once per building across every
// report and agent, each lookup recorded as an observation (§12), a refusal and
// a timeout that say why, retries spaced out, and who may trigger any of it.
// The geocoder is the real GeoSearch adapter over a stand-in fetch: nothing
// leaves the machine.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleComps } from '../server/api/comps.ts';
import { handleGeocode, type GeocodeDeps } from '../server/api/geocode.ts';
import { handleReports } from '../server/api/reports.ts';
import { handleWorkspace, type WorkspaceData } from '../server/api/workspace.ts';
import type { GeocodeView } from '../server/buildings.ts';
import type { PoolLike } from '../server/db.ts';
import { nycGeoSearch } from '../server/geocode.ts';
import type { IdentityUser } from '../server/identity.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const PEOPLE: Record<string, string> = {
  'tok-ana-000000000': 'ana@casa-blanca.com',
  'tok-ben-000000000': 'ben@casa-blanca.com',
};

const feature = (housenumber: string, street: string, borough: string, lng: number, lat: number) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { housenumber, street, borough },
});
/** What the stand-in GeoSearch knows, by the text sent. 88 Greenwich hangs the first time it's asked. */
const ANSWERS: Record<string, unknown[]> = {
  '100 Barclay Street': [feature('100', 'BARCLAY STREET', 'Manhattan', -74.012935, 40.713783)],
  '200 Chambers Street': [feature('200', 'CHAMBERS STREET', 'Manhattan', -74.012595, 40.716572)],
  '5 Franklin Place': [feature('5', 'FRANKLIN PLACE', 'Manhattan', -74.003692, 40.717853)],
  '20 Pine Street': [feature('20', 'PINE STREET', 'Brooklyn', -73.874065, 40.686158)],
  '99 John Street': [feature('97', 'JOHN STREET', 'Manhattan', -74.0061, 40.7083)],
  '88 Greenwich Street': [feature('88', 'GREENWICH STREET', 'Manhattan', -74.014092, 40.70788)],
};

describe('locations for distance', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let deps: GeocodeDeps;
  const sent: string[] = [];
  let greenwichAsked = 0;

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = new URL(String(url));
      const text = u.searchParams.get('text') ?? '';
      sent.push(text);
      if (text === '88 Greenwich Street' && greenwichAsked++ === 0) {
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      }
      return new Response(JSON.stringify({ type: 'FeatureCollection', features: ANSWERS[text] ?? [] }), { status: 200 });
    }) as typeof fetch;
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
      geocoder: nycGeoSearch({ fetch: fakeFetch, timeoutMs: 100 }),
      gapMs: 0,
    };
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
  const setHome = async (token: string, reportId: string, address: string, unit: string) => {
    const res = await handleWorkspace(request('api/comp-report/workspace', token, 'PATCH', {
      reportId, state: { intake: { address: { value: address, asOf: '2026-10-06' }, unit: { value: unit, asOf: '2026-10-06' } } },
    }), deps);
    assert.equal(res.status, 200);
  };
  const typeIn = async (token: string, reportId: string, address: string, unit: string) => {
    const res = await handleComps(request('api/comp-report/comps', token, 'POST', {
      reportId, manual: { address, unit, status: 'sold', price: '$2,000,000', date: '2026-08-01', area_sqft: '1000', floor: '9' },
    }), deps);
    assert.equal(res.status, 201);
  };
  const geocode = async (token: string | null, reportId: string) => {
    const res = await handleGeocode(request('api/comp-report/geocode', token, 'POST', { reportId }), deps);
    return { status: res.status, body: (await res.json()) as { geocodes: GeocodeView[]; more: boolean; error?: string } };
  };
  const workspace = async (token: string, reportId: string) =>
    (await (await handleWorkspace(request(`api/comp-report/workspace?report=${reportId}`, token), deps)).json()) as WorkspaceData;
  const of = (views: GeocodeView[], street: string) => views.find((v) => v.buildingKey.endsWith(`|${street}`));
  /** Runs SQL as a person, inside row-level security. */
  const asPerson = async <T>(email: string, sql: string, params: unknown[] = []) => {
    const owner = new pg.Client({ connectionString: db.ownerUrl });
    await owner.connect();
    try {
      await owner.query('begin');
      await owner.query(`select comp_report.enter('user', $1, 'agent', null)`, [email]);
      const { rows } = await owner.query(sql, params);
      await owner.query('commit');
      return rows as T[];
    } finally {
      await owner.end();
    }
  };

  let anas = '';

  test('looking up needs a signed-in person, and only the report’s owner triggers it', async () => {
    anas = await createReport('tok-ana-000000000', '100 Barclay Street #17L');
    assert.equal((await geocode(null, anas)).status, 401);
    assert.equal((await geocode('tok-ben-000000000', anas)).status, 404);
    assert.equal((await geocode('tok-ana-000000000', 'not-a-report')).status, 400);
    assert.equal(sent.length, 0, 'nothing was looked up');
  });

  test('after a save, the home and each comp are looked up: only the street address goes out', async () => {
    await setHome('tok-ana-000000000', anas, '100 Barclay Street, New York, NY', '#17L');
    for (const [address, unit] of [
      ['200 Chambers Street, New York, NY', '#10A'], ['5 Franklin Place, New York, NY', '#14A'], ['20 Pine Street, New York, NY', '#617'],
      ['99 John Street, New York, NY', '#612'], ['88 Greenwich Street, New York, NY', '#602'],
    ] as const) await typeIn('tok-ana-000000000', anas, address, unit);
    const first = await geocode('tok-ana-000000000', anas);
    assert.equal(first.status, 200);
    assert.deepEqual([sent.length, first.body.more], [3, true], 'six buildings: three a call, and more to come');
    const { body } = await geocode('tok-ana-000000000', anas);
    assert.deepEqual([...sent].sort(), ['100 Barclay Street', '20 Pine Street', '200 Chambers Street', '5 Franklin Place', '88 Greenwich Street', '99 John Street']);
    assert.equal(body.more, false);
    const home = of(body.geocodes, '100 barclay st')!;
    assert.deepEqual([home.status, home.lat, home.lng, home.matched, home.geocoder], ['matched', 40.713783, -74.012935, '100 Barclay Street, Manhattan', 'nyc_geosearch']);
    assert.equal(of(body.geocodes, '200 chambers st')?.status, 'matched');
  });

  test('a match in the wrong borough, or for the wrong number, is refused with the reason, never guessed', async () => {
    const views = (await workspace('tok-ana-000000000', anas)).geocodes;
    const pine = of(views, '20 pine st')!;
    assert.deepEqual([pine.status, pine.lat, pine.reason], ['refused', null, 'the geocoder found 20 Pine Street, Brooklyn, not in Manhattan']);
    const john = of(views, '99 john st')!;
    assert.deepEqual([john.status, john.reason], ['refused', 'the geocoder’s nearest match was 97 John Street, Manhattan, not this address']);
  });

  test('a timeout fails, says why, and is tried again only later — no retry storm', async () => {
    let views = (await workspace('tok-ana-000000000', anas)).geocodes;
    const greenwich = of(views, '88 greenwich st')!;
    assert.deepEqual([greenwich.status, greenwich.reason, greenwich.retry], ['failed', 'the geocoder didn’t answer within 0.1 seconds', true]);
    const before = sent.length;
    await geocode('tok-ana-000000000', anas);
    assert.equal(sent.length, before, 'opening again straight away asks nothing: refusals are answers, and the failure waits');
    // Twenty minutes later, the failure is due another try; nothing else is.
    await asPerson('ana@casa-blanca.com', `update comp_report.geocodes set looked_up_at = now() - interval '20 minutes' where building_key like '%88 greenwich st'`);
    views = (await geocode('tok-ana-000000000', anas)).body.geocodes;
    assert.deepEqual(sent.slice(before), ['88 Greenwich Street']);
    assert.equal(of(views, '88 greenwich st')?.status, 'matched');
  });

  test('each lookup is an observation of the properties it located, the home’s included (§12)', async () => {
    const rows = await asPerson<{ address: string; facts: { coordinates?: { source: string; confidence: string; value: { lat: number } } }; raw: { geocoder: string; sent: string; status: string } }>(
      'ana@casa-blanca.com',
      `select p.address, o.facts, o.raw from comp_report.property_observations o join comp_report.properties p on p.id = o.property_id
        where o.source = 'geocoder' and o.report_id = $1 order by o.id`,
      [anas],
    );
    const home = rows.find((r) => r.address === '100 Barclay Street')!;
    assert.deepEqual([home.facts.coordinates?.source, home.facts.coordinates?.confidence, home.facts.coordinates?.value.lat], ['geocoder', 'approx', 40.713783]);
    assert.deepEqual([home.raw.geocoder, home.raw.sent, home.raw.status], ['nyc_geosearch', '100 Barclay Street', 'matched']);
    const pine = rows.find((r) => r.address === '20 Pine Street')!;
    assert.deepEqual([pine.facts, pine.raw.status], [{}, 'refused'], 'a refusal is recorded too, with no coordinates');
    assert.equal(rows.filter((r) => r.address === '88 Greenwich Street').length, 2, 'the timeout and the retry: two lookups, two observations');
  });

  test('one lookup per building, across reports and agents', async () => {
    const before = sent.length;
    const bens = await createReport('tok-ben-000000000', '100 Barclay Street #12A');
    await setHome('tok-ben-000000000', bens, '100 Barclay Street, New York, NY', '#12A'); // the same building, another unit
    await typeIn('tok-ben-000000000', bens, '200 Chambers Street, New York, NY', '#9B');
    const { body } = await geocode('tok-ben-000000000', bens);
    assert.equal(sent.length, before, 'both buildings were already located: nothing asked');
    assert.deepEqual(body.geocodes.map((g) => g.status), ['matched', 'matched']);
    assert.equal((await workspace('tok-ben-000000000', bens)).geocodes.length, 2, 'and the workspace carries them');
  });

  test('an address past the table’s limits is never sent, and never in the way of the rest', async () => {
    const report = await createReport('tok-ben-000000000', 'Long');
    await typeIn('tok-ben-000000000', report, `999 ${'Very '.repeat(45)}Long Street, New York, NY`, '#1');
    await typeIn('tok-ben-000000000', report, '7 Harrison Street, New York, NY', '#2');
    const before = sent.length;
    const { status, body } = await geocode('tok-ben-000000000', report);
    assert.equal(status, 200);
    assert.deepEqual(sent.slice(before), ['7 Harrison Street']);
    assert.deepEqual(body.geocodes.map((g) => g.status), ['refused'], 'the one it could ask about: GeoSearch knows no such address here');
  });

  test('two calls at once ask about a building once', async () => {
    const report = await createReport('tok-ben-000000000', 'Twice');
    await typeIn('tok-ben-000000000', report, '1 Morton Square, New York, NY', '#4E');
    const before = sent.length;
    await Promise.all([geocode('tok-ben-000000000', report), geocode('tok-ben-000000000', report)]);
    assert.deepEqual(sent.slice(before), ['1 Morton Square']);
  });
});
