import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Report } from '../../api.ts';
import { compsLabel, DEFAULT_SORT, followUpDue, followUpIsDue, followUpLine, listStats, matchesSearch, nextSort, pickUp, screenFor, sortReports, stageLabel, updatedLabel } from './reports-list.ts';

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

test('Home sorts as people read numbers: 1, 15, 100, 443 (the audit, 2026-11-06), case aside', () => {
  assert.deepEqual(titles(sortReports(reports, { key: 'home', dir: 1 })), [
    '1 Wall St #2104', '15 Hudson Yards #52C', '100 Barclay Street #17L', '443 Greenwich St #5F',
  ]);
  assert.deepEqual(titles(sortReports([r('b street', {}), r('A Street', {})], { key: 'home', dir: 1 })), ['A Street', 'b street']);
});

test('Stage · updated sorts by the date it shows: a sent one by when it was sent, others by when they were last worked on', () => {
  const list = [
    // Sent Nov 1, its outcome typed in on Nov 5: it shows "Sent · Nov 1", so it sorts there.
    r('sent', { stage: 'sent', sentAt: '2026-11-01T12:00:00Z', updatedAt: '2026-11-05T12:00:00Z' }),
    // Its comps were tiered on Nov 4; the report row itself last changed Oct 30.
    r('sorting', { stage: 'sort', updatedAt: '2026-10-30T12:00:00Z', workedAt: '2026-11-04T12:00:00Z' }),
    r('older', { stage: 'findings', updatedAt: '2026-11-02T12:00:00Z' }),
  ];
  assert.deepEqual(titles(sortReports(list, DEFAULT_SORT)), ['sorting', 'older', 'sent']);
  assert.deepEqual(titles(sortReports(list, { key: 'when', dir: 1 })), ['sent', 'older', 'sorting']);
});

test('Range ties on the low end go by the high end', () => {
  const list = [r('wide', { rangeLow: 1_000_000, rangeHigh: 1_500_000 }), r('narrow', { rangeLow: 1_000_000, rangeHigh: 1_100_000 })];
  assert.deepEqual(titles(sortReports(list, { key: 'range', dir: 1 })), ['narrow', 'wide']);
  assert.deepEqual(titles(sortReports(list, { key: 'range', dir: -1 })), ['wide', 'narrow']);
});

test('Hubert’s follow-up: due two days after sending, until ticked or a month has gone', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  const sent = (sentAt: string, extra: Partial<Report> = {}) => r(sentAt, { stage: 'sent', sentAt, client: 'Jordan and Sam', ...extra });
  assert.equal(followUpIsDue(sent('2026-11-05T12:00:00Z'), now), false);
  assert.equal(followUpIsDue(sent('2026-11-04T12:00:00Z'), now), true);
  assert.equal(followUpIsDue(sent('2026-11-03T12:00:00Z', { doneChecks: ['follow-up'] }), now), false);
  assert.equal(followUpIsDue(sent('2026-11-03T12:00:00Z', { doneChecks: ['plan-offer'] }), now), true);
  assert.equal(followUpIsDue(sent('2026-09-01T12:00:00Z'), now), false);
  assert.equal(followUpIsDue(r('open', { stage: 'send' }), now), false);
  const list = [sent('2026-11-03T12:00:00Z'), sent('2026-11-01T12:00:00Z'), sent('2026-11-05T12:00:00Z')];
  assert.equal(followUpDue(list, now)?.sentAt, '2026-11-01T12:00:00Z');
  assert.equal(followUpLine(list[1]!, now), 'Sent to Jordan and Sam on Nov 1. Heard back? Tick it on Done.');
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
