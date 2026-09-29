// /api/comp-report/imports — see tools-src/comp-report/server/api/imports.ts.
import { handleImports } from '../../tools-src/comp-report/server/api/imports.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleImports(req, productionAuthDeps(req));

export const config = { path: '/api/comp-report/imports' };
