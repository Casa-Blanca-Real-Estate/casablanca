// /api/comp-report/links — see tools-src/comp-report/server/api/links.ts.
import { handleLinks } from '../../tools-src/comp-report/server/api/links.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleLinks(req, productionAuthDeps(req));

export const config = { path: '/api/comp-report/links' };
