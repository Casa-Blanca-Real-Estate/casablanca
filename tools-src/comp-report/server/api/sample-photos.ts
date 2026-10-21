// POST /.netlify/functions/comp-report-sample-photos-background — reads the
// sample's listing pages once and keeps their photo URLs (server/sample/photos.ts).
// The browser starts it when someone fills a report with the sample; it runs
// only for those who may use the sample (admins and guests), and only when no
// capture is kept or under way. Then each new sample report, and each "Fill
// with sample: Sort", gives the sample comps their photos.
import { allowMethods, HttpError, json, respond } from '../http.ts';
import type { PageReader } from '../links.ts';
import { captureDue, captureSamplePhotos, type SamplePhotoStore } from '../sample/photos.ts';
import { mayUseSample, requireUser, type AuthDeps } from '../session.ts';

export interface SamplePhotoDeps extends AuthDeps {
  samplePhotos?: SamplePhotoStore | null;
}

export interface SamplePhotoCaptureDeps extends SamplePhotoDeps {
  reader: PageReader;
}

export function runSamplePhotoCapture(req: Request, deps: SamplePhotoCaptureDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'POST');
    const user = await requireUser(req, deps);
    if (!mayUseSample(user)) throw new HttpError(403, 'admins_only', 'Sample data is for admins and guests.');
    if (!deps.samplePhotos) throw new HttpError(503, 'no_store', 'There’s nowhere to keep the sample’s photos here.');
    if (!(await captureDue(deps.samplePhotos))) return json({ captured: false });
    const byProperty = await captureSamplePhotos(deps.reader, deps.samplePhotos);
    return json({ captured: true, withPhotos: Object.keys(byProperty).length });
  });
}
