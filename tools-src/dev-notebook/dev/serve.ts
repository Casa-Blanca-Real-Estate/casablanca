// DEV/TEST ONLY — the site as Netlify serves it (the repo root, publish = ".")
// plus the dev notebook's API, on one local port. Blobs is Blobs' own local
// server; Identity is a stub: its sign-in page asks which email you are and
// hands back a `dev.<email>` token that only this server's stub accepts.
// Nothing deployed imports this file.
//
//   node tools-src/dev-notebook/dev/serve.ts 8899
//   → http://localhost:8899/tools/dev-notebook/
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import type { IdentityVerifier } from '../../comp-report/server/identity.ts';
import { FEEDBACK_STORE, handleFeedback, readFeedback, type FeedbackBlobs } from '../../feedback/feedback.ts';
import { BASE, handleNotebook, type NotebookDeps } from '../server/api.ts';
import { notebookStore, type BlobStore } from '../server/store.ts';

const REPO = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
};

/** Accepts only the stub's own tokens: `dev.<base64url email>`. */
export const devIdentity: IdentityVerifier = {
  async verify(token) {
    if (!token.startsWith('dev.')) return null;
    const email = Buffer.from(token.slice(4), 'base64url').toString('utf8').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { id: `dev-${email}`, email, confirmed: true, provider: 'google', name: null } : null;
  },
  async emailConfirmationRequired() {
    return true;
  },
};

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

function localCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, timeout: 2000 }).toString().trim().slice(0, 12) || null;
  } catch {
    return null;
  }
}

const SIGN_IN_PAGE = (back: string) => `<!doctype html><meta charset="utf-8"><title>Dev sign-in</title>
<body style="font-family:sans-serif;padding:40px">
<h1>Dev sign-in (stub Identity)</h1>
<form method="GET" action="/.netlify/identity/dev-callback">
  <input type="hidden" name="back" value="${back.replace(/"/g, '&quot;')}">
  <label>Which email? <input name="email" value="casacalliste@gmail.com" size="40"></label>
  <button>Sign in</button>
</form></body>`;

export async function startNotebookServer(opts: { port?: number; env?: Record<string, string | undefined> } = {}) {
  const blobsDir = mkdtempSync(join(tmpdir(), 'dev-notebook-local-'));
  const blobs = new BlobsServer({ directory: blobsDir, token: 'local' });
  const { port: blobsPort } = await blobs.start();
  const store = notebookStore(getStore({ name: 'dev-notebook', edgeURL: `http://localhost:${blobsPort}`, token: 'local', siteID: 'local' }) as unknown as BlobStore);
  const commit = localCommit();
  const feedbackStore = getStore({ name: FEEDBACK_STORE, edgeURL: `http://localhost:${blobsPort}`, token: 'local', siteID: 'local' }) as unknown as FeedbackBlobs;

  const server: Server = createServer((req, res) => {
    void (async () => {
      const origin = `http://${req.headers.host}`;
      const url = new URL(req.url ?? '/', origin);
      if (url.pathname.startsWith(BASE)) {
        const deps: NotebookDeps = {
          store, verifier: devIdentity, env: opts.env ?? {}, commit: async () => commit, deployId: 'local', now: () => Date.now(),
          feedback: () => readFeedback(feedbackStore),
        };
        const response = await handleNotebook(await toRequest(req, origin), deps);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      // The team Feedback button's function, as deployed (netlify/functions/feedback.mts).
      if (url.pathname === '/.netlify/functions/feedback') {
        const response = await handleFeedback(await toRequest(req, origin), feedbackStore);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      // Stub Identity: Google sign-in returns to the page it started from, as production does on its main hostname.
      if (url.pathname === '/.netlify/identity/authorize') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(SIGN_IN_PAGE(req.headers.referer ?? `${origin}/`));
        return;
      }
      if (url.pathname === '/.netlify/identity/dev-callback') {
        const email = (url.searchParams.get('email') ?? '').trim().toLowerCase();
        const back = new URL(url.searchParams.get('back') ?? '/', origin);
        const token = `dev.${Buffer.from(email).toString('base64url')}`;
        res.writeHead(302, { Location: `${back.origin}${back.pathname}${back.search}#access_token=${token}&token_type=bearer&expires_in=3600&refresh_token=unused` });
        res.end();
        return;
      }
      let file = resolve(REPO, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(REPO + sep) && file !== REPO) {
        res.writeHead(403).end();
        return;
      }
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      createReadStream(file).pipe(res);
    })().catch((error) => {
      console.error(error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(opts.port ?? 0, '127.0.0.1', r));
  const url = `http://localhost:${(server.address() as AddressInfo).port}`;
  return {
    url,
    store,
    feedbackStore,
    async close() {
      await new Promise<void>((r) => server.close(() => r()));
      await blobs.stop();
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startNotebookServer({ port: Number(process.argv[2] ?? 8899) });
  console.log(`dev notebook (local): ${s.url}/tools/dev-notebook/`);
}
