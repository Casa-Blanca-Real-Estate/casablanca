// The vocabulary's rules, and the browser widget's copy of it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CLOSED, describeOpen, devEmails, normalizeTags, PARAMS, pickParams, routeOrNull, statusRequirement, STATUSES, surfaceFor, TAGS,
  viewportOrNull,
} from './vocab.ts';

test('tags: known ones only, deduplicated, in the vocabulary order', () => {
  assert.deepEqual(normalizeTags(['perf', 'nope', 'bug', 'bug', 42, null]), ['bug', 'perf']);
  assert.deepEqual(normalizeTags('bug'), []);
  assert.deepEqual(normalizeTags(undefined), []);
});

test('params: the allowlist only, clipped — never what someone typed', () => {
  assert.deepEqual(pickParams({ report: 'r1', step: 'sort', q: 'search text', email: 'a@b.c', token: 'x' }), { report: 'r1', step: 'sort' });
  assert.equal(pickParams({ id: 'x'.repeat(500) }).id!.length, 200);
  assert.deepEqual(pickParams({ tab: '   ' }), {});
  assert.deepEqual(pickParams(['report']), {});
});

test('unknown is null: no 0x0 viewport, no route with a query string', () => {
  for (const v of ['0x0', '0x900', 'x', '1512', '', null, 1512, '1512x945x2']) assert.equal(viewportOrNull(v), null, String(v));
  assert.equal(viewportOrNull('1512x945'), '1512x945');
  assert.equal(routeOrNull('/tools/comp-report/?report=1#x'), '/tools/comp-report/');
  assert.equal(routeOrNull('https://evil.example/'), null);
  assert.equal(routeOrNull(undefined), null);
});

test('surfaces: most specific first, derived from the route and step', () => {
  assert.equal(surfaceFor('/tools/comp-report/', { step: 'reveal', report: 'r' }), 'comp-report/reveal');
  assert.equal(surfaceFor('/tools/comp-report/', { report: 'r' }), 'comp-report/report');
  assert.equal(surfaceFor('/tools/comp-report/'), 'comp-report');
  assert.equal(surfaceFor('/tools/dev-notebook/'), 'dev-notebook');
  assert.equal(surfaceFor('/tools/closed-carousel/index.html'), 'tool/closed-carousel');
  assert.equal(surfaceFor('/'), 'dashboard');
  assert.equal(surfaceFor('/index.html'), 'dashboard');
  assert.equal(surfaceFor('/agents/ana-garcia/'), 'agent-site');
  assert.equal(surfaceFor('/somewhere'), 'other');
  assert.equal(surfaceFor(null), 'unknown');
});

test('statuses: resolved needs a PR; closing any other way needs a note', () => {
  assert.equal(statusRequirement('resolved'), 'pr');
  for (const s of ['answered', 'deferred', 'wontfix', 'duplicate'] as const) assert.equal(statusRequirement(s), 'note');
  for (const s of ['open', 'read'] as const) assert.equal(statusRequirement(s), null);
  assert.ok(CLOSED.every((s) => STATUSES.includes(s)));
});

test("the CLI's first line", () => {
  assert.equal(describeOpen([]), 'No open dev notes.');
  assert.equal(describeOpen([{ tags: ['bug'] }]), '1 open dev note, 1 tagged bug.');
  assert.equal(describeOpen([{ tags: ['bug', 'perf'] }, { tags: ['bug'] }, { tags: [] }]), '3 open dev notes, 2 tagged bug, 1 tagged perf.');
});

test('the dev emails: Kimani’s two by default, or DEV_NOTEBOOK_EMAILS', () => {
  assert.deepEqual(devEmails({}), ['casacalliste@gmail.com', 'creative@email.casa-blanca.com']);
  assert.deepEqual(devEmails({ DEV_NOTEBOOK_EMAILS: ' A@x.com, b@y.com ,' }), ['a@x.com', 'b@y.com']);
});

test('the browser widget carries the same tags and params (assets/dev-notebook.js)', () => {
  const widget = readFileSync(new URL('../../assets/dev-notebook.js', import.meta.url), 'utf8');
  const tags = JSON.parse(/var TAGS = (\[.*?\]);/.exec(widget)![1]!);
  const params = JSON.parse(/var PARAMS = (\[.*?\]);/.exec(widget)![1]!);
  assert.deepEqual(tags, TAGS.map(({ id, label }) => ({ id, label })));
  assert.deepEqual(params, [...PARAMS]);
});
