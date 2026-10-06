// /api/comp-report/decide — see tools-src/comp-report/server/api/decide.ts.
import { handleDecide } from '../../tools-src/comp-report/server/api/decide.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleDecide(req, productionAuthDeps(req));

export const config = { path: '/api/comp-report/decide' };
