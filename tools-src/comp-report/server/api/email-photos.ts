// The email's photos (Dispatch 26 item 4; server/email-photos.ts).
//
//   POST /api/comp-report/email-photos  {reportId, reportCompIds}
//        → {comps: {<reportCompId>: path}, home: path | null}
//        At copy time: each named comp's hero photo (the first kept URL), and
//        the home's from its StreetEasy read, copied into Casa's store once
//        per report and URL. The URLs are read from what's stored, never from
//        the request. Whoever can open the report can copy its email.
//   GET  /api/comp-report/email-photo?k=<key>
//        Public by design: the client's mail loads it. Only a key the POST
//        issued is served.
import { withActor } from '../db.ts';
import { copyPhotos, photoPath, servePhoto, type EmailPhotoStore, type PhotoFetch } from '../email-photos.ts';
import { allowMethods, HttpError, json, readJsonObject, respond, UUID } from '../http.ts';
import { requireUser, type AuthDeps } from '../session.ts';
import { asUser, requirePool } from './reports.ts';
import { listingPhotos, loadJudgments, loadReads, reportFor } from './workspace.ts';

export interface EmailPhotoDeps extends AuthDeps {
  emailPhotos?: EmailPhotoStore | null;
  fetchPhoto?: PhotoFetch;
}

/** At most this many comps a copy: a report's shown comps, with room. */
const MAX_COMPS = 40;
const HOME = 'home';

export function handleEmailPhotos(req: Request, deps: EmailPhotoDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'POST');
    const user = await requireUser(req, deps);
    const pool = requirePool(deps);
    const store = deps.emailPhotos;
    const fetchPhoto = deps.fetchPhoto;
    if (!store || !fetchPhoto) throw new HttpError(503, 'no_store', 'There’s nowhere to keep the email’s photos here.');
    const body = await readJsonObject(req);
    const reportId = typeof body.reportId === 'string' && UUID.test(body.reportId) ? body.reportId : null;
    if (!reportId) throw new HttpError(400, 'bad_report', 'Which report?');
    const ids = body.reportCompIds;
    if (!Array.isArray(ids) || ids.length > MAX_COMPS || ids.some((id) => typeof id !== 'string' || !UUID.test(id))) {
      throw new HttpError(400, 'bad_comps', `Name up to ${MAX_COMPS} comps.`);
    }
    const wanted = await withActor(pool, asUser(user), async (tx) => {
      await reportFor(tx, user, reportId, false);
      const judgments = await loadJudgments(tx, reportId);
      const out: { id: string; url: string }[] = [];
      for (const id of new Set(ids as string[])) {
        const hero = judgments.find((j) => j.reportCompId === id && !j.removedAt)?.photos?.[0];
        if (hero) out.push({ id, url: hero });
      }
      const home = (await loadReads(tx, reportId)).filter((r) => r.purpose === 'subject' && r.status === 'done').at(-1);
      const homeHero = home?.extract ? listingPhotos(home.extract)[0] : undefined;
      if (homeHero) out.push({ id: HOME, url: homeHero });
      return out;
    });
    const keys = await copyPhotos(store, fetchPhoto, reportId, wanted);
    const comps: Record<string, string> = {};
    for (const [id, key] of Object.entries(keys)) if (id !== HOME) comps[id] = photoPath(key);
    return json({ comps, home: keys[HOME] ? photoPath(keys[HOME]) : null });
  });
}

export function handleEmailPhoto(req: Request, deps: { emailPhotos?: EmailPhotoStore | null }): Promise<Response> {
  return servePhoto(req, deps.emailPhotos);
}
