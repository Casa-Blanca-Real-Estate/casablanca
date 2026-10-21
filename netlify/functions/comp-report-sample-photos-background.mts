// POST /.netlify/functions/comp-report-sample-photos-background — the sample's
// photos, read once in the background. See
// tools-src/comp-report/server/api/sample-photos.ts.
import { runSamplePhotoCapture } from '../../tools-src/comp-report/server/api/sample-photos.ts';
import { productionSamplePhotoCaptureDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => runSamplePhotoCapture(req, productionSamplePhotoCaptureDeps(req));
