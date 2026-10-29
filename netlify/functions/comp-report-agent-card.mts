// GET /api/comp-report/agent-card — see tools-src/comp-report/server/api/agent-card.ts.
import { handleAgentCard } from '../../tools-src/comp-report/server/api/agent-card.ts';
import { productionAgentCardDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) => handleAgentCard(req, productionAgentCardDeps(req));

export const config = { path: '/api/comp-report/agent-card' };
