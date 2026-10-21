// The subway near a building (NW-037 a, Dispatch 20): the nearest stations, closest first, within half a mile.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { nearestStations, type SubwayData } from './transit.ts';

const data = JSON.parse(readFileSync(new URL('./data/subway-stations.json', import.meta.url), 'utf8')) as SubwayData;

test('100 Barclay Street: the two nearest stations, with their lines in the MTA colours', () => {
  const near = nearestStations({ lat: 40.7135, lng: -74.0118 }, data);
  assert.equal(near.length, 2);
  assert.ok(near[0]!.miles <= near[1]!.miles);
  for (const s of near) {
    assert.ok(s.miles <= 0.5);
    assert.ok(s.lines.length > 0);
    for (const l of s.lines) assert.match(l.color, /^#[0-9A-F]{6}$/i);
  }
});

test('nowhere near the subway: none', () => {
  assert.deepEqual(nearestStations({ lat: 40.55, lng: -74.25 }, data), []);
  assert.deepEqual(nearestStations({ lat: Number.NaN, lng: -74 }, data), []);
});

test('a line with no colour is left out, and the cap holds', () => {
  const tiny: SubwayData = {
    lines: { A: { color: '#0062CF', textColor: '#FFFFFF' } },
    stations: [
      { name: 'Near', lines: ['A', 'Q'], otherLines: [], lat: 40.7, lng: -74 },
      { name: 'Nearer', lines: ['A'], otherLines: [], lat: 40.7001, lng: -74 },
      { name: 'Far', lines: ['A'], otherLines: [], lat: 40.8, lng: -74 },
    ],
  };
  const near = nearestStations({ lat: 40.7001, lng: -74 }, tiny, { max: 5 });
  assert.deepEqual(near.map((s) => s.name), ['Nearer', 'Near']);
  assert.deepEqual(near[1]!.lines.map((l) => l.line), ['A']);
});
