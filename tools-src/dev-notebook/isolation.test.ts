// The dev notebook's structural rules (docs/dev-notebook/README.md), as tests:
// a comment can be ignored, a failing build can't. These read source as text.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BASE, ROUTES } from './server/api.ts';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string) => readFileSync(join(REPO, path), 'utf8');

function sources(dir: string, exts = /\.(m?[jt]sx?|mts|html)$/): string[] {
  return readdirSync(join(REPO, dir)).flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.')) return [];
    const path = join(dir, name);
    if (statSync(join(REPO, path)).isDirectory()) return sources(path, exts);
    return exts.test(name) && !/\.test\.[cm]?[jt]s$/.test(name) ? [path] : [];
  });
}

test('sessions cannot delete: the CLI has no delete verb and never sends DELETE', () => {
  const cli = read('tools-src/dev-notebook/cli.ts');
  assert.equal(/['"]DELETE['"]/.test(cli), false, 'the CLI must never send DELETE');
  assert.equal(/--delete|\bdelete\s*:/.test(cli), false, 'the CLI must not take a delete option');
  // …while the notebook page keeps the only delete, and a key can't reach it.
  const del = ROUTES.find((r) => r.method === 'DELETE' && r.path.test('/notes/dn_000000000000'))!;
  assert.deepEqual(del.who, ['session']);
  assert.ok(read('tools/dev-notebook/index.html').includes("api('DELETE', '/notes/'"));
});

test('every route is under the gated prefix, and the function serves nothing else', () => {
  assert.equal(BASE, '/api/dev/notebook');
  const entry = read('netlify/functions/dev-notebook.mts');
  const paths = [...entry.matchAll(/'(\/[^']*)'/g)].map((m) => m[1]!).filter((p) => p.startsWith('/'));
  assert.deepEqual(paths, ['/api/dev/notebook', '/api/dev/notebook/*']);
  for (const r of ROUTES) assert.ok(r.who === 'identity' || r.who.length > 0, `${r.method} ${r.path} says who may call it`);
  // Only sign-in itself runs without a notebook token, and only with an Identity one.
  assert.deepEqual(ROUTES.filter((r) => r.who === 'identity').map((r) => `${r.method} ${r.path.source}`), ['POST ^\\/session$']);
});

test('only the store touches the notebook’s blobs, and only the notebook uses the store', () => {
  const everything = [...sources('tools-src'), ...sources('netlify'), ...sources('assets'), ...sources('tools'), 'index.html'];
  const namesStore = everything.filter((f) => /getStore\(\s*\{?[^)]*['"]dev-notebook['"]/.test(read(f)) || /STORE_NAME/.test(read(f)));
  assert.deepEqual(namesStore.map((f) => relative('', f)).sort(), [
    'tools-src/dev-notebook/dev/serve.ts', 'tools-src/dev-notebook/server/deps.ts', 'tools-src/dev-notebook/server/store.ts',
  ]);
  const importsStore = everything.filter((f) => /dev-notebook\/server\//.test(read(f)) || /from '\.\.?\/server\/store\.ts'/.test(read(f)));
  for (const f of importsStore) {
    assert.ok(f.startsWith('tools-src/dev-notebook/') || f === 'netlify/functions/dev-notebook.mts', `${f} reaches into the notebook`);
  }
});

test('the deployed function never reaches the stub sign-in or the local server', () => {
  for (const f of ['netlify/functions/dev-notebook.mts', 'tools-src/dev-notebook/server/api.ts', 'tools-src/dev-notebook/server/deps.ts', 'tools-src/dev-notebook/server/store.ts']) {
    assert.equal(/\/dev\/|devIdentity|stub-identity/.test(read(f).replace(/\/api\/dev\//g, '')), false, `${f} imports dev-only code`);
  }
});

test('notes are never app data: nothing in the comp report reads them', () => {
  for (const f of [...sources('tools-src/comp-report/server'), ...sources('tools-src/comp-report/workspace'), ...sources('tools-src/comp-report/engine')]) {
    const text = read(f);
    assert.equal(/dev-notebook|\/api\/dev\/|__cbCaptureContext/.test(text), false, `${f} mentions the notebook`);
  }
  // The comp report's one link is outbound: it publishes what's on screen, and reads nothing back.
  const publishers = sources('tools-src/comp-report/src').filter((f) => read(f).includes('__cbCaptureContext'));
  assert.deepEqual(publishers, ['tools-src/comp-report/src/capture-context.ts']);
});

test('the capture box loads only in a browser signed in to the notebook', () => {
  for (const f of ['assets/studio-header.js', 'index.html']) {
    const text = read(f);
    assert.ok(/localStorage\.getItem\('cb\.devNotebook'\)/.test(text), `${f} checks for a notebook session`);
    assert.ok(/Date\.parse\(dn\.expiresAt\) > Date\.now\(\)|Date\.parse\(dn\.expiresAt\)>Date\.now\(\)/.test(text), `${f} checks it hasn't expired`);
  }
  assert.ok(/if \(!session\(\)\) return;/.test(read('assets/dev-notebook.js')), 'the box itself bows out without a session');
});
