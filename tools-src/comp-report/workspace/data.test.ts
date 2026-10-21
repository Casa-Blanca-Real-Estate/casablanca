// The reference lists in workspace/data/ (Dispatch 17), checked for shape: the
// neighborhoods have no duplicate name and a known borough; every station has
// coordinates in the city and at least one line, and every line it names has a
// colour; the photo hosts are bare lowercase hostnames, none a dot-suffix of another.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const data = (name: string): unknown => JSON.parse(readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8'));

const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];

test('neighborhoods: a name and a borough each, no name twice', () => {
  const list = data('streeteasy-neighborhoods.json') as { name: string; borough: string }[];
  assert.ok(Array.isArray(list) && list.length > 300);
  for (const n of list) {
    assert.deepEqual(Object.keys(n).sort(), ['borough', 'name']);
    assert.equal(typeof n.name, 'string');
    assert.equal(n.name, n.name.trim());
    assert.ok(n.name.length > 0);
    assert.ok(BOROUGHS.includes(n.borough), n.borough);
  }
  const names = list.map((n) => n.name);
  assert.equal(new Set(names).size, names.length);
  for (const b of BOROUGHS) assert.ok(list.some((n) => n.borough === b), b);
  // StreetEasy's own spelling, kept as written.
  assert.ok(names.includes("Hell's Kitchen") && names.includes('Murray Hill (Queens)'));
});

test('subway: every station has coordinates and a line, every line a colour', () => {
  const { lines, stations } = data('subway-stations.json') as {
    lines: Record<string, { color: string; textColor: string }>;
    stations: { name: string; lines: string[]; otherLines: string[]; lat: number; lng: number; gtfsStopIds: string[] }[];
  };
  for (const [line, c] of Object.entries(lines)) {
    assert.match(c.color, /^#[0-9A-F]{6}$/, line);
    assert.match(c.textColor, /^#[0-9A-F]{6}$/, line);
  }
  assert.ok(stations.length > 400);
  const ids = stations.flatMap((s) => s.gtfsStopIds);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of stations) {
    assert.ok(s.name.length > 0);
    assert.ok(s.lat > 40.4 && s.lat < 41 && s.lng > -74.3 && s.lng < -73.6, s.name);
    assert.ok(s.lines.length > 0, s.name);
    for (const l of [...s.lines, ...s.otherLines]) assert.ok(lines[l], `${s.name}: ${l} has no colour`);
    assert.equal(new Set([...s.lines, ...s.otherLines]).size, s.lines.length + s.otherLines.length, s.name);
  }
  const times = stations.find((s) => s.name === 'Times Sq-42 St')!;
  assert.deepEqual([...times.lines].sort(), ['1', '2', '3', '7', 'N', 'Q', 'R', 'S', 'W']);
});

test('photo hosts: bare lowercase hostnames, none twice, none a suffix of another', () => {
  const hosts = data('streeteasy-photo-hosts.json') as string[];
  assert.ok(Array.isArray(hosts) && hosts.length > 0);
  for (const h of hosts) {
    assert.match(h, /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/, h);
    assert.equal(new URL(`https://${h}`).hostname, h);
  }
  assert.equal(new Set(hosts).size, hosts.length);
  for (const a of hosts) for (const b of hosts) if (a !== b) assert.ok(!a.endsWith(`.${b}`), `${a} is under ${b}`);
});
