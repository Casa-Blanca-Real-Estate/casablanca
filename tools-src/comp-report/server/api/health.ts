// GET /api/comp-report/health — is the comp report set up? Answers only
// with the state of its setup: whether the database is there and migrated,
// how requests reach it, and whether Identity is on and safely configured. No
// user data, and no query touches a user table, so it's the one comp report
// function without the per-request check: it's how Kimani and Casanova confirm
// the setup steps in docs/comp-report/cr1-setup.md worked, before anyone can
// sign in.
import type { PoolLike } from '../db.ts';
import { allowMethods, json, respond } from '../http.ts';
import { readIdentitySettings } from '../identity.ts';

export interface HealthDeps {
  pool: PoolLike | null;
  identityUrl: string;
  fetchImpl?: typeof fetch;
}

async function database(pool: PoolLike | null) {
  if (!pool) return { state: 'not_configured' as const };
  let client;
  try {
    client = await pool.connect();
  } catch {
    return { state: 'unreachable' as const };
  }
  try {
    const { rows } = await client.query<{ ok: boolean }>(
      "select to_regprocedure('comp_report.enter(text,text,text,text)') is not null as ok",
    );
    if (!rows[0]?.ok) return { state: 'not_migrated' as const };
    await client.query('begin');
    const role = await client.query<{ db_role: string; bypasses_rls: boolean }>(
      "select db_role, bypasses_rls from comp_report.enter('system', null, null, 'health')",
    );
    await client.query('rollback');
    const r = role.rows[0];
    return {
      state: r && !r.bypasses_rls ? ('ready' as const) : ('unsafe_role' as const),
      // true: requests run as comp_report_app; false: as the connecting role, scoped by FORCE RLS alone.
      leastPrivilege: r?.db_role === 'comp_report_app',
    };
  } catch {
    await client.query('rollback').catch(() => undefined);
    return { state: 'error' as const };
  } finally {
    client.release();
  }
}

// A setting that makes the comp report unsafe is a setup error, not a flag.
const AUTOCONFIRM_ON =
  'Autoconfirm is on: Identity confirms password sign-ups without checking the inbox, so anyone could ' +
  'sign up as any casa-blanca.com address. The comp report refuses every password sign-in until it is ' +
  'off: Identity > Emails > Confirmation template > Configure, and untick the box.';

async function identity(url: string, fetchImpl: typeof fetch) {
  let settings;
  try {
    settings = await readIdentitySettings(url, fetchImpl);
  } catch {
    return { state: 'unreachable' as const };
  }
  if (!settings) return { state: 'not_enabled' as const };
  const setup = { openRegistration: settings.openRegistration, google: settings.google };
  if (settings.autoconfirm) return { state: 'setup_error' as const, errors: [AUTOCONFIRM_ON], ...setup };
  return { state: 'enabled' as const, ...setup };
}

export function handleHealth(req: Request, deps: HealthDeps): Promise<Response> {
  return respond(async () => {
    allowMethods(req, 'GET');
    const [db, id] = await Promise.all([database(deps.pool), identity(deps.identityUrl, deps.fetchImpl ?? fetch)]);
    return json({ database: db, identity: id, assistant: { configured: Boolean(process.env.ANTHROPIC_API_KEY) } });
  });
}
