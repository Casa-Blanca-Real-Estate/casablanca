// /api/comp-report/reports — see tools-src/comp-report/server/api/reports.ts.
import { handleReports } from '../../tools-src/comp-report/server/api/reports.ts';
import { productionSampleDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleReports(req, productionSampleDeps(req));

export const config = { path: '/api/comp-report/reports' };
