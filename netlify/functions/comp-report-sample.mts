// /api/comp-report/sample — see tools-src/comp-report/server/api/sample.ts.
import { handleSample } from '../../tools-src/comp-report/server/api/sample.ts';
import { productionSampleDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleSample(req, productionSampleDeps(req));

export const config = { path: '/api/comp-report/sample' };
