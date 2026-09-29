// /api/comp-report/comps — see tools-src/comp-report/server/api/comps.ts.
import { handleComps } from '../../tools-src/comp-report/server/api/comps.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleComps(req, productionAuthDeps(req));

export const config = { path: '/api/comp-report/comps' };
