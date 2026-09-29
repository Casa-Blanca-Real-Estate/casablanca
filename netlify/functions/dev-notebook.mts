// /api/dev/notebook/* — the dev notebook. See tools-src/dev-notebook/server/api.ts
// and docs/dev-notebook/README.md. One function for every route, so the gate in
// front of them is one piece of code.
import { handleNotebook } from '../../tools-src/dev-notebook/server/api.ts';
import { productionDeps } from '../../tools-src/dev-notebook/server/deps.ts';

export default (req: Request, context?: { deploy?: { id?: string } }) => handleNotebook(req, productionDeps(req, context));

export const config = { path: ['/api/dev/notebook', '/api/dev/notebook/*'] };
