import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Report } from '../../api.ts';
import { DEFAULT_SORT, nextSort, screenFor, sortReports, stageLabel, updatedLabel } from './reports-list.ts';

const base = { propertyType: 'condo', status: 'active', ownerEmail: 'a@casa-blanca.com', sampleData: false, createdAt: '2026-01-01T00:00:00Z' } as const;
const r = (title: string, extra: Partial<Report>): Report => ({ ...base, id: title, title, updatedAt: '2026-10-01T12:00:00Z', ...extra });

const reports = [
  r('100 Barclay Street #17L', { side: 'seller', stage: 'send', updatedAt: '2026-10-09T16:12:00Z' }),
  r('15 Hudson Yards #52C', { side: 'buyer', stage: 'sort', unsorted: 3, updatedAt: '2026-10-07T11:40:00Z' }),
  r('1 Wall St #2104', { side: 'seller', stage: 'sent', updatedAt: '2026-09-19T13:30:00Z' }),
  r('443 Greenwich St #5F', { side: 'seller', stage: 'findings', updatedAt: '2026-10-06T09:22:00Z' }),
];
const titles = (list: Report[]) => list.map((x) => x.title);

test('a header click flips the same column and starts another ascending, except Updated (newest first)', () => {
  assert.deepEqual(DEFAULT_SORT, { key: 'updated', dir: -1 });
  assert.deepEqual(nextSort(DEFAULT_SORT, 'updated'), { key: 'updated', dir: 1 });
  assert.deepEqual(nextSort(DEFAULT_SORT, 'home'), { key: 'home', dir: 1 });
  assert.deepEqual(nextSort({ key: 'home', dir: 1 }, 'home'), { key: 'home', dir: -1 });
  assert.deepEqual(nextSort({ key: 'home', dir: 1 }, 'updated'), { key: 'updated', dir: -1 });
});

test('the default order is newest first', () => {
  assert.deepEqual(titles(sortReports(reports, DEFAULT_SORT)), [
    '100 Barclay Street #17L', '15 Hudson Yards #52C', '443 Greenwich St #5F', '1 Wall St #2104',
  ]);
});

test('Home sorts by plain comparison, so a space sorts below a digit', () => {
  assert.deepEqual(titles(sortReports(reports, { key: 'home', dir: 1 })), [
    '1 Wall St #2104', '100 Barclay Street #17L', '15 Hudson Yards #52C', '443 Greenwich St #5F',
  ]);
});

test('Stage sorts Sort, Findings, Send, Sent; Side ties keep the list order', () => {
  assert.deepEqual(titles(sortReports(reports, { key: 'stage', dir: 1 })), [
    '15 Hudson Yards #52C', '443 Greenwich St #5F', '100 Barclay Street #17L', '1 Wall St #2104',
  ]);
  assert.deepEqual(titles(sortReports(reports, { key: 'side', dir: 1 })), [
    '15 Hudson Yards #52C', '100 Barclay Street #17L', '1 Wall St #2104', '443 Greenwich St #5F',
  ]);
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
