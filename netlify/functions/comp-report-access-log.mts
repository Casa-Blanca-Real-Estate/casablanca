// /api/comp-report/access-log — the sign-in log and the activity log, for admins.
// See tools-src/comp-report/server/api/access-log.ts.
import { handleAccessLog } from '../../tools-src/comp-report/server/api/access-log.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleAccessLog(req, productionAuthDeps(req));

export const config = { path: '/api/comp-report/access-log' };
