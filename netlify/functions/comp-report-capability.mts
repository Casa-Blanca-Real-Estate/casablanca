// /api/comp-report/capability — an admin sets an agent's level, practice or full.
// See tools-src/comp-report/server/api/capability.ts.
import { handleCapability } from '../../tools-src/comp-report/server/api/capability.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleCapability(req, productionAuthDeps(req));

export const config = { path: '/api/comp-report/capability' };
