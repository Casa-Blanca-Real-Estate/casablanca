// POST /api/comp-report/turn — one streamed assistant turn. See
// tools-src/comp-report/server/api/turn.ts.
import { handleTurn, productionAnthropic } from '../../tools-src/comp-report/server/api/turn.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';
import { firecrawlSearcher } from '../../tools-src/comp-report/server/web-search.ts';

const web = () => firecrawlSearcher({ apiKey: process.env.FIRECRAWL_API_KEY });

export default (req: Request) => handleTurn(req, { ...productionAuthDeps(req), anthropic: productionAnthropic, web });

export const config = { path: '/api/comp-report/turn' };
