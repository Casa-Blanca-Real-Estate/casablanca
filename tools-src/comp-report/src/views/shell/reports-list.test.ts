import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Report } from '../../api.ts';
import { compsLabel, DEFAULT_SORT, listStats, matchesSearch, nextSort, pickUp, screenFor, sortReports, stageLabel, updatedLabel } from './reports-list.ts';

const base = { propertyType: 'condo', status: 'active', ownerEmail: 'a@casa-blanca.com', sampleData: false, createdAt: '2026-01-01T00:00:00Z' } as const;
const r = (title: string, extra: Partial<Report>): Report => ({ ...base, id: title, title, updatedAt: '2026-10-01T12:00:00Z', ...extra });

const reports = [
  r('100 Barclay Street #17L', { side: 'seller', stage: 'send', updatedAt: '2026-10-09T16:12:00Z' }),
  r('15 Hudson Yards #52C', { side: 'buyer', stage: 'sort', unsorted: 3, updatedAt: '2026-10-07T11:40:00Z' }),
  r('1 Wall St #2104', { side: 'seller', stage: 'sent', updatedAt: '2026-09-19T13:30:00Z' }),
  r('443 Greenwich St #5F', { side: 'seller', stage: 'findings', updatedAt: '2026-10-06T09:22:00Z' }),
];
const titles = (list: Report[]) => list.map((x) => x.title);

test('a header click sorts ascending, then descending, then clears; Stage · updated only flips', () => {
  assert.deepEqual(DEFAULT_SORT, { key: 'when', dir: -1 });
  assert.deepEqual(nextSort(DEFAULT_SORT, 'when'), { key: 'when', dir: 1 });
  assert.deepEqual(nextSort({ key: 'when', dir: 1 }, 'when'), { key: 'when', dir: -1 });
  assert.deepEqual(nextSort(DEFAULT_SORT, 'home'), { key: 'home', dir: 1 });
  assert.deepEqual(nextSort({ key: 'home', dir: 1 }, 'home'), { key: 'home', dir: -1 });
  assert.deepEqual(nextSort({ key: 'home', dir: -1 }, 'home'), DEFAULT_SORT);
  assert.deepEqual(nextSort({ key: 'home', dir: 1 }, 'range'), { key: 'range', dir: 1 });
});

test('the default order is newest first', () => {
  assert.deepEqual(titles(sortReports(reports, DEFAULT_SORT)), [
    '100 Barclay Street #17L', '15 Hudson Yards #52C', '443 Greenwich St #5F', '1 Wall St #2104',
  ]);
});

test('Home sorts A to Z by plain comparison, so a space sorts below a digit', () => {
  assert.deepEqual(titles(sortReports(reports, { key: 'home', dir: 1 })), [
    '1 Wall St #2104', '100 Barclay Street #17L', '15 Hudson Yards #52C', '443 Greenwich St #5F',
  ]);
});

test('Side ties keep the list order; Range sorts by its low end with the ones without a range last', () => {
  assert.deepEqual(titles(sortReports(reports, { key: 'side', dir: 1 })), [
    '15 Hudson Yards #52C', '100 Barclay Street #17L', '1 Wall St #2104', '443 Greenwich St #5F',
  ]);
  const ranged = [
    r('a', { rangeLow: 4_230_000, rangeHigh: 4_920_000 }), r('b', {}), r('c', { rangeLow: 1_000_000, rangeHigh: 1_200_000 }),
  ];
  assert.deepEqual(titles(sortReports(ranged, { key: 'range', dir: 1 })), ['c', 'a', 'b']);
  assert.deepEqual(titles(sortReports(ranged, { key: 'range', dir: -1 })), ['a', 'c', 'b']);
});

test('Comps sorts by count; the label counts the untiered', () => {
  const list = [r('a', { comps: 6, unsorted: 3 }), r('b', { comps: 1 }), r('c', { comps: 0 })];
  assert.deepEqual(titles(sortReports(list, { key: 'comps', dir: -1 })), ['a', 'b', 'c']);
  assert.deepEqual(list.map(compsLabel), ['6 comps · 3 untiered', '1 comp', 'No comps']);
});

test('search matches the address, the client and the agent, every word', () => {
  const x = r('100 Barclay Street #17L', { client: 'Jordan and Sam', ownerName: 'Noble Smith' });
  assert.ok(matchesSearch(x, 'barclay'));
  assert.ok(matchesSearch(x, 'jordan 17l'));
  assert.ok(matchesSearch(x, 'noble'));
  assert.ok(!matchesSearch(x, 'hudson'));
  assert.ok(matchesSearch(x, '  '));
});

test('the numbers row and pick up where you left off', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  const list = [
    r('sent', { stage: 'sent', sentAt: '2026-11-04T12:00:00Z', updatedAt: '2026-11-05T12:00:00Z' }),
    r('old-sent', { stage: 'sent', sentAt: '2026-10-04T12:00:00Z' }),
    r('open', { stage: 'findings', updatedAt: '2026-11-03T12:00:00Z' }),
    r('older', { stage: 'sort', updatedAt: '2026-11-01T12:00:00Z' }),
  ];
  assert.deepEqual(listStats(list, now), { reports: 4, open: 2, sentThisMonth: 1 });
  assert.equal(pickUp(list)?.title, 'open');
  assert.equal(pickUp([list[0]!]), null);
});

test('the stage label counts unsorted comps only while sorting', () => {
  assert.equal(stageLabel(reports[1]!), 'Sort · 3 unsorted');
  assert.equal(stageLabel(r('x', { stage: 'sort', unsorted: 0 })), 'Sort');
  assert.equal(stageLabel(reports[0]!), 'Send');
  assert.equal(stageLabel(reports[2]!), 'Sent');
});

test('a row opens on the screen its stage reached', () => {
  assert.deepEqual(reports.map(screenFor), ['send', undefined, 'done', 'findings']);
});

test('the date reads Oct 9, 4:12 PM with an ordinary space, and carries the year when it is not this one', () => {
  const now = new Date(2026, 9, 14);
  assert.equal(updatedLabel(new Date(2026, 9, 9, 16, 12).toISOString(), now), 'Oct 9, 4:12 PM');
  assert.equal(updatedLabel(new Date(2025, 11, 3, 9, 5).toISOString(), now), 'Dec 3, 2025');
  assert.equal(updatedLabel('not a date', now), '');
});
