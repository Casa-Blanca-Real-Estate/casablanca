// The roster's one-time import: the file check, and a real run against the
// agent CMS's store and the roster's, on Blobs' local server. Proves agents are
// created as drafts (nothing published), the CMS's details and a hand-recorded
// photo side are never overwritten, and a second run changes nothing.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import agentStore from '../../netlify/functions/agent-store.mjs';
import { handlePics, type AgentBlobs, type PicsDeps } from './api.ts';
import { execute, parseRows, plan, readExisting, slugFor, type RunOptions } from './import.ts';
import { AGENTS_STORE } from './record.ts';
import { FILES_STORE, type FileBlobs } from './files.ts';

const PICS = 'pics-token-0123456789abcdef';
const CMS = 'cms-token-fedcba9876543210';

describe('the file check', () => {
  test('slugs are firstname-lastinitial, accents and punctuation dropped', () => {
    assert.equal(slugFor('Rikki Tauber'), 'rikki-t');
    assert.equal(slugFor('José  de la Cruz'), 'jose-c');
    assert.equal(slugFor("Mary-Kate O'Neil"), 'mary-kate-o');
  });

  test('a clean file passes, with warnings for the gaps a reviewer should see', () => {
    const { rows, errors, warnings } = parseRows([
      { name: 'Rikki Tauber', title: 'Licensed Real Estate Agent', email: 'r@example.test', phone: '212.555.0101', rawInDrive: true },
      { name: 'James Campanella', slug: 'james-c', generatedAt: '2025-03-01', placements: { gmailSig: 'done', businessCard: 'na' } },
    ]);
    assert.deepEqual(errors, []);
    assert.equal(rows[0]!.slug, 'rikki-t');
    assert.deepEqual(rows[1]!.placements, { gmailSig: 'done', businessCard: 'na' });
    assert.ok(warnings.some((w) => /rikki-t, made from the name/.test(w)));
    assert.ok(warnings.some((w) => /James Campanella.*no email/.test(w)));
  });

  test('an Instagram handle or link, and former names, are taken; anything else is refused', () => {
    const ok = parseRows([
      { name: 'Emma Liuzzi', slug: 'emma-l', instagram: '@emma.liuzzi', formerNames: ['Emma Caldicott', ' '] },
      { name: 'Rikki Tauber', instagram: 'https://www.instagram.com/rikki_t/' },
    ]);
    assert.deepEqual(ok.errors, []);
    assert.equal(ok.rows[0]!.instagram, '@emma.liuzzi');
    assert.deepEqual(ok.rows[0]!.formerNames, ['Emma Caldicott']);
    assert.deepEqual(ok.rows[1]!.formerNames, []);
    const bad = parseRows([
      { name: 'A Person', instagram: 'https://example.com/a' },
      { name: 'B Person', formerNames: 'Bee' },
    ]).errors.join('\n');
    assert.match(bad, /not an Instagram handle/);
    assert.match(bad, /formerNames must be a list of names/);
  });

  test('every problem is reported, and any one stops the import', () => {
    const { errors } = parseRows([
      { name: 'Hannah Bomze' },
      { name: 'Hannah Bomze' },
      { name: 'A', email: 'w.wang@', generatedAt: 'March' },
      { name: 'B Person', placements: { instagram: 'done' } },
      { name: 'C Person', placements: { streeteasy: 'done' } },
      { name: 'D Person', nickname: 'Dee' },
      { slug: 'no-name' },
    ]);
    const all = errors.join('\n');
    assert.match(all, /hannah-b is also row 1/);
    assert.match(all, /"w\.wang@" is not an email/);
    assert.match(all, /generatedAt must be YYYY-MM-DD/);
    assert.match(all, /no placement called instagram/);
    assert.match(all, /done with which photo/);
    assert.match(all, /unknown field nickname/);
    assert.match(all, /name is required/);
    assert.deepEqual(parseRows({ agents: [] }).errors, ['the file must be a JSON array of agents']);
  });
});

describe('an import run, against both functions', () => {
  let server: BlobsServer;
  let dir: string;
  let pics: PicsDeps;
  let o: RunOptions;
  const saved: Record<string, string | undefined> = {};
  const lines: string[] = [];

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'agent-pics-import-'));
    server = new BlobsServer({ directory: dir, token: 'local' });
    const { port } = await server.start();
    const url = `http://localhost:${port}`;
    for (const k of ['NETLIFY_BLOBS_CONTEXT', 'CB_CMS_TOKEN', 'NETLIFY_BUILD_HOOK']) saved[k] = process.env[k];
    process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: url, uncachedEdgeURL: url, siteID: 'local-site', token: 'local' })).toString('base64');
    process.env.CB_CMS_TOKEN = CMS;
    delete process.env.NETLIFY_BUILD_HOOK;
    pics = {
      store: getStore({ name: AGENTS_STORE, edgeURL: url, uncachedEdgeURL: url, consistency: 'strong', token: 'local', siteID: 'local-site' }) as unknown as AgentBlobs,
      files: getStore({ name: FILES_STORE, edgeURL: url, uncachedEdgeURL: url, consistency: 'strong', token: 'local', siteID: 'local-site' }) as unknown as FileBlobs,
      env: { CB_PICS_TOKEN: PICS, CB_CMS_TOKEN: CMS },
      now: () => Date.parse('2026-10-14T15:00:00Z'),
    };
    // Both functions behind one fake origin, as on Netlify.
    const route: typeof fetch = async (input, init) => {
      const req = new Request(input, init);
      const path = new URL(req.url).pathname;
      if (path === '/.netlify/functions/agent-store') return agentStore(req);
      if (path === '/.netlify/functions/agent-pics') return handlePics(req, pics);
      return new Response('not found', { status: 404 });
    };
    o = { site: 'https://studio.test', cmsToken: CMS, picsToken: PICS, fetch: route, log: (l) => lines.push(l) };

    // Already in the store: Sam, made in the CMS, with a photo side Kimani recorded by hand.
    const res = await agentStore(new Request('https://studio.test/.netlify/functions/agent-store', {
      method: 'POST', headers: { authorization: `Bearer ${CMS}` },
      body: JSON.stringify({ action: 'create', slug: 'sam-v', draft: { identity: { name: 'Sam Valk', title: 'Team Lead' }, contact: { email: 'sam@cms.example' } } }),
    }));
    assert.equal(res.status, 200);
    await handlePics(new Request('https://studio.test/x', {
      method: 'POST', headers: { authorization: `Bearer ${PICS}` },
      body: JSON.stringify({ action: 'update', slug: 'sam-v', pic: { rawInDrive: true, notes: 'by hand' } }),
    }), pics);
  });
  after(async () => {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    await server?.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  const FILE = [
    { name: 'Sam Valk', slug: 'sam-v', title: 'Licensed Real Estate Agent', email: 'sam@doc.example', generatedAt: '2025-01-01' },
    { name: 'Rikki Tauber', title: 'Licensed Real Estate Agent', email: 'r@example.test', phone: '212-555-0101', rawInDrive: true },
    { name: 'James Campanella', email: 'j@example.test', generatedAt: '2025-03-01', placements: { gmailSig: 'done', gmailAvatar: 'done', filemaker: 'done', streeteasy: 'done', businessCard: 'na' } },
    { name: 'Nuri Daynish', instagram: '@nuri.d', formerNames: ['Nuri Smith'] },
  ];
  const record = async (slug: string) => JSON.parse((await pics.store.get(slug, { type: 'text' }))!);

  test('the plan: create the three new agents, keep Sam and his hand-recorded photo side', async () => {
    const { rows, errors } = parseRows(FILE);
    assert.deepEqual(errors, []);
    const steps = plan(rows, await readExisting(o));
    assert.deepEqual(steps.map((s) => [s.slug, s.create, s.photo]), [
      ['sam-v', false, false],
      ['rikki-t', true, true],
      ['james-c', true, true],
      ['nuri-d', true, false],
    ]);
    assert.match(steps[0]!.why, /photo side already recorded/);
  });

  test('--write creates drafts, publishes nothing, and records the photo sides', async () => {
    const { rows } = parseRows(FILE);
    const result = await execute(rows, plan(rows, await readExisting(o)), o);
    assert.deepEqual(result, { created: 3, photo: 2, failed: 0 });

    const rikki = await record('rikki-t');
    assert.equal(rikki.status, 'draft');
    assert.equal(rikki.live, null, 'nothing published');
    assert.equal(rikki.draft.identity.name, 'Rikki Tauber');
    assert.equal(rikki.draft.contact.phone, '212-555-0101');
    assert.equal(rikki.pic.rawInDrive, true);

    const nuri = await record('nuri-d');
    assert.equal(nuri.draft.contact.instagram, 'https://instagram.com/nuri.d', 'the handle is saved as the profile link');
    assert.deepEqual(nuri.draft.identity.formerNames, ['Nuri Smith']);

    const roster = (await readExisting(o));
    assert.equal(roster.size, 4);
    const res = await handlePics(new Request('https://studio.test/x', { headers: { authorization: `Bearer ${PICS}` } }), pics);
    const rows2 = (await res.json()).roster as { slug: string; status: string; formerNames: string[] }[];
    assert.deepEqual(rows2.find((r) => r.slug === 'nuri-d')!.formerNames, ['Nuri Smith'], "the roster's search can find her by it");
    assert.deepEqual(Object.fromEntries(rows2.map((r) => [r.slug, r.status])), {
      'james-c': 'deployed', 'nuri-d': 'none', 'rikki-t': 'raw', 'sam-v': 'raw',
    });
  });

  test("the CMS's details and a hand-recorded photo side are left alone", async () => {
    const sam = await record('sam-v');
    assert.equal(sam.draft.identity.title, 'Team Lead');
    assert.equal(sam.draft.contact.email, 'sam@cms.example');
    assert.equal(sam.pic.notes, 'by hand');
    assert.equal(sam.pic.generatedAt, '', "the file's generatedAt didn't overwrite what was recorded");
  });

  test('a second run changes nothing', async () => {
    const before = await Promise.all(['sam-v', 'rikki-t', 'james-c', 'nuri-d'].map(record));
    const { rows } = parseRows(FILE);
    const steps = plan(rows, await readExisting(o));
    assert.ok(steps.every((s) => !s.create), 'nothing to create');
    assert.deepEqual(steps.filter((s) => s.photo).map((s) => s.slug), [], 'no photo side to record');
    const result = await execute(rows, steps, o);
    assert.deepEqual(result, { created: 0, photo: 0, failed: 0 });
    assert.deepEqual(await Promise.all(['sam-v', 'rikki-t', 'james-c', 'nuri-d'].map(record)), before);
  });
});
