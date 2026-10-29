// /api/comp-report/sample — the sample (Dispatch 07, 23). Admins only, while
// the tool isn't in agents' hands, and a guest (server/guest.ts), so a preview
// can be walked through end to end. The export itself never leaves the server
// this way: the sample import stores it.
//   GET  ?kind=condo|coop[&side=buyer]      the walkthrough's sample: 100 Barclay #17L's facts, brief,
//                                           target, deal terms and Hannah's call (a co-op's has no size)
//   POST {action: 'fill', kind, title}      a new sample report, built in one transaction (sample/build.ts)
//   POST {action: 'reset', reportId}        a fresh copy of the caller's own sample report; the old one archived
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { fillSample, resetSample } from '../sample/build.ts';
import { isSampleKind, SAMPLE_PROPERTY_TYPE, sampleWalkthrough } from '../sample/barclay-17l.ts';
import { samplePhotos } from '../sample/photos.ts';
import { mayUseSample, requireUser } from '../session.ts';
import { requirePool } from './reports.ts';
import type { SamplePhotoDeps } from './sample-photos.ts';

export function handleSample(req: Request, deps: SamplePhotoDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET', 'POST');
    const user = await requireUser(req, deps);
    // The server decides, before any query: the buttons only follow.
    if (!mayUseSample(user)) throw new HttpError(403, 'admins_only', 'Sample data is for admins and guests.');

    if (req.method === 'GET') {
      const kind = new URL(req.url).searchParams.get('kind') ?? SAMPLE_PROPERTY_TYPE;
      if (!isSampleKind(kind)) throw new HttpError(400, 'bad_kind', 'The sample is condo or coop.');
      const side = new URL(req.url).searchParams.get('side') ?? 'seller';
      if (side !== 'buyer' && side !== 'seller') throw new HttpError(400, 'bad_side', 'The sample is for a buyer or a seller.');
      return json(sampleWalkthrough(kind, side));
    }

    const body = await readJsonObject(req);
    const pool = requirePool(deps);
    if (body.action === 'fill') {
      if (!isSampleKind(body.kind)) throw new HttpError(400, 'bad_kind', 'The sample is condo or coop.');
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (title.length < 1 || title.length > 200) {
        throw new HttpError(400, 'bad_title', 'Give the report a title of up to 200 characters.');
      }
      const photos = await samplePhotos(deps.samplePhotos);
      return json({ report: await fillSample(pool, user, body.kind, title, photos) }, 201);
    }
    if (body.action === 'reset') {
      // The kind and the title come from the old report, never from the body.
      const reportId = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
      if (!reportId) throw new HttpError(400, 'bad_report', 'Which report?');
      const photos = await samplePhotos(deps.samplePhotos);
      return json(await resetSample(pool, user, reportId, photos), 201);
    }
    throw new HttpError(400, 'bad_action', 'The action is fill or reset.');
  });
}
