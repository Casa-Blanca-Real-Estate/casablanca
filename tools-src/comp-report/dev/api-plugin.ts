// DEV ONLY — mounts the comp report's API on the Vite dev server, so
// `npm run dev:comp-report` runs the app and its functions together. The
// handlers are the same modules the deployed functions call; only the
// dependencies differ: a stub sign-in (any email you type, still subject to
// the access rule), your local database, and your own Anthropic key or a fake.
//
//   CR_LOCAL_DATABASE_URL       a local PostgreSQL with the migrations applied
//                               (npm run db:local — dev/migrate-local.ts)
//   CR_ADMIN_EMAILS, CR_ALLOWED_DOMAINS   as in production
//   ANTHROPIC_API_KEY           for real assistant turns and writer drafts
//   CR_DEV_ANTHROPIC_BASE_URL   point turns and drafts at a fake Messages API instead
//   FIRECRAWL_API_KEY           to read real StreetEasy links (costs credit)
//   CR_DEV_FIRECRAWL_BASE_URL   read them from the fake instead (dev/fake-firecrawl.ts)
//   CR_DEV_GEOSEARCH_BASE_URL   look buildings up in the fake GeoSearch (dev/fake-geosearch.ts)
//                               instead of NYC Planning's own, which needs no key
//   CR_DEV_PHOTO_FILE           a local JPEG the email's photo copy serves for every photo,
//                               instead of fetching StreetEasy's image (no network needed)
//
// Nothing under dev/ is imported by a deployed function.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

const ROUTES: Record<string, { module: string; handler: string }> = {
  '/api/comp-report/me': { module: '/server/api/me.ts', handler: 'handleMe' },
  '/api/comp-report/reports': { module: '/server/api/reports.ts', handler: 'handleReports' },
  '/api/comp-report/messages': { module: '/server/api/messages.ts', handler: 'handleMessages' },
  '/api/comp-report/turn': { module: '/server/api/turn.ts', handler: 'handleTurn' },
  '/api/comp-report/allowlist': { module: '/server/api/allowlist.ts', handler: 'handleAllowlist' },
  '/api/comp-report/workspace': { module: '/server/api/workspace.ts', handler: 'handleWorkspace' },
  '/api/comp-report/imports': { module: '/server/api/imports.ts', handler: 'handleImports' },
  '/api/comp-report/comps': { module: '/server/api/comps.ts', handler: 'handleComps' },
  '/api/comp-report/sample': { module: '/server/api/sample.ts', handler: 'handleSample' },
  '/api/comp-report/links': { module: '/server/api/links.ts', handler: 'handleLinks' },
  '/api/comp-report/geocode': { module: '/server/api/geocode.ts', handler: 'handleGeocode' },
  '/api/comp-report/narratives': { module: '/server/api/narratives.ts', handler: 'handleNarratives' },
  '/api/comp-report/lines': { module: '/server/api/lines.ts', handler: 'handleLines' },
  '/api/comp-report/comp-review': { module: '/server/api/comp-review.ts', handler: 'handleCompReview' },
  '/api/comp-report/client-words': { module: '/server/api/client-words.ts', handler: 'handleClientWords' },
  '/api/comp-report/email-photos': { module: '/server/api/email-photos.ts', handler: 'handleEmailPhotos' },
  '/api/comp-report/email-photo': { module: '/server/api/email-photos.ts', handler: 'handleEmailPhoto' },
};

/** Background functions: Netlify answers 202 at once and runs them on; so does this. */
const BACKGROUND: Record<string, { module: string; handler: string }> = {
  '/.netlify/functions/comp-report-links-background': { module: '/server/api/links.ts', handler: 'runLinkRead' },
  '/.netlify/functions/comp-report-write-background': { module: '/server/api/narratives.ts', handler: 'runWrite' },
  '/.netlify/functions/comp-report-sample-photos-background': { module: '/server/api/sample-photos.ts', handler: 'runSamplePhotoCapture' },
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

let devSamplePhotos: unknown;
let devEmailPhotos: unknown;

async function deps(server: ViteDevServer) {
  const load = (m: string) => server.ssrLoadModule(m);
  const { accessConfig } = await load('/server/access.ts');
  const { databasePool } = await load('/server/db.ts');
  const { devVerifier } = await load('/dev/stub-identity.ts');
  const { guestConfig } = await load('/server/guest.ts');
  const { memorySamplePhotoStore } = await load('/server/sample/photos.ts');
  devSamplePhotos ??= memorySamplePhotoStore();
  const { memoryEmailPhotoStore, fetchListingPhoto } = await load('/server/email-photos.ts');
  devEmailPhotos ??= memoryEmailPhotoStore();
  const { firecrawlReader } = await load('/server/links.ts');
  const { nycGeoSearch } = await load('/server/geocode.ts');
  const { default: Anthropic } = await import('@comp-report/anthropic-sdk');
  const fake = process.env.CR_DEV_FIRECRAWL_BASE_URL;
  return {
    verifier: devVerifier,
    access: accessConfig(process.env),
    pool: databasePool(process.env),
    guest: guestConfig(process.env, 'dev'), // CR_GUEST_KEY, to try guest mode locally
    samplePhotos: devSamplePhotos, // in memory: kept until the dev server restarts
    emailPhotos: devEmailPhotos, // the email's copied photos, in memory too
    // CR_DEV_PHOTO_FILE: serve this local image for every photo, for a walk with no network (StreetEasy's images).
    fetchPhoto: process.env.CR_DEV_PHOTO_FILE
      ? async () => ({ ok: true, data: new Uint8Array(await (await import('node:fs/promises')).readFile(process.env.CR_DEV_PHOTO_FILE!)).buffer, contentType: 'image/jpeg' })
      : fetchListingPhoto,
    env: process.env,
    reader: firecrawlReader(fake ? { apiKey: 'dev-fake', baseUrl: fake, backoffMs: [500] } : { apiKey: process.env.FIRECRAWL_API_KEY }),
    geocoder: nycGeoSearch({ baseUrl: process.env.CR_DEV_GEOSEARCH_BASE_URL || undefined }),
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
        const background = BACKGROUND[(req.url ?? '').split('?')[0] ?? ''];
        if (background) {
          const request = await toRequest(req);
          res.statusCode = 202;
          res.end();
          void (async () => {
            const mod = await server.ssrLoadModule(background.module);
            const response: Response = await mod[background.handler](request, await deps(server));
            if (!response.ok) console.error('dev background function:', response.status, await response.text());
          })().catch((error) => console.error('dev background function error', error));
          return;
        }
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
