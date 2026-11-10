// /api/studio/tools — see tools-src/comp-report/server/api/studio-tools.ts.
import { getStore } from '@netlify/blobs';
import { handleStudioTools, TOOLS_STORE, type ToolBlobs } from '../../tools-src/comp-report/server/api/studio-tools.ts';
import { productionAuthDeps } from '../../tools-src/comp-report/server/deps.ts';

export default (req: Request) =>
  handleStudioTools(req, {
    ...productionAuthDeps(req),
    // Strong: an admin's change is read straight back by the panel and the next page load.
    toolStore: getStore({ name: TOOLS_STORE, consistency: 'strong' }) as unknown as ToolBlobs,
  });

export const config = { path: '/api/studio/tools' };
