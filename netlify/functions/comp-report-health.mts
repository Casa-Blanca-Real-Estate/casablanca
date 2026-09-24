// GET /api/comp-report/health — the comp report's setup state, nothing more.
// See tools-src/comp-report/server/api/health.ts.
import { handleHealth } from '../../tools-src/comp-report/server/api/health.ts';
import { databasePool } from '../../tools-src/comp-report/server/db.ts';
import { identityUrlFor } from '../../tools-src/comp-report/server/identity.ts';

export default (req: Request) => handleHealth(req, { pool: databasePool(), identityUrl: identityUrlFor(req) });

export const config = { path: '/api/comp-report/health' };
