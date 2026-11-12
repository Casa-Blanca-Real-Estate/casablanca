// The Make side of the lead auto-accept page: the two scenarios that carry the leads and the alerts,
// and the Gmail connection the alerts send through. Read and switched through Make's API with a user
// token (Netlify env MAKE_API_TOKEN, scopes scenarios:read, scenarios:write, connections:read) that
// never leaves the function.
//
// Make API (https://developers.make.com/api-documentation), zone us2:
//   GET  /scenarios/{id}                            { scenario: { name, isActive, isPaused, isinvalid, dlqCount, lastEdit, nextExec, … } }
//   GET  /scenarios/{id}/logs?pg[limit]=…           { scenarioLogs: [{ id, imtId, type, timestamp, status 1|2|3, displayStatus, duration, operations, … }] }
//                                                   (execution rows carry displayStatus; other rows are edits, starts, stops)
//   GET  /scenarios/{id}/executions/{executionId}   { status, error: { name, message, causeModule: { name, appName } } }
//   POST /scenarios/{id}/start, /stop               { scenario: { id, isActive } }          (scenarios:write)
//   GET  /connections/{id}                          { connection: { name, accountName, accountLabel, packageName, expire, … } }
//   POST /connections/{id}/test would verify the connection, but it needs connections:write, which this
//   token doesn't have, so the page shows what GET says (expire) and the alert scenario's own state.

export const MAKE_API = 'https://us2.make.com/api/v2';
export const MAKE_APP = 'https://us2.make.com';
export const MAKE_TEAM = 1942598;

/** The only scenarios this page reads or switches. */
export const MAKE_SCENARIOS = [
  { id: 6887314, role: 'intake' as const },   // StreetEasy Referral Lead → Auto-Accept (mailhook → the service)
  { id: 6889011, role: 'alerts' as const },   // StreetEasy Lead Alerts → Email (service webhook → Gmail from creative@)
];
export const MAKE_CONNECTION = 12126157;      // Creative Google Restricted connection (creative@), used by 6889011

const RUNS = 10;            // executions shown per scenario
const ERROR_DETAILS = 3;    // failed executions per scenario whose error message is fetched

export class MakeError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

export interface MakeRun {
  id: string; at: string | null; status: 'success' | 'warning' | 'error' | 'running' | 'paused' | 'unknown';
  duration: number | null; operations: number | null; error?: string;
}
export interface MakeScenarioView {
  id: number; role: 'intake' | 'alerts'; url: string;
  name: string | null; isActive: boolean | null; isPaused: boolean | null; isinvalid: boolean | null;
  dlqCount: number | null; lastEdit: string | null; nextExec: string | null;
  runs: MakeRun[]; problem?: string;
}
export interface MakeConnectionView {
  id: number; name: string | null; account: string | null; expire: string | null;
  /** From `expire`: true when it's in the past, false when in the future, null when Make gives none. */
  expired: boolean | null;
  /** Make's verify call needs connections:write; this token can't make it. */
  verified: null;
  usedBy: number; reconnectUrl: string; problem?: string;
}

type Fetch = typeof fetch;

/** One call to Make's API. Throws MakeError; never puts the token in a message or a log. */
async function makeCall(f: Fetch, token: string, path: string, init: RequestInit = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await f(MAKE_API + path, {
      ...init,
      headers: { Authorization: `Token ${token}`, Accept: 'application/json', ...(init.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new MakeError(502, 'make_unreachable', 'Make’s API didn’t answer. Try again in a minute.');
  }
  const body = await res.json().catch(() => null) as { message?: unknown; detail?: unknown } | null;
  if (res.status === 401 || res.status === 403) {
    throw new MakeError(502, 'make_token_refused', 'Make refused the API token, or it is missing a scope. MAKE_API_TOKEN in Netlify needs scenarios:read, scenarios:write and connections:read.');
  }
  if (res.status === 404) throw new MakeError(404, 'make_not_found', 'Make doesn’t have that scenario or connection (deleted, or in another team).');
  if (!res.ok) {
    const said = typeof body?.detail === 'string' ? body.detail : typeof body?.message === 'string' ? body.message : '';
    throw new MakeError(502, 'make_error', `Make answered ${res.status}${said ? `: ${said.slice(0, 300)}` : '.'}`);
  }
  return body;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown) => (typeof v === 'boolean' ? v : null);

function runStatus(row: Record<string, unknown>): MakeRun['status'] {
  const d = typeof row.displayStatus === 'string' ? row.displayStatus.toUpperCase() : '';
  if (d === 'SUCCESS' || row.status === 1) return 'success';
  if (d === 'WARNING' || row.status === 2) return 'warning';
  if (d === 'ERROR' || row.status === 3) return 'error';
  if (d === 'RUNNING') return 'running';
  if (d === 'WAITING' || row.eventType === 'EXECUTION_PAUSED') return 'paused';
  return 'unknown';
}

async function scenarioView(f: Fetch, token: string, s: (typeof MAKE_SCENARIOS)[number]): Promise<MakeScenarioView> {
  const view: MakeScenarioView = {
    id: s.id, role: s.role, url: `${MAKE_APP}/${MAKE_TEAM}/scenarios/${s.id}/edit`,
    name: null, isActive: null, isPaused: null, isinvalid: null, dlqCount: null, lastEdit: null, nextExec: null, runs: [],
  };
  try {
    const [detail, logs] = await Promise.all([
      makeCall(f, token, `/scenarios/${s.id}`),
      // Extra rows, since edits, starts and stops share the log with executions.
      makeCall(f, token, `/scenarios/${s.id}/logs?pg%5Blimit%5D=${RUNS * 3}&pg%5BsortDir%5D=desc`),
    ]);
    const sc = ((detail as { scenario?: Record<string, unknown> } | null)?.scenario) ?? {};
    Object.assign(view, {
      name: str(sc.name), isActive: bool(sc.isActive), isPaused: bool(sc.isPaused), isinvalid: bool(sc.isinvalid),
      dlqCount: num(sc.dlqCount), lastEdit: str(sc.lastEdit), nextExec: str(sc.nextExec),
    });
    const rows = ((logs as { scenarioLogs?: unknown } | null)?.scenarioLogs);
    const execs = (Array.isArray(rows) ? rows : [])
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .filter((r) => typeof r.displayStatus === 'string' || typeof r.status === 'number' || r.eventType === 'EXECUTION_PAUSED')
      .slice(0, RUNS);
    view.runs = execs.map((r) => ({
      id: String(r.id ?? r.imtId ?? ''), at: str(r.timestamp), status: runStatus(r),
      duration: num(r.duration), operations: num(r.operations),
    }));
    // The error message lives on the execution's own record.
    const failed = view.runs.filter((r) => (r.status === 'error' || r.status === 'warning') && /^[A-Za-z0-9-]+$/.test(r.id)).slice(0, ERROR_DETAILS);
    await Promise.all(failed.map(async (r) => {
      try {
        const ex = await makeCall(f, token, `/scenarios/${s.id}/executions/${encodeURIComponent(r.id)}`) as { error?: { name?: unknown; message?: unknown; causeModule?: { name?: unknown; appName?: unknown } } } | null;
        const e = ex?.error;
        if (!e) return;
        const where = str(e.causeModule?.name) ?? str(e.causeModule?.appName);
        const msg = [str(e.name), str(e.message)].filter(Boolean).join(': ');
        if (msg) r.error = (where ? `${where} — ` : '') + msg.slice(0, 500);
      } catch (err) {
        if (err instanceof MakeError && err.code === 'make_token_refused') throw err;
      }
    }));
  } catch (err) {
    if (err instanceof MakeError && err.code !== 'make_token_refused') view.problem = err.message;
    else throw err;
  }
  return view;
}

async function connectionView(f: Fetch, token: string, now: number): Promise<MakeConnectionView> {
  const view: MakeConnectionView = {
    id: MAKE_CONNECTION, name: null, account: null, expire: null, expired: null, verified: null,
    usedBy: 6889011, reconnectUrl: `${MAKE_APP}/${MAKE_TEAM}/connections`,
  };
  try {
    const body = await makeCall(f, token, `/connections/${MAKE_CONNECTION}`) as { connection?: Record<string, unknown> } | null;
    const c = body?.connection ?? {};
    view.name = str(c.name);
    view.account = str(c.accountLabel) ?? str((c.metadata as { value?: unknown } | undefined)?.value) ?? str(c.accountName);
    view.expire = str(c.expire);
    const t = view.expire ? Date.parse(view.expire) : NaN;
    view.expired = Number.isFinite(t) ? t <= now : null;
  } catch (err) {
    if (err instanceof MakeError && err.code !== 'make_token_refused') view.problem = err.message;
    else throw err;
  }
  return view;
}

/** GET ?view=make: both scenarios with their recent runs, and the Gmail connection. */
export async function makeView(f: Fetch, token: string, now = Date.now()) {
  const [scenarios, connection] = await Promise.all([
    Promise.all(MAKE_SCENARIOS.map((s) => scenarioView(f, token, s))),
    connectionView(f, token, now),
  ]);
  return { scenarios, connection, checkedAt: new Date(now).toISOString() };
}

/** POST {makeScenario: {id, active}}: start or stop one of the two scenarios. */
export async function setScenarioActive(f: Fetch, token: string, id: number, active: boolean) {
  if (!MAKE_SCENARIOS.some((s) => s.id === id)) throw new MakeError(400, 'bad_scenario', 'This page only switches the lead intake and lead alert scenarios.');
  const body = await makeCall(f, token, `/scenarios/${id}/${active ? 'start' : 'stop'}`, { method: 'POST' }) as { scenario?: { isActive?: unknown } } | null;
  const isActive = typeof body?.scenario?.isActive === 'boolean' ? body.scenario.isActive : active;
  return { id, isActive };
}
