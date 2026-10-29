// /api/comp-report/signin-error — the error Google or Identity handed back in the sign-in URL,
// with no sign-in. An open door: closed lists, 1 KB, rate-limited per day-salted IP hash.
// See tools-src/comp-report/server/api/signin-error.ts.
import { handleSignInError } from '../../tools-src/comp-report/server/api/signin-error.ts';
import { databasePool } from '../../tools-src/comp-report/server/db.ts';

export default (req: Request, context: { ip?: string }) => handleSignInError(req, { pool: databasePool() }, context);

export const config = { path: '/api/comp-report/signin-error' };
