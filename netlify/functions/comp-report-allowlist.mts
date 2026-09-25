// /api/comp-report/allowlist — see tools-src/comp-report/server/api/allowlist.ts.
import { handleAllowlist } from '../../tools-src/comp-report/server/api/allowlist.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleAllowlist(req, productionAuthDeps(req));

export const config = { path: '/api/comp-report/allowlist' };
