// The decision layer's weekly drift check — a SCHEDULED function (Dispatch 10
// phase 2 step 6). It re-asks the fixed fixtures through the queue and starts
// a drainer. Once per ISO week whatever starts it, and nothing at all unless
// CR_JEV_MODE is watch and the Jev key is set. See
// tools-src/comp-report/server/decide/drift.ts.
import { databasePool } from '../../tools-src/comp-report/server/db.ts';
import { decideConfig } from '../../tools-src/comp-report/server/decide/config.ts';
import { enqueueDriftCheck } from '../../tools-src/comp-report/server/decide/drift.ts';
import { PgStore } from '../../tools-src/comp-report/server/decide/pg-store.ts';

/** Netlify's own URL variable (the site's main address), else the invocation's origin. */
function siteOrigin(req: Request): string | null {
  if (process.env.URL) return process.env.URL;
  try {
    return new URL(req.url).origin;
  } catch {
    return null;
  }
}

export default async (req: Request) => {
  const pool = databasePool();
  if (!pool) return;
  const result = await enqueueDriftCheck({
    store: new PgStore(pool), config: decideConfig(), nowMs: Date.now(), origin: siteOrigin(req),
  });
  console.log(JSON.stringify({ at: 'comp-report-decide', event: 'drift', ...result }));
};

// Mondays at 06:17 UTC: off the hour, and before Casa's working day.
export const config = { schedule: '17 6 * * 1' };
