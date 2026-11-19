import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LinkReadView } from '../../api.ts';
import { MAX_READS_AT_ONCE, mayRetry, startsDue } from './read-starts.ts';

const T0 = Date.parse('2026-11-05T12:00:00Z');
function read(id: string, status: LinkReadView['status'], extra: Partial<LinkReadView> = {}): LinkReadView {
  return {
    id, purpose: 'comp', url: `https://streeteasy.com/building/x/${id}`, status, error: null, errorMessage: null,
    reportCompId: null, asOf: null, extract: null, warnings: [], confirmedAt: null,
    createdAt: new Date(T0 - 1000 + Number(id.replace(/\D/g, '') || 0)).toISOString(), startedAt: null, finishedAt: null, ...extra,
  };
}

test('twelve links from a PDF: only a few start at once, oldest first', () => {
  const pending = Array.from({ length: 12 }, (_, i) => read(`r${i}`, 'queued'));
  const due = startsDue(pending, new Map(), T0);
  assert.equal(due.length, MAX_READS_AT_ONCE);
  assert.deepEqual(due.map((r) => r.id), pending.slice(0, MAX_READS_AT_ONCE).map((r) => r.id));
});

test('started but not yet claimed counts as reading; the next starts as one finishes', () => {
  const started = new Map<string, number>();
  const pending = Array.from({ length: 6 }, (_, i) => read(`r${i}`, 'queued'));
  for (const r of startsDue(pending, started, T0)) started.set(r.id, T0);
  assert.equal(startsDue(pending, started, T0 + 1000).length, 0);
  // r0 finished (it leaves the pending list), r1..r3 are running: one more starts.
  const next = [read('r1', 'running', { startedAt: new Date(T0).toISOString() }), read('r2', 'running', { startedAt: new Date(T0).toISOString() }),
    read('r3', 'running', { startedAt: new Date(T0).toISOString() }), ...pending.slice(4)];
  assert.deepEqual(startsDue(next, started, T0 + 30_000).map((r) => r.id), ['r4']);
});

test('a queued read whose start never arrived is started again after a while', () => {
  const pending = [read('r0', 'queued')];
  const started = new Map([['r0', T0]]);
  assert.equal(startsDue(pending, started, T0 + 5_000).length, 0);
  assert.deepEqual(startsDue(pending, started, T0 + 25_000).map((r) => r.id), ['r0']);
});

test('a read running far too long is started again, and doesn\'t hold a slot', () => {
  const old = new Date(T0 - 10 * 60_000).toISOString();
  const pending = [read('r0', 'running', { startedAt: old }), read('r1', 'queued')];
  assert.deepEqual(startsDue(pending, new Map(), T0).map((r) => r.id), ['r0', 'r1']);
});

test('Try again is offered for a busy or slow read, not for a wrong link', () => {
  assert.equal(mayRetry(read('r0', 'failed', { error: 'provider_error' })), true);
  assert.equal(mayRetry(read('r0', 'failed', { error: 'timeout' })), true);
  assert.equal(mayRetry(read('r0', 'failed', { error: 'not_found' })), false);
  assert.equal(mayRetry(read('r0', 'failed', { error: 'rental' })), false);
  assert.equal(mayRetry(read('r0', 'done', { error: 'provider_error' })), false);
});
