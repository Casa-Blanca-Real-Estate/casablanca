// /api/lead-accept — the Studio's admin view of the StreetEasy lead auto-accept service on Railway.
// The logic and its tests are in tools-src/lead-accept/.
import { getStore } from '@netlify/blobs';
import { GUIDE_STORE, handleLeadAccept, type GuideBlobs } from '../../tools-src/lead-accept/api.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';
import { requireUser } from '../../tools-src/comp-report/server/session.ts';

export default (req: Request) =>
  handleLeadAccept(req, {
    user: (r) => requireUser(r, productionAuthDeps(r)),
    baseUrl: process.env.SE_AUTOMATION_URL,
    secret: process.env.SE_AUTOMATION_SECRET,
    fetch,
    // Strong: an edit is read straight back by the page.
    guideStore: getStore({ name: GUIDE_STORE, consistency: 'strong' }) as unknown as GuideBlobs,
  });

export const config = { path: '/api/lead-accept' };
