// POST /api/comp-report/turn — one streamed assistant turn. See
// tools-src/comp-report/server/api/turn.ts.
import { handleTurn, productionAnthropic } from '../../tools-src/comp-report/server/api/turn.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleTurn(req, { ...productionAuthDeps(req), anthropic: productionAnthropic });

export const config = { path: '/api/comp-report/turn' };
