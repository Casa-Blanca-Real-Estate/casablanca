// GET /api/comp-report/me — see tools-src/comp-report/server/api/me.ts.
import { handleMe } from '../../tools-src/comp-report/server/api/me.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleMe(req, productionAuthDeps(req));

export const config = { path: '/api/comp-report/me' };
