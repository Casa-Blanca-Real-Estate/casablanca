// /api/comp-report/mentees — a mentor's list of mentees, which filters Everyone's reports.
// See tools-src/comp-report/server/api/mentees.ts.
import { handleMentees } from '../../tools-src/comp-report/server/api/mentees.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleMentees(req, productionAuthDeps(req));

export const config = { path: '/api/comp-report/mentees' };
