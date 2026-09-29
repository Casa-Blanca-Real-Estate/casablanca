// /api/comp-report/decide — the decision layer's admin readout (Dispatch 10,
// CR-D). Admins only; anyone signed out or not an admin is refused.
//   GET                      coverage (answered against dropped, by reason),
//                            latency, cost, and the answers by band
//   POST {action: "drain"}   start a drainer now — for a queue left waiting
//                            (every import starts one; this is the manual kick)
import { withActor } from '../db.ts';
import { decideConfig, type DecideConfig } from '../decide/config.ts';
import { kickDrainer } from '../decide/enqueue.ts';
import { PgStore } from '../decide/pg-store.ts';
import { decideReadout } from '../decide/readout.ts';
import type { DecideStore } from '../decide/store.ts';
import { allowMethods, HttpError, json, readJsonObject, respond } from '../http.ts';
import { requireUser, type AuthDeps } from '../session.ts';
import { asUser, requirePool } from './reports.ts';

export interface DecideApiDeps extends AuthDeps {
  config?: DecideConfig;
  store?: DecideStore;
  fetchImpl?: typeof fetch;
}

export function handleDecide(req: Request, deps: DecideApiDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET', 'POST');
    const user = await requireUser(req, deps);
    if (user.role !== 'admin') throw new HttpError(403, 'admins_only', 'The decision readout is for admins.');
    const pool = requirePool(deps);
    const config = deps.config ?? decideConfig();

    if (req.method === 'GET') {
      return json(await withActor(pool, asUser(user), (tx) => decideReadout(tx, config)));
    }

    const body = await readJsonObject(req);
    if (body.action !== 'drain') throw new HttpError(400, 'bad_action', 'The only action is "drain".');
    if (config.mode !== 'watch') throw new HttpError(409, 'mode_off', 'CR_JEV_MODE is off: nothing is queued.');
    const kicked = await kickDrainer(deps.store ?? new PgStore(pool), new URL(req.url).origin, deps.fetchImpl ?? fetch);
    return json({ kicked });
  });
}
