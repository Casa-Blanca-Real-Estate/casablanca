// Netlify Identity calls this on every login (legacy filename convention, still
// supported). The comp report's sign-up and log-in gate: Casa's domain, the
// allowlist and the admin list get in; anyone else gets a refusal. See
// tools-src/comp-report/server/identity-events.ts.
import { productionGateDeps } from '../../tools-src/comp-report/server/deps.ts';
import { handleIdentityEvent } from '../../tools-src/comp-report/server/identity-events.ts';

export default (req: Request) => handleIdentityEvent(req, productionGateDeps());
