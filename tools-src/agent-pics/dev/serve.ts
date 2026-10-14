// DEV/TEST ONLY — the site as Netlify serves it (the repo root, publish = ".")
// plus the two functions that share the `cb-agents` store: the agent CMS's
// (agent-store.mjs) and the roster's (agent-pics). Blobs is Blobs' own local
// server, seeded with made-up agents. Nothing deployed imports this file.
//
//   node tools-src/agent-pics/dev/serve.ts 8898
//   → http://localhost:8898/tools/profile-pic/#roster   token: dev-pics-token
//   → http://localhost:8898/tools/agent-cms/            token: dev-cms-token
//
// The studio's members gate needs localStorage.cb_auth set to an approved email.
import { createReadStream, existsSync, mkdtempSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { handlePics, type AgentBlobs } from '../api.ts';
import { AGENTS_STORE } from '../record.ts';

const REPO = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
};
const PICS_TOKEN = 'dev-pics-token';
const CMS_TOKEN = 'dev-cms-token';

/** Made-up agents at every step, as agent-store's `create` writes them plus a photo side. */
function seed(now: number) {
  const day = (n: number) => new Date(now - n * 86_400_000).toISOString();
  const agent = (slug: string, name: string, extra: Record<string, unknown> = {}) => ({
    slug,
    status: 'draft',
    draft: { identity: { name, title: 'Licensed Real Estate Agent' }, contact: { email: `${slug}@example.test` } },
    live: null,
    previewToken: `preview-${slug}`,
    createdAt: day(30),
    updatedAt: day(30),
    updatedBy: '',
    publishedAt: '',
    ...extra,
  });
  const done = (n: number) => ({ state: 'done', at: day(n), note: '' });
  const todo = { state: 'todo', at: '', note: '' };
  return [
    agent('avery-s', 'Avery Stone'),
    agent('jordan-l', 'Jordan Lee', { pic: { rawInDrive: true, notes: 'Shoot was 10/2, raws in Drive' } }),
    agent('morgan-d', 'Morgan Diaz', {
      pic: { rawInDrive: true, generatedAt: day(6) },
      placements: { gmailSig: done(5), gmailAvatar: done(5), filemaker: todo, streeteasy: todo, businessCard: todo },
    }),
    agent('riley-c', 'Riley Chen', {
      status: 'live',
      pic: { rawInDrive: true, generatedAt: day(40) },
      placements: { gmailSig: done(39), gmailAvatar: done(39), filemaker: done(38), streeteasy: done(38), businessCard: { state: 'na', at: day(38), note: 'No card' } },
    }),
    agent('casey-p', 'Casey Park', {
      pic: { rawInDrive: true, generatedAt: day(2) },
      placements: { gmailSig: done(20), gmailAvatar: done(20), filemaker: done(20), streeteasy: done(20), businessCard: done(20) },
    }),
    agent('drew-k', 'Drew Kim', { status: 'archived' }),
  ];
}

async function toRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  return new Request(`${origin}${req.url}`, {
    method: req.method,
    headers,
    body: chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined,
  });
}

const port = Number(process.argv[2] || 8898);
const blobs = new BlobsServer({ directory: mkdtempSync(join(tmpdir(), 'agent-pics-dev-')), token: 'local' });
const { port: blobsPort } = await blobs.start();
const edge = `http://localhost:${blobsPort}`;
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: edge, uncachedEdgeURL: edge, siteID: 'local-site', token: 'local' })).toString('base64');
process.env.CB_CMS_TOKEN = CMS_TOKEN;
const { default: agentStore } = await import('../../../netlify/functions/agent-store.mjs');

const store = getStore({ name: AGENTS_STORE, consistency: 'strong' }) as unknown as AgentBlobs;
const records = seed(Date.now());
for (const r of records) await store.set(r.slug, JSON.stringify(r));
await store.set('_index', JSON.stringify(records.map((r) => r.slug)));

createServer(async (req, res) => {
  const origin = `http://localhost:${port}`;
  const path = new URL(req.url || '/', origin).pathname;
  let response: Response | null = null;
  if (path === '/.netlify/functions/agent-pics') {
    response = await handlePics(await toRequest(req, origin), { store, env: { CB_PICS_TOKEN: PICS_TOKEN, CB_CMS_TOKEN: CMS_TOKEN }, now: () => Date.now() });
  } else if (path === '/.netlify/functions/agent-store') {
    response = await agentStore(await toRequest(req, origin));
  }
  if (response) {
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  let file = join(REPO, decodeURIComponent(path));
  if (!file.startsWith(REPO + sep) && file !== REPO) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`roster dev server: http://localhost:${port}/tools/profile-pic/#roster  (token ${PICS_TOKEN})`);
});
