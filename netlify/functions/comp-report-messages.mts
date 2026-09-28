// GET /api/comp-report/messages — see tools-src/comp-report/server/api/messages.ts.
import { handleMessages } from '../../tools-src/comp-report/server/api/messages.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleMessages(req, productionAuthDeps(req));

export const config = { path: '/api/comp-report/messages' };
