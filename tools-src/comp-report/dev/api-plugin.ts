// DEV ONLY — mounts the comp report's API on the Vite dev server, so
// `npm run dev:comp-report` runs the app and its functions together. The
// handlers are the same modules the deployed functions call; only the
// dependencies differ: a stub sign-in (any email you type, still subject to
// the access rule), your local database, and your own Anthropic key or a fake.
//
//   CR_LOCAL_DATABASE_URL       a local PostgreSQL with the migrations applied
//                               (npm run db:local — dev/migrate-local.ts)
//   CR_ADMIN_EMAILS, CR_ALLOWED_DOMAINS   as in production
//   ANTHROPIC_API_KEY           for real assistant turns
//   CR_DEV_ANTHROPIC_BASE_URL   point turns at a fake Messages API instead
//
// Nothing under dev/ is imported by a deployed function.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

const ROUTES: Record<string, { module: string; handler: string }> = {
  '/api/comp-report/me': { module: '/server/api/me.ts', handler: 'handleMe' },
  '/api/comp-report/reports': { module: '/server/api/reports.ts', handler: 'handleReports' },
  '/api/comp-report/messages': { module: '/server/api/messages.ts', handler: 'handleMessages' },
  '/api/comp-report/turn': { module: '/server/api/turn.ts', handler: 'handleTurn' },
};

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  return new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers,
    body: chunks.length && req.method !== 'GET' ? Buffer.concat(chunks) : undefined,
  });
}

async function send(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  if (!response.body) return res.end();
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

async function deps(server: ViteDevServer) {
  const load = (m: string) => server.ssrLoadModule(m);
  const { accessConfig } = await load('/server/access.ts');
  const { databasePool } = await load('/server/db.ts');
  const { devVerifier } = await load('/dev/stub-identity.ts');
  const { default: Anthropic } = await import('@comp-report/anthropic-sdk');
  return {
    verifier: devVerifier,
    access: accessConfig(process.env),
    pool: databasePool(process.env),
    anthropic: () =>
      new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY ?? 'dev-no-key',
        baseURL: process.env.CR_DEV_ANTHROPIC_BASE_URL || undefined,
        maxRetries: 0,
      }),
  };
}

export function devApi(): Plugin {
  return {
    name: 'cr-dev-api',
    apply: 'serve',
    configureServer(server) {
      if (process.env.NETLIFY_DB_URL) {
        throw new Error('dev API: NETLIFY_DB_URL is set — refusing to run the dev server against a Netlify database');
      }
      server.middlewares.use(async (req, res, next) => {
        const route = ROUTES[(req.url ?? '').split('?')[0] ?? ''];
        if (!route) return next();
        try {
          const mod = await server.ssrLoadModule(route.module);
          await send(res, await mod[route.handler](await toRequest(req), await deps(server)));
        } catch (error) {
          console.error('dev API error', error);
          if (!res.headersSent) res.statusCode = 500;
          res.end();
        }
      });
    },
  };
}
