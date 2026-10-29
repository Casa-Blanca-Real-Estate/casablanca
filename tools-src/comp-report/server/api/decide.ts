// /api/comp-report/decide — the decision layer's admin readout and its admin
// actions (Dispatch 10, CR-D). Anyone signed out or not an admin is refused.
//
//   GET                               coverage (answered against dropped, by
//                                     reason), latency, cost, the answers by
//                                     band, the latest probe, the batches, drift
//   GET ?view=batch&batch=<name>      one batch's requests, each with its text
//                                     and every judgment on it
//   GET ?view=probes                  the latest go/no-go calls, raw bodies too
//   POST {action: "drain"}            start a drainer now — for a queue left
//                                     waiting (every import starts one)
//   POST {action: "probe", fixture?, wireIds?}
//                                     the go/no-go call: one fixed request, no
//                                     user data, sent once. Works in any mode;
//                                     needs the Jev key. Another fixture or a
//                                     few wire questions alone: the order check
//   POST {action: "labelled", batch, urls[], rerun?}
//                                     the labelled set, Jev and Haiku on each
//   POST {action: "drift"}            this week's drift check, now
//
// Who may call it: an admin signed in with Identity, or a Claude Code session
// holding CR_DECIDE_KEY, sent as the X-Decide-Key header. The key opens this
// endpoint and nothing else, acts as the system (the tables' row-level
// security admits admins and the system only), and every use is logged
// without it. A wrong or unset key is a 401, never a fall-through to Identity;
// a right one set equal to the inspect or test key is a 503 (server/keys.ts).
import { withActor, type Actor } from '../db.ts';
import { decideConfig, type DecideConfig } from '../decide/config.ts';
import { realClock, type Clock } from '../decide/drain.ts';
import { enqueueDriftCheck } from '../decide/drift.ts';
import { kickDrainer } from '../decide/enqueue.ts';
import { enqueueLabelledBatch } from '../decide/labelled.ts';
import { PgStore } from '../decide/pg-store.ts';
import { ProbeInputError, runProbe } from '../decide/probe.ts';
import { batchView, decideReadout, probesView } from '../decide/readout.ts';
import type { DecideStore } from '../decide/store.ts';
import { allowMethods, HttpError, json, readJsonObject, respond } from '../http.ts';
import { keyCollides, sameKey } from '../keys.ts';
import { requireUser, type AuthDeps } from '../session.ts';
import { asUser, requirePool } from './reports.ts';

export interface DecideApiDeps extends AuthDeps {
  config?: DecideConfig;
  store?: DecideStore;
  fetchImpl?: typeof fetch;
  clock?: Clock;
  /** Where the keys are read for the collision rule; process.env in production. */
  env?: Record<string, string | undefined>;
}

export const DECIDE_KEY_HEADER = 'x-decide-key';
const KEY_ACTOR: Actor = { kind: 'system', does: 'decide-key' };

export { sameKey };

/** Who's calling: the session key's system actor, or a signed-in admin. */
async function caller(req: Request, deps: DecideApiDeps, config: DecideConfig): Promise<{ actor: Actor; via: 'key' | 'admin' }> {
  const given = req.headers.get(DECIDE_KEY_HEADER);
  if (given !== null) {
    if (!config.decideKey || !sameKey(given.trim(), config.decideKey)) {
      throw new HttpError(401, 'bad_key', 'That decide key isn\'t valid here.');
    }
    if (keyCollides(deps.env ?? process.env, 'CR_DECIDE_KEY')) {
      console.error(JSON.stringify({ at: 'comp-report-decide', event: 'key_collision' }));
      throw new HttpError(503, 'keys_collide', 'CR_DECIDE_KEY is set to the same value as another session key. Set each to its own.');
    }
    return { actor: KEY_ACTOR, via: 'key' };
  }
  const user = await requireUser(req, deps);
  if (user.role !== 'admin') throw new HttpError(403, 'admins_only', 'The decision readout is for admins.');
  return { actor: asUser(user), via: 'admin' };
}

export function handleDecide(req: Request, deps: DecideApiDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET', 'POST');
    const config = deps.config ?? decideConfig();
    const who = await caller(req, deps, config);
    const pool = requirePool(deps);
    const store = deps.store ?? new PgStore(pool);
    const clock = deps.clock ?? realClock;
    const fetchImpl = deps.fetchImpl ?? fetch;
    const origin = new URL(req.url).origin;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const view = url.searchParams.get('view');
      if (who.via === 'key') console.log(JSON.stringify({ at: 'comp-report-decide', event: 'key', method: 'GET', view: view ?? 'readout' }));
      if (view === 'batch') {
        const batch = url.searchParams.get('batch') ?? '';
        if (!/^[a-z0-9][a-z0-9._-]{0,47}$/.test(batch)) throw new HttpError(400, 'bad_batch', 'Name the batch: ?view=batch&batch=labels-v1.');
        return json(await withActor(pool, who.actor, (tx) => batchView(tx, batch)));
      }
      if (view === 'probes') return json(await withActor(pool, who.actor, (tx) => probesView(tx)));
      if (view !== null) throw new HttpError(400, 'bad_view', 'The views are "batch" and "probes".');
      return json(await withActor(pool, who.actor, (tx) => decideReadout(tx, config)));
    }

    const body = await readJsonObject(req);
    const action = typeof body.action === 'string' ? body.action : '';
    if (who.via === 'key') console.log(JSON.stringify({ at: 'comp-report-decide', event: 'key', method: 'POST', action }));

    if (action === 'probe') {
      if (!config.jevKey) throw new HttpError(409, 'no_key', 'There\'s no AI_GATEWAY_API_KEY: nothing can be sent.');
      let result;
      try {
        result = await runProbe({ store, config, fetchImpl, clock, fixtureId: body.fixture, wireIds: body.wireIds });
      } catch (error) {
        if (error instanceof ProbeInputError) throw new HttpError(400, 'bad_probe', error.message);
        throw error;
      }
      console.log(JSON.stringify({ at: 'comp-report-decide', event: 'probe', ok: result.ok, outcome: result.outcome, status: result.status, ms: result.ms }));
      return json(result);
    }

    if (action === 'drain' || action === 'labelled' || action === 'drift') {
      if (config.mode !== 'watch') throw new HttpError(409, 'mode_off', 'CR_JEV_MODE is off: nothing is queued.');
    }
    if (action === 'drain') return json({ kicked: await kickDrainer(store, origin, fetchImpl) });
    if (action === 'drift') {
      const r = await enqueueDriftCheck({ store, config, nowMs: clock.now(), origin, fetchImpl });
      return json(r, r.queued || r.why === 'already-this-week' ? 200 : 409);
    }
    if (action === 'labelled') {
      const urls = Array.isArray(body.urls) ? body.urls : [];
      const r = await enqueueLabelledBatch({
        store, config, urls, batch: typeof body.batch === 'string' ? body.batch : '', rerun: body.rerun === true,
        nowMs: clock.now(), origin, fetchImpl,
      });
      if (!r.queued) {
        const status = r.why === 'error' ? 500 : r.why === 'off' || r.why === 'no-key' || r.why === 'batch-exists' ? 409 : 400;
        return json(r, status);
      }
      return json(r);
    }
    throw new HttpError(400, 'bad_action', 'The actions are "probe", "drain", "labelled" and "drift".');
  });
}
