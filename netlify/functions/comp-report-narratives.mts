// /api/comp-report/narratives — see tools-src/comp-report/server/api/narratives.ts.
import { handleNarratives } from '../../tools-src/comp-report/server/api/narratives.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleNarratives(req, productionAuthDeps(req));

export const config = { path: '/api/comp-report/narratives' };
