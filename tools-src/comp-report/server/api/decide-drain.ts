// The background drainer's handler (Dispatch 10, CR-D). Netlify answers the
// caller 202 at once and runs this for up to 15 minutes.
//
// It runs only with a live one-use token, issued by whatever started it (an
// import's enqueue, an admin's kick, or the drainer itself re-invoking): the
// function's URL is public, and nothing else may start a drain. With the mode
// off it does nothing. When the queue outlasts its time, it hands on to a
// fresh invocation before it stops.
import { randomUUID } from 'node:crypto';
import type { PoolLike } from '../db.ts';
import { decideConfig, type DecideConfig } from '../decide/config.ts';
import { drain, realClock, type Clock, type DrainReport } from '../decide/drain.ts';
import { kickDrainer } from '../decide/enqueue.ts';
import type { HaikuClient } from '../decide/haiku.ts';
import { PgStore } from '../decide/pg-store.ts';
import type { DecideStore } from '../decide/store.ts';
import { json } from '../http.ts';

export interface DrainHandlerDeps {
  pool: PoolLike | null;
  config?: DecideConfig;
  store?: DecideStore;
  clock?: Clock;
  fetchImpl?: typeof fetch;
  /** Built only when the fallback can run. */
  haiku?: () => HaikuClient | null;
  /** Built only when the Anthropic key is set: the labelled batch's second judge. */
  secondJudge?: () => HaikuClient | null;
  budgetMs?: number;
}

export async function handleDecideDrain(req: Request, deps: DrainHandlerDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const config = deps.config ?? decideConfig();
  if (config.mode !== 'watch' || !deps.pool) return json({ ran: false, why: 'off' });
  const store = deps.store ?? new PgStore(deps.pool);
  const clock = deps.clock ?? realClock;

  let token = '';
  try {
    const body = await req.json() as { token?: unknown };
    token = typeof body?.token === 'string' ? body.token : '';
  } catch {
    token = '';
  }
  if (!token || !(await store.redeemKick(token, clock.now()))) return json({ error: 'not_authorised' }, 401);

  let report: DrainReport;
  try {
    report = await drain({
      store, clock, config,
      fetchImpl: deps.fetchImpl ?? fetch,
      haiku: deps.haiku?.() ?? null,
      secondJudge: deps.secondJudge?.() ?? null,
      holder: `drain-${randomUUID()}`,
      budgetMs: deps.budgetMs,
      log: (event, data) => console.log(JSON.stringify({ at: 'comp-report-decide', event, ...data })),
    });
  } catch (error) {
    console.error('comp-report decide: drain failed:', String(error).slice(0, 200));
    report = { ran: false, answered: 0, dropped: 0, requeued: 0, again: false, failed: true, byReason: {} };
  }
  console.log(JSON.stringify({ at: 'comp-report-decide', event: 'drained', ...report }));
  if (report.again) await kickDrainer(store, new URL(req.url).origin, deps.fetchImpl ?? fetch, clock.now());
  return json(report);
}
