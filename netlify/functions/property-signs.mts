// /api/property-signs — the Property Sign builder's roster search, saved signs and default
// order message. The logic and its tests are in tools-src/property-signs/.
import { getStore } from '@netlify/blobs';
import { handleSigns, SIGNS_STORE, type SignBlobs } from '../../tools-src/property-signs/api.ts';
import { productionAgentRoster, productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';
import { requireUser } from '../../tools-src/comp-report/server/session.ts';

export default (req: Request) =>
  handleSigns(req, {
    user: (r) => requireUser(r, productionAuthDeps(r)),
    roster: productionAgentRoster(),
    // Strong: a sign saved a moment ago is read straight back (its PDF, the check in the search).
    store: getStore({ name: SIGNS_STORE, consistency: 'strong' }) as unknown as SignBlobs,
    now: () => Date.now(),
  });

export const config = { path: '/api/property-signs' };
