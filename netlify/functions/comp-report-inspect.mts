// /api/comp-report/inspect — the inspection API, behind CR_INSPECT_KEY.
// See tools-src/comp-report/server/api/inspect.ts.
import { handleInspect } from '../../tools-src/comp-report/server/api/inspect.ts';
import { databasePool } from '../../tools-src/comp-report/server/db.ts';
import { identityUrlFor } from '../../tools-src/comp-report/server/identity.ts';

export default (req: Request) => handleInspect(req, { pool: databasePool(), identityUrl: identityUrlFor(req) });

export const config = { path: '/api/comp-report/inspect' };
