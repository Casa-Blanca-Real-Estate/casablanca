// POST /.netlify/functions/comp-report-links-background — one StreetEasy page
// read, in the background (a -background function runs for up to 15 minutes,
// and Netlify answers the caller 202 at once). It checks the session like every
// other endpoint, and only starts a read its caller queued for their own
// report. See tools-src/comp-report/server/api/links.ts.
import { runLinkRead } from '../../tools-src/comp-report/server/api/links.ts';
import { productionLinkReadDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => runLinkRead(req, productionLinkReadDeps(req));
