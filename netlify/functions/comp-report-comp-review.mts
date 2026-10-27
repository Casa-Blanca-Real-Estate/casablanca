// POST /api/comp-report/comp-review — Hubert on one comp, on Sort's review flow.
// See tools-src/comp-report/server/api/comp-review.ts.
import { handleCompReview } from '../../tools-src/comp-report/server/api/comp-review.ts';
import { productionAnthropic } from '../../tools-src/comp-report/server/api/turn.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleCompReview(req, { ...productionAuthDeps(req), anthropic: productionAnthropic, env: process.env });

export const config = { path: '/api/comp-report/comp-review' };
