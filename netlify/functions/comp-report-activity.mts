// /api/comp-report/activity — the screens someone is on and the errors they hit, for the activity log.
// See tools-src/comp-report/server/api/activity.ts.
import { handleActivity } from '../../tools-src/comp-report/server/api/activity.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleActivity(req, productionAuthDeps(req));

export const config = { path: '/api/comp-report/activity' };
