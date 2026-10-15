import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, monthYear, needText, nextSort, passes, shortName, shortPrice, sortRows, tagCounts, type Sortable, type SortState } from './table.ts';

test('prices and dates read as the handoff writes them', () => {
  assert.equal(shortPrice(4_450_000), '$4.45M');
  assert.equal(shortPrice(4_600_000), '$4.60M');
  assert.equal(shortPrice(850_000), '$850K');
  assert.equal(shortPrice(null), '—');
  assert.equal(shortPrice(0), '—');
  assert.equal(monthYear('2026-08-14'), 'Aug 2026');
  assert.equal(monthYear(null), '—');
  assert.equal(monthYear('2026-13-01'), '—');
});

test('a row says what it needs; a comp read from its page is confirmed or removed first', () => {
  assert.equal(needText(['tier', 'note', 'tag']), 'Needs tier, note, tag');
  assert.equal(needText(['note']), 'Needs note');
  assert.equal(needText(['confirm']), 'Confirm or remove');
  assert.equal(needText([]), '');
});

test('a comp named in a sentence drops its unit and street suffix', () => {
  const named = (street: string | null) => shortName({ identity: { address: { street } } } as never);
  assert.equal(named('200 Chambers St'), '200 Chambers');
  assert.equal(named('5 Franklin Place'), '5 Franklin');
  assert.equal(named('25 North Moore Street'), '25 North Moore');
  assert.equal(named(null), 'this comp');
});

test('a header click cycles ascending, descending, off', () => {
  let s: SortState = { key: null, dir: 1 };
  s = nextSort(s, 'price');
  assert.deepEqual(s, { key: 'price', dir: 1 });
  s = nextSort(s, 'price');
  assert.deepEqual(s, { key: 'price', dir: -1 });
  s = nextSort(s, 'price');
  assert.deepEqual(s, { key: null, dir: 1 });
  assert.deepEqual(nextSort({ key: 'price', dir: -1 }, 'date'), { key: 'date', dir: 1 });
});

test('a missing value sorts last either way; ties keep the list order; unsorted tiers rank first', () => {
  const row = (id: string, price: number | null, tier: Sortable['tier'] = null, date: string | null = null) => ({ id, price, ppsf: null, size: null, date, tier });
  const rows = [row('a', 3), row('b', null), row('c', 1), row('d', 3)];
  assert.deepEqual(sortRows(rows, { key: 'price', dir: 1 }).map((r) => r.id), ['c', 'a', 'd', 'b']);
  assert.deepEqual(sortRows(rows, { key: 'price', dir: -1 }).map((r) => r.id), ['a', 'd', 'c', 'b']);
  assert.equal(sortRows(rows, { key: null, dir: 1 }), rows);
  const tiers = [row('x', 1, 'excluded'), row('y', 1, null), row('z', 1, 'primary')];
  assert.deepEqual(sortRows(tiers, { key: 'tier', dir: 1 }).map((r) => r.id), ['y', 'z', 'x']);
  const dates = [row('p', 1, null, '2026-08-01'), row('q', 1, null, null), row('r', 1, null, '2026-06-01')];
  assert.deepEqual(sortRows(dates, { key: 'date', dir: 1 }).map((r) => r.id), ['r', 'p', 'q']);
});

test('the filter: what is left to finish, or a tag', () => {
  const done = { needs: [], tags: ['Same area'] };
  const open = { needs: ['tier' as const], tags: [] };
  assert.equal(passes(done, { incomplete: true, tags: [] }), false);
  assert.equal(passes(open, { incomplete: true, tags: [] }), true);
  assert.equal(passes(done, { incomplete: false, tags: ['Same area'] }), true);
  assert.equal(passes(open, { incomplete: false, tags: ['Same area'] }), false);
  assert.deepEqual(tagCounts([{ tags: ['A', 'B'] }, { tags: ['B'] }]), [{ tag: 'A', n: 1 }, { tag: 'B', n: 2 }]);
});

test('median', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});
