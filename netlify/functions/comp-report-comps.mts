// /api/comp-report/comps — see tools-src/comp-report/server/api/comps.ts.
import { handleComps } from '../../tools-src/comp-report/server/api/comps.ts';
import { productionSampleDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleComps(req, productionSampleDeps(req));

export const config = { path: '/api/comp-report/comps' };
