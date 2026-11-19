// GET /api/studio/keys — see tools-src/comp-report/server/api/studio-keys.ts.
import { handleStudioKeys } from '../../tools-src/comp-report/server/api/studio-keys.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleStudioKeys(req, productionAuthDeps(req));

export const config = { path: '/api/studio/keys' };
