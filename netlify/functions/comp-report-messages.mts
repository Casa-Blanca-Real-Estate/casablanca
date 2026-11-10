// GET/POST /api/comp-report/messages — see tools-src/comp-report/server/api/messages.ts.
import { handleMessages } from '../../tools-src/comp-report/server/api/messages.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';
import { firecrawlSearcher } from '../../tools-src/comp-report/server/web-search.ts';

// A listing card's photo (Hubert's search results) is read through Firecrawl, the key the link reads use.
const web = () => firecrawlSearcher({ apiKey: process.env.FIRECRAWL_API_KEY });

export default (req: Request) => handleMessages(req, { ...productionAuthDeps(req), web });

export const config = { path: '/api/comp-report/messages' };
