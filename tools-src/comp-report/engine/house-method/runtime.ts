// Is the engine running under a test runner?
//
// The one place the engine reads ambient state, and only to refuse: the
// test-only house method (made-up magnitudes that exercise the arithmetic)
// must never load in the app or a function (§6.6). Node's test runner sets
// NODE_TEST_CONTEXT in every test process; Vitest sets VITEST. A browser has
// no process at all, and a Netlify function sets neither — so both refuse.

type Env = Record<string, string | undefined>;

function processEnv(): Env | undefined {
  const g = globalThis as { process?: { env?: Env } };
  return g.process?.env;
}

/** `env` defaults to this process's environment; null means there is none (a browser). */
export function isTestRuntime(env: Env | null = processEnv() ?? null): boolean {
  if (!env) return false;
  return Boolean(env['NODE_TEST_CONTEXT']) || env['VITEST'] === 'true';
}
