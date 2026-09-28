// The stable property key (§12): the same home, however it's written, gets
// the same key, so its records accumulate across imports.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identify, normalizeStreet, normalizeUnit, PROPERTY_KEY_VERSION, sameBuilding, sameUnit } from '../index.ts';
import { parseStreetEasyUrl } from '../parser/property-key.ts';
import { hannah, KEY } from './helpers.ts';

test('every comp in the export has a key, and none collide', () => {
  const keys = hannah().comps.map((c) => c.identity.key);
  assert.deepEqual([...keys].sort(), Object.values(KEY).sort());
  assert.ok(keys.every((k) => k?.startsWith(`${PROPERTY_KEY_VERSION}|`)));
});

test('spellings of one home share a key', () => {
  const variants = [
    identify({ address: '200 Chambers Street, New York, NY', unit: '#10A' }),
    identify({ address: '200 CHAMBERS ST., New York, NY', unit: 'Apt 10-A' }),
    identify({ address: '200 Chambers St, Manhattan, NY', unit: '10a' }),
    identify({ address: '200 Chambers Street #10A, New York, NY' }),
    identify({ address: '200 Chambers Street, New York, NY 10007', unit: 'Unit 10A' }),
  ];
  for (const v of variants) assert.equal(v.key, KEY.chambers);
  assert.equal(variants[4]!.address.zip, '10007');
});

test('street spellings normalise', () => {
  assert.equal(normalizeStreet('Fifth Avenue'), normalizeStreet('5th Ave'));
  assert.equal(normalizeStreet('Avenue of the Americas'), normalizeStreet('6th Avenue'));
  assert.equal(normalizeStreet('North Moore Street'), 'n moore st');
  assert.equal(normalizeStreet('25 N. Moore St.'), '25 n moore st');
  assert.equal(normalizeStreet('37-10 30th Street'), '37-10 30 st'); // a Queens house number keeps its hyphen
  assert.equal(normalizeStreet("St. Mark's Place"), normalizeStreet('Saint Marks Pl'));
  assert.equal(normalizeUnit('Penthouse A'), 'PHA');
  assert.equal(normalizeUnit('PH-A'), 'PHA');
  assert.equal(normalizeUnit('  '), null);
});

test('different units differ; the building is shared', () => {
  const a = identify({ address: '100 Barclay Street, New York, NY', unit: '#11F' });
  const b = identify({ address: '100 Barclay St', unit: '17L' }); // a hand-typed subject, no city
  assert.notEqual(a.key, b.key);
  assert.equal(sameBuilding(a, b), true);
  assert.equal(sameUnit(a, b), false);
  assert.equal(sameUnit(a, identify({ address: '100 Barclay St, New York, NY', unit: 'Apt 11F' })), true);
  assert.equal(sameBuilding(a, identify({ address: '100 Barclay Street, Brooklyn, NY', unit: '#11F' })), false);
});

test('StreetEasy links are canonicalised and classified', () => {
  const unit = parseStreetEasyUrl('https://streeteasy.com/building/200-chambers-street-new_york/10a?sst=3c668201035c5fe819c977abddd085dd');
  assert.deepEqual(unit, {
    url: 'https://streeteasy.com/building/200-chambers-street-new_york/10a', kind: 'building_unit',
    listing_id: null, closing_id: null, building_slug: '200-chambers-street-new_york', unit_slug: '10a',
  });
  assert.equal(parseStreetEasyUrl('https://streeteasy.com/closing/11324235')?.closing_id, '11324235');
  assert.equal(parseStreetEasyUrl('https://www.streeteasy.com/sale/1712345/')?.listing_id, '1712345');
  assert.equal(parseStreetEasyUrl('https://streeteasy.com/building/the-leonard')?.kind, 'building');
  assert.equal(parseStreetEasyUrl('https://www.compass.com/listing/123')?.kind, 'other');
  assert.equal(parseStreetEasyUrl('not a url'), null);
  // The export's share token never survives into the record.
  for (const c of hannah().comps) assert.ok(!c.identity.streeteasy?.url.includes('?'));
});

test("a ZIP is only borrowed from the building's address when it's the same street", () => {
  const same = identify({ address: '66 Leonard Street, New York, NY', unit: '#12A', building_address: '66 Leonard Street, New York, NY 10013' });
  assert.equal(same.address.zip, '10013');
  const other = identify({ address: '66 Leonard Street, New York, NY', unit: '#12A', building_address: '1 Other Street, New York, NY 10013' });
  assert.equal(other.address.zip, null);
});

test('no address, no key', () => {
  const none = identify({ unit: '#1A', url: 'https://streeteasy.com/closing/1' });
  assert.equal(none.key, null);
  assert.equal(none.streeteasy?.closing_id, '1');
});
