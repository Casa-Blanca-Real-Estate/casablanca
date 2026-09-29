// /api/comp-report/workspace — see tools-src/comp-report/server/api/workspace.ts.
import { handleWorkspace } from '../../tools-src/comp-report/server/api/workspace.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleWorkspace(req, productionAuthDeps(req));

export const config = { path: '/api/comp-report/workspace' };
