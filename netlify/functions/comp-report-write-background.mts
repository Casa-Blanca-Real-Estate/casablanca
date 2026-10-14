// POST /.netlify/functions/comp-report-write-background — one writer draft, in
// the background (a -background function runs for up to 15 minutes, and
// Netlify answers the caller 202 at once), so no response limit cuts a draft
// off. It checks the session like every other endpoint, and only writes a
// draft its caller queued for their own report. See
// tools-src/comp-report/server/api/narratives.ts.
import { runWrite } from '../../tools-src/comp-report/server/api/narratives.ts';
import { productionWriteDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => runWrite(req, productionWriteDeps(req));
