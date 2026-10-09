// The geocoder (Dispatch 11): only the street address goes out, a match counts
// only when its house number, street and borough are ours, and anything else —
// a refusal, a timeout, an error — says why instead of guessing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boroughOf, nycGeoSearch } from './geocode.ts';

const feature = (housenumber: string, street: string, borough: string, lng: number, lat: number, bin = '1001228') => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] },
  properties: { housenumber, street, borough, addendum: { pad: { bin } } },
});
const answering = (features: unknown[], seen: string[] = []) =>
  (async (url: string | URL | Request) => {
    seen.push(String(url));
    return new Response(JSON.stringify({ type: 'FeatureCollection', features }), { status: 200 });
  }) as typeof fetch;

test('a match: the house number, street and borough agree', async () => {
  const seen: string[] = [];
  const g = nycGeoSearch({ fetch: answering([feature('100', 'BARCLAY STREET', 'Manhattan', -74.012935, 40.713783)], seen) });
  assert.deepEqual(await g('100 Barclay Street', 'Manhattan'), {
    status: 'matched', lat: 40.713783, lng: -74.012935, matched: '100 Barclay Street, Manhattan', bin: '1001228',
  });
  const url = new URL(seen[0]!);
  assert.equal(url.origin, 'https://geosearch.planninglabs.nyc');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['size', 'text'], 'nothing else goes out');
  assert.equal(url.searchParams.get('text'), '100 Barclay Street', 'only the street address: no unit, no name');
});

test('the same address in another borough comes later in the list: the borough decides', async () => {
  const g = nycGeoSearch({
    fetch: answering([feature('20', 'PINE STREET', 'Brooklyn', -73.874065, 40.686158), feature('20', 'PINE STREET', 'Manhattan', -74.00972, 40.707737)]),
  });
  const r = await g('20 Pine Street', 'Manhattan');
  assert.equal(r.status, 'matched');
  assert.equal(r.status === 'matched' && r.lat, 40.707737);
});

test('refused: the address only in another borough, a different number, a different street', async () => {
  const otherBorough = await nycGeoSearch({ fetch: answering([feature('5', 'FRANKLIN PLACE', 'Manhattan', -74, 40.7)]) })('5 Franklin Place', 'Staten Island');
  assert.deepEqual(otherBorough, { status: 'refused', reason: 'the geocoder found 5 Franklin Place, Manhattan, not in Staten Island', matched: '5 Franklin Place, Manhattan' });

  const otherNumber = await nycGeoSearch({ fetch: answering([feature('190C', 'MAIN STREET', 'Bronx', -73.8, 40.8)]) })('100 Main Street', 'Brooklyn');
  assert.equal(otherNumber.status, 'refused');
  assert.equal(otherNumber.status === 'refused' && otherNumber.reason, 'the geocoder’s nearest match was 190C Main Street, Bronx, not this address');

  const otherStreet = await nycGeoSearch({ fetch: answering([feature('99999', 'SPRINGFIELD AVENUE', 'Queens', -73.7, 40.7)]) })('99999 Nowhere Avenue', 'Queens');
  assert.equal(otherStreet.status, 'refused', 'the number alone isn’t enough');

  assert.deepEqual(await nycGeoSearch({ fetch: answering([]) })('1 Nothing Street', 'Manhattan'), { status: 'refused', reason: 'the geocoder found no address like it', matched: null });
});

test('refused without asking: no borough to check against, no house number', async () => {
  const seen: string[] = [];
  const g = nycGeoSearch({ fetch: answering([feature('200', 'CHAMBERS STREET', 'Manhattan', -74, 40.7)], seen) });
  assert.equal((await g('200 Chambers Street', null)).status, 'refused');
  assert.equal((await g('Chambers Street', 'Manhattan')).status, 'refused');
});

test('a hyphenated Queens number and an ordinal street match as the city writes them', async () => {
  const g = nycGeoSearch({ fetch: answering([feature('21-10', '44 DRIVE', 'Queens', -73.946988, 40.747758, '4617740')]) });
  assert.equal((await g('21-10 44th Drive', 'Queens')).status, 'matched');
});

test('a timeout, an error status and an unreadable answer fail, saying why', async () => {
  const hang = (async (_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))) as typeof fetch;
  assert.deepEqual(await nycGeoSearch({ fetch: hang, timeoutMs: 50 })('100 Barclay Street', 'Manhattan'), {
    status: 'failed', reason: 'the geocoder didn’t answer within 0.05 seconds',
  });
  const busy = (async () => new Response('busy', { status: 503 })) as typeof fetch;
  assert.deepEqual(await nycGeoSearch({ fetch: busy })('100 Barclay Street', 'Manhattan'), { status: 'failed', reason: 'the geocoder answered 503' });
  const garbled = (async () => new Response('<html>', { status: 200 })) as typeof fetch;
  assert.deepEqual(await nycGeoSearch({ fetch: garbled })('100 Barclay Street', 'Manhattan'), { status: 'failed', reason: 'the geocoder’s answer couldn’t be read' });
});

test('our borough comes from the ZIP, else the city; Queens goes by neighbourhood', () => {
  assert.equal(boroughOf('New York', '10007'), 'Manhattan');
  assert.equal(boroughOf(null, '11201'), 'Brooklyn');
  assert.equal(boroughOf('Long Island City', null), 'Queens');
  assert.equal(boroughOf('new york', null), 'Manhattan');
  assert.equal(boroughOf('Hoboken', null), null);
  assert.equal(boroughOf(null, null), null);
});
