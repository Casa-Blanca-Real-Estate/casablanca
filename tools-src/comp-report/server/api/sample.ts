// GET /api/comp-report/sample — the walkthrough's sample for step 1 and the
// call (Dispatch 07): 100 Barclay #17L's facts, brief, target, deal terms and
// Hannah's call. Admins only, while the tool isn't in agents' hands. The export
// itself never leaves the server this way: the sample import stores it. A guest
// (server/guest.ts) gets it too, so a preview can be walked through end to end.
import { allowMethods, HttpError, json, respond } from '../http.ts';
import { sampleWalkthrough } from '../sample/barclay-17l.ts';
import { mayUseSample, requireUser, type AuthDeps } from '../session.ts';

export function handleSample(req: Request, deps: AuthDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET');
    const user = await requireUser(req, deps);
    if (!mayUseSample(user)) throw new HttpError(403, 'admins_only', 'Sample data is for admins and guests.');
    return json(sampleWalkthrough());
  });
}
