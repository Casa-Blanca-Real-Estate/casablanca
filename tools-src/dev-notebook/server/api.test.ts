// The dev notebook's API end to end: the real Blobs client against Blobs' own
// local server, and a stub Identity. Checks the gate on every route, who may
// sign in, what a Claude Code session's key can and can't do, the
// resolve-needs-a-PR rule, the append-only history, and screenshots.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import type { IdentityUser } from '../../comp-report/server/identity.ts';
import { BASE, handleNotebook, ROUTES, type NotebookDeps } from './api.ts';
import { notebookStore, SESSION_DAYS, type BlobStore } from './store.ts';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(64)]);

const IDENTITIES: Record<string, IdentityUser> = {
  'identity-kimani-gmail': { id: '1', email: 'casacalliste@gmail.com', confirmed: true, provider: 'google', name: 'Kimani' },
  'identity-kimani-work0': { id: '2', email: 'creative@email.casa-blanca.com', confirmed: true, provider: 'google', name: 'Kimani' },
  'identity-agent-00000': { id: '3', email: 'ana@casa-blanca.com', confirmed: true, provider: 'google', name: 'Ana' },
  'identity-unconfirmed0': { id: '4', email: 'casacalliste@gmail.com', confirmed: false, provider: 'google', name: null },
  'identity-password0000': { id: '5', email: 'creative@email.casa-blanca.com', confirmed: true, provider: 'email', name: null },
};

describe('the dev notebook API', () => {
  let server: BlobsServer;
  let dir: string;
  let deps: NotebookDeps;
  let now = Date.parse('2026-09-30T12:00:00Z');
  let autoconfirm = false;
  let session = '';
  let key = '';

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'dev-notebook-blobs-'));
    server = new BlobsServer({ directory: dir, token: 'local' });
    const { port } = await server.start();
    const blobs = getStore({ name: 'dev-notebook', edgeURL: `http://localhost:${port}`, token: 'local', siteID: 'local-site' });
    deps = {
      store: notebookStore(blobs as unknown as BlobStore, { now: () => now, random: (n) => randomBytes(n) }),
      verifier: {
        verify: async (t) => IDENTITIES[t] ?? null,
        emailConfirmationRequired: async () => !autoconfirm,
      },
      env: {},
      commit: async () => 'abc1234def56',
      deployId: 'deploy-1',
      now: () => now,
    };
  });
  after(async () => {
    await server?.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  const call = async (method: string, path: string, token?: string, body?: unknown, raw?: Uint8Array) => {
    const res = await handleNotebook(new Request(`https://studio.test${BASE}${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'user-agent': 'test-agent' },
      body: raw ? (new Uint8Array(raw).buffer as ArrayBuffer) : body === undefined ? undefined : JSON.stringify(body),
    }), deps);
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, body: type.startsWith('application/json') ? await res.json() : new Uint8Array(await res.arrayBuffer()), type };
  };

  test('every route is gated: nothing answers without a notebook token (sign-in needs an Identity one)', async () => {
    for (const r of ROUTES) {
      const path = r.path.source.replace(/^\^\\?/, '').replace(/\$$/, '').replace(/\\\//g, '/')
        .replace('(dn_[0-9a-z]{12})', 'dn_000000000000').replace('(sh_[0-9a-z]{10})', 'sh_0000000000').replace('([0-9a-z]{12})', '000000000000');
      const res = await call(r.method, path);
      assert.equal(res.status, 401, `${r.method} ${path} answered ${res.status} without a token`);
      assert.ok(r.who === 'identity' || r.who.length > 0, `${r.method} ${path} names who may call it`);
    }
    // A notebook route under the prefix that isn't in the table is simply not there.
    assert.equal((await call('GET', '/everything')).status, 404);
  });

  test('only the dev emails sign in, with Google-proven addresses', async () => {
    assert.equal((await call('POST', '/session', 'identity-agent-00000')).body.error, 'not_a_dev');
    assert.equal((await call('POST', '/session', 'identity-unconfirmed0')).body.error, 'unconfirmed');
    assert.equal((await call('POST', '/session', 'not-a-token-at-all-000')).status, 401);
    autoconfirm = true; // Identity lets password sign-ups skip confirming: their address proves nothing
    assert.equal((await call('POST', '/session', 'identity-password0000')).body.error, 'unconfirmed_signups');
    autoconfirm = false;
    assert.equal((await call('POST', '/session', 'identity-password0000')).status, 201, 'a confirmed password account is fine when confirmation is required');

    const work = await call('POST', '/session', 'identity-kimani-work0');
    assert.equal(work.status, 201);
    assert.equal(work.body.email, 'creative@email.casa-blanca.com');
    const gmail = await call('POST', '/session', 'identity-kimani-gmail');
    assert.equal(gmail.status, 201);
    session = gmail.body.token;
    assert.match(session, /^dns_[0-9a-z]{12}\.[A-Za-z0-9_-]{43}$/);
    assert.deepEqual((await call('GET', '/me', session)).body, { kind: 'session', email: 'casacalliste@gmail.com' });
    // A tampered secret is refused.
    assert.equal((await call('GET', '/me', session.slice(0, -1) + (session.endsWith('A') ? 'B' : 'A'))).status, 401);
  });

  test('a note is captured with its context, stamped by the server, and allowlisted', async () => {
    const res = await call('POST', '/notes', session, {
      body: '  The reveal step jumps when the call is saved.  ',
      tags: ['bug', 'nonsense', 'uiux', 'bug'],
      route: '/tools/comp-report/?report=abc#frag',
      params: { report: '9b0e', step: 'reveal', q: 'what the agent typed', email: 'x@y.z' },
      title: 'Comp Report',
      context: { report: { id: '9b0e', name: '100 Barclay Street, #17L', sample: true } },
      viewport: '0x0',
      commit: 'client-says-this',
    });
    assert.equal(res.status, 201);
    const n = res.body.note;
    assert.match(n.id, /^dn_[0-9a-z]{12}$/);
    assert.equal(n.body, 'The reveal step jumps when the call is saved.');
    assert.deepEqual(n.tags, ['bug', 'uiux']);
    assert.equal(n.route, '/tools/comp-report/');
    assert.deepEqual(n.params, { report: '9b0e', step: 'reveal' }, 'only coordinates, never what someone typed');
    assert.equal(n.surface, 'comp-report/reveal');
    assert.equal(n.viewport, null, 'unknown is null, never "0x0"');
    assert.equal(n.commit, 'abc1234def56', 'the server stamps the commit');
    assert.equal(n.deployId, 'deploy-1');
    assert.equal(n.author, 'casacalliste@gmail.com');
    assert.equal(n.userAgent, 'test-agent');
    assert.deepEqual(n.context.report, { id: '9b0e', name: '100 Barclay Street, #17L', sample: true });
    assert.equal(n.status, 'open');
    assert.deepEqual(n.log.map((e: { status: string; note: string }) => [e.status, e.note]), [['open', 'captured']]);

    assert.equal((await call('POST', '/notes', session, { body: '   ' })).body.error, 'no_body');
    assert.equal((await call('POST', '/notes', session, { body: 'x'.repeat(8001) })).status, 413);
    const big = await call('POST', '/notes', session, { body: 'Big context', context: { blob: 'x'.repeat(5000) } });
    assert.deepEqual(big.body.note.context, { dropped: 'context was over 4 KB' });
  });

  test('a Claude Code key reads, re-statuses and comments — and can do nothing else', async () => {
    const made = await call('POST', '/keys', session, { label: 'Claude Code' });
    assert.equal(made.status, 201);
    key = made.body.token;
    assert.match(key, /^dnk_[0-9a-z]{12}\.[A-Za-z0-9_-]{43}$/);
    assert.deepEqual((await call('GET', '/keys', session)).body.keys.map((k: { label: string }) => k.label), ['Claude Code']);
    assert.equal((await call('GET', '/keys', session)).body.keys[0].hash, undefined, 'hashes never leave the store');

    const list = await call('GET', '/notes', key);
    assert.equal(list.status, 200);
    assert.match(list.body.summary, /^\d+ open dev notes?/);
    const id = list.body.notes[0].id;

    const read = await call('PATCH', `/notes/${id}`, key, { status: 'read', by: 'Mason' });
    assert.equal(read.status, 200);
    const last = read.body.note.log.at(-1);
    assert.deepEqual(last, { at: last.at, by: 'Mason', via: 'key:Claude Code', status: 'read' });
    assert.ok(last.at > read.body.note.log[0].at, 'a later change sorts later, even within the same millisecond');
    const comment = await call('PATCH', `/notes/${id}`, key, { note: 'Reproduced: the call form re-renders the columns.', by: 'Mason' });
    assert.equal(comment.body.note.status, 'read', 'a comment leaves the status alone');

    assert.equal((await call('POST', '/notes', key, { body: 'from a session' })).body.error, 'not_with_a_key');
    assert.equal((await call('DELETE', `/notes/${id}`, key)).body.error, 'not_with_a_key');
    assert.equal((await call('POST', '/keys', key, { label: 'another' })).body.error, 'not_with_a_key');
    assert.equal((await call('GET', '/keys', key)).body.error, 'not_with_a_key');
    assert.equal((await call('POST', `/notes/${id}/shots`, key, undefined, PNG)).body.error, 'not_with_a_key');
  });

  test('resolved needs its PR; closing any other way needs a why', async () => {
    const { id } = (await call('GET', '/notes?status=all', key)).body.notes[0];
    assert.equal((await call('PATCH', `/notes/${id}`, key, { status: 'resolved' })).body.error, 'pr_required');
    assert.equal((await call('PATCH', `/notes/${id}`, key, { status: 'wontfix' })).body.error, 'note_required');
    assert.equal((await call('PATCH', `/notes/${id}`, key, { status: 'read', pr: 5 })).body.error, 'pr_without_resolved');
    assert.equal((await call('PATCH', `/notes/${id}`, key, { status: 'resolved', pr: 'fifty' })).body.error, 'bad_pr');
    assert.equal((await call('PATCH', `/notes/${id}`, key, { status: 'done' })).body.error, 'bad_status');
    assert.equal((await call('PATCH', `/notes/${id}`, key, {})).body.error, 'nothing_to_record');
    const fixed = await call('PATCH', `/notes/${id}`, key, { status: 'resolved', pr: 57, note: 'Stable column heights.', by: 'Mason' });
    assert.equal(fixed.status, 200);
    assert.deepEqual([fixed.body.note.status, fixed.body.note.resolvedPr], ['resolved', 57]);
    // The whole history is still there, in order.
    assert.deepEqual(fixed.body.note.log.map((e: { status?: string }) => e.status ?? 'comment'), ['open', 'read', 'comment', 'resolved']);
    // Reopened, the PR goes with the old resolution, not the new status.
    now += 1000;
    const reopened = await call('PATCH', `/notes/${id}`, session, { status: 'open', note: 'Still jumps on Safari.' });
    assert.deepEqual([reopened.body.note.status, reopened.body.note.resolvedPr, reopened.body.note.log.length], ['open', null, 5]);
    assert.equal(reopened.body.note.log.at(-1).by, 'casacalliste@gmail.com');
  });

  test('two writers at once both land: the history has no read-modify-write to lose', async () => {
    const { note } = (await call('POST', '/notes', session, { body: 'Concurrent', tags: ['perf'] })).body;
    await Promise.all(['one', 'two', 'three', 'four'].map((n) => call('PATCH', `/notes/${note.id}`, key, { note: n, by: `s-${n}` })));
    const log = (await call('GET', `/notes/${note.id}`, key)).body.note.log as { note: string }[];
    assert.deepEqual(log.map((e) => e.note).slice(1).sort(), ['four', 'one', 'three', 'two']);
  });

  test('lists filter by status, tag and surface, newest first, and always count the open ones', async () => {
    now += 1000;
    await call('POST', '/notes', session, { body: 'Dashboard copy', tags: ['copy'], route: '/' });
    const all = (await call('GET', '/notes?status=all', key)).body;
    assert.ok(all.notes.length >= 4);
    const created = all.notes.map((n: { createdAt: string }) => n.createdAt);
    assert.deepEqual(created, [...created].sort().reverse(), 'newest first');
    assert.deepEqual((await call('GET', '/notes?tag=copy', key)).body.notes.map((n: { body: string }) => n.body), ['Dashboard copy']);
    assert.deepEqual((await call('GET', '/notes?surface=dashboard', key)).body.notes.map((n: { surface: string }) => n.surface), ['dashboard']);
    assert.ok((await call('GET', '/notes?surface=comp-report', key)).body.notes.every((n: { surface: string }) => n.surface.startsWith('comp-report')));
    assert.equal((await call('GET', '/notes?status=all&limit=1', key)).body.notes.length, 1);
    const resolvedOnly = (await call('GET', '/notes?status=resolved', key)).body;
    assert.match(resolvedOnly.summary, /open dev note/, 'the summary counts open notes whatever the filter');
    assert.equal((await call('GET', '/notes?status=nope', key)).body.error, 'bad_status');
  });

  test('screenshots: images only, eight at most, readable by a key, deleted first with the note', async () => {
    const { note } = (await call('POST', '/notes', session, { body: 'With pictures' })).body;
    const up = await call('POST', `/notes/${note.id}/shots`, session, undefined, PNG);
    assert.equal(up.status, 201);
    assert.equal(up.body.shot.type, 'image/png');
    assert.equal((await call('POST', `/notes/${note.id}/shots`, session, undefined, Buffer.from('<svg onload=alert(1)>'))).body.error, 'not_an_image');
    for (let i = 1; i < 8; i++) assert.equal((await call('POST', `/notes/${note.id}/shots`, session, undefined, PNG)).status, 201);
    assert.equal((await call('POST', `/notes/${note.id}/shots`, session, undefined, PNG)).body.error, 'too_many');

    const got = await call('GET', `/notes/${note.id}/shots/${up.body.shot.id}`, key);
    assert.equal(got.type, 'image/png');
    assert.deepEqual(Buffer.from(got.body as Uint8Array), PNG);
    assert.equal((await call('GET', `/notes/${note.id}`, key)).body.note.shots.length, 8);

    assert.equal((await call('DELETE', `/notes/${note.id}`, session)).status, 200);
    assert.equal((await call('GET', `/notes/${note.id}/shots/${up.body.shot.id}`, session)).status, 404, 'no screenshot is left behind');
    assert.equal((await call('GET', `/notes/${note.id}`, session)).status, 404);
  });

  test('making a key needs a sign-in from the last 15 minutes', async () => {
    const fresh = (await call('POST', '/session', 'identity-kimani-work0')).body.token;
    now += 16 * 60_000;
    const stale = await call('POST', '/keys', fresh, { label: 'Late' });
    assert.deepEqual([stale.status, stale.body.error], [403, 'sign_in_again']);
    assert.equal((await call('GET', '/keys', fresh)).status, 200, 'listing and revoking keys need no fresh sign-in');
    const again = (await call('POST', '/session', 'identity-kimani-work0')).body.token;
    const made = await call('POST', '/keys', again, { label: 'Fresh' });
    assert.equal(made.status, 201);
    assert.equal((await call('DELETE', `/keys/${made.body.key.id}`, fresh)).status, 200);
  });

  test('sessions end — one, all, or after 30 days — and revoked keys stop working', async () => {
    const other = (await call('POST', '/session', 'identity-kimani-work0')).body.token;
    assert.equal((await call('DELETE', '/session', other)).status, 200);
    assert.equal((await call('GET', '/me', other)).status, 401);

    now += (SESSION_DAYS + 1) * 86_400_000;
    assert.equal((await call('GET', '/me', session)).status, 401, 'expired');
    session = (await call('POST', '/session', 'identity-kimani-gmail')).body.token;
    assert.equal((await call('GET', '/me', session)).status, 200);

    const { keys } = (await call('GET', '/keys', session)).body;
    assert.equal((await call('DELETE', `/keys/${keys[0].id}`, session)).status, 200);
    assert.equal((await call('GET', '/notes', key)).status, 401, 'a revoked key is refused');

    assert.ok((await call('DELETE', '/sessions', session)).body.signedOut >= 1);
    assert.equal((await call('GET', '/me', session)).status, 401, 'signed out everywhere');
  });
});
