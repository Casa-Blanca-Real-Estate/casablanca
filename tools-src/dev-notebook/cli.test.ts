// The CLI a Claude Code session uses, against the local server over real HTTP:
// the opening line, one note in full, re-status and comments, the
// resolve-needs-a-PR rule as an exit code, screenshots to disk — and the key
// never printed.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { main } from './cli.ts';
import { startNotebookServer } from './dev/serve.ts';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 7)]);
const kimani = `dev.${Buffer.from('casacalliste@gmail.com').toString('base64url')}`;

describe('the dev notebook CLI', () => {
  let server: Awaited<ReturnType<typeof startNotebookServer>>;
  let env: Record<string, string>;
  let noteId = '';
  const out: string[] = [];
  const run = (...args: string[]) => {
    out.length = 0;
    return main(args, env, (s) => out.push(s));
  };

  before(async () => {
    server = await startNotebookServer();
    const post = async (path: string, token: string, body: unknown, raw?: Buffer) => {
      const res = await fetch(`${server.url}/api/dev/notebook${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: raw ? new Uint8Array(raw) : JSON.stringify(body),
      });
      return res.json() as Promise<Record<string, any>>;
    };
    const session = (await post('/session', kimani, {})).token as string;
    await post('/notes', session, { body: 'The dashboard hero wraps badly at 1024.', tags: ['uiux'], route: '/', viewport: '1024x768' });
    const { note } = await post('/notes', session, {
      body: 'Sort step: the Record button stays grey after picking a tier.\nSecond line of detail.',
      tags: ['bug'], route: '/tools/comp-report/', params: { report: '9b0e', step: 'sort' },
      context: { report: { id: '9b0e', name: '100 Barclay Street, #17L' } }, viewport: '1512x945', title: 'Comp Report',
    });
    noteId = note.id;
    await post(`/notes/${noteId}/shots`, session, undefined, PNG);
    const key = (await post('/keys', session, { label: 'Claude Code' })).token as string;
    env = { DEV_NOTEBOOK_KEY: key, DEV_NOTEBOOK_URL: server.url };
  });
  after(async () => {
    await server?.close();
  });

  test('the first line counts the open notes; then one line each, newest first', async () => {
    assert.equal(await run(), 0);
    assert.equal(out[0], '2 open dev notes, 1 tagged bug, 1 tagged uiux.');
    assert.match(out[1]!, new RegExp(`^${noteId}  \\d{4}-\\d{2}-\\d{2}  \\[bug\\]  comp-report/sort  /tools/comp-report/  "Sort step: the Record button stays grey after picking a tier\\. Second line of detail\\."$`));
    assert.match(out[2]!, /\[uiux\]  dashboard  \/  "The dashboard hero wraps badly at 1024\."$/);
    await run('--tag=uiux');
    assert.equal(out.length, 2);
  });

  test('--id prints everything about one note', async () => {
    await run(`--id=${noteId}`);
    const text = out.join('\n');
    for (const want of [
      `${noteId}  open since`, 'Tags:        bug', 'Where:       /tools/comp-report/  (comp-report/sort)  — "Comp Report"',
      'Params:      report=9b0e  step=sort', 'Context:     report: {"id":"9b0e","name":"100 Barclay Street, #17L"}',
      'Viewport:    1512x945', 'Written by:  casacalliste@gmail.com', 'Screenshots: sh_', '\nSecond line of detail.', 'History:', 'open      casacalliste@gmail.com (capture)  captured',
    ]) assert.ok(text.includes(want), `missing: ${want}\n${text}`);
  });

  test('--shots saves the screenshots where a session can open them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dn-shots-'));
    await run(`--id=${noteId}`, '--shots', `--shots-dir=${dir}`);
    const saved = out.find((l) => l.startsWith('Saved '))!.slice('Saved '.length);
    assert.ok(existsSync(saved) && saved.endsWith('.png'));
    assert.deepEqual(readFileSync(saved), PNG);
    rmSync(dir, { recursive: true, force: true });
  });

  test('picking one up, commenting, and marking it off — resolved needs the PR', async () => {
    await run(`--id=${noteId}`, '--set=read', '--by=Mason');
    assert.equal(out[0], `${noteId} is now read`);
    await run(`--id=${noteId}`, '--note=Reproduced: the tier buttons lose focus.', '--by=Mason');
    assert.equal(out[0], `${noteId} is now read — Reproduced: the tier buttons lose focus.`);
    await assert.rejects(run(`--id=${noteId}`, '--set=resolved', '--by=Mason'), /Resolved needs the PR that fixed it/);
    await assert.rejects(run(`--id=${noteId}`, '--set=wontfix', '--by=Mason'), /Say why it's wontfix/);
    await assert.rejects(run(`--id=${noteId}`, '--set=read'), /--by=/, 'a change says who made it');
    await run(`--id=${noteId}`, '--set=resolved', '--pr=57', '--note=Focus kept on the picked tier.', '--by=Mason');
    assert.equal(out[0], `${noteId} is now resolved #57 — Focus kept on the picked tier.`);
    await run(`--id=${noteId}`);
    assert.ok(out.join('\n').includes('resolved  Mason (key:Claude Code)  PR #57  Focus kept on the picked tier.'));
    await run();
    assert.equal(out[0], '1 open dev note, 1 tagged uiux.');
  });

  test('without a key it says how to get one; the key itself is never printed', async () => {
    await assert.rejects(main([], { DEV_NOTEBOOK_URL: server.url }, () => undefined), /DEV_NOTEBOOK_KEY/);
    await assert.rejects(main([], { DEV_NOTEBOOK_KEY: env.DEV_NOTEBOOK_KEY!.slice(0, -2) + 'xx', DEV_NOTEBOOK_URL: server.url }, () => undefined), /refused the key/);
    const all: string[] = [];
    await main(['--status=all'], env, (s) => all.push(s));
    await main([`--id=${noteId}`], env, (s) => all.push(s));
    const secret = env.DEV_NOTEBOOK_KEY!.split('.')[1]!;
    assert.ok(!all.join('\n').includes(secret));
  });
});
