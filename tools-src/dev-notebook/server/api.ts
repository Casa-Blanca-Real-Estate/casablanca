// /api/dev/notebook/* — the dev notebook's one function (docs/dev-notebook/README.md).
//
// Every route is in ROUTES, and every request is authenticated before its
// route runs, so a route added later can't ship ungated. Three ways in:
//
//   POST /session with an Identity token   a dev email signs in; the browser
//                                          gets a notebook session (30 days)
//   a notebook session (dns_…)             Kimani, in a browser: everything
//   a key (dnk_…)                          a Claude Code session: read,
//                                          re-status and comment — never
//                                          write a note, delete one, or
//                                          manage keys
//
// Same-origin and token-authenticated: no cookies are read, so there's
// nothing to forge cross-site, and no CORS headers.
import { bearerToken, IdentityUnavailable, type IdentityVerifier } from '../../comp-report/server/identity.ts';
import type { FeedbackItem } from '../../feedback/feedback.ts';
import { describeOpen, devEmails, PARAMS, STATUSES, TAGS } from '../vocab.ts';
import { FRESH_SIGN_IN_MS, MAX_SHOT_BYTES, NotebookError, type NotebookStore } from './store.ts';

export const BASE = '/api/dev/notebook';

export interface NotebookDeps {
  store: NotebookStore;
  verifier: IdentityVerifier;
  env: Record<string, string | undefined>;
  /** The commit this deploy was built from: stamped by the server, never taken from the browser. */
  commit: () => Promise<string | null>;
  deployId: string | null;
  now: () => number;
  /** The team Feedback button's submissions (tools-src/feedback), newest first. */
  feedback: () => Promise<FeedbackItem[]>;
}

type Principal =
  | { kind: 'session'; sid: string; email: string; signedInAt: number }
  | { kind: 'key'; id: string; label: string };

interface Ctx {
  req: Request;
  url: URL;
  deps: NotebookDeps;
  who: Principal;
  params: string[];
}

interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: RegExp;
  /** Who may call it. `identity` is sign-in itself: an Identity token, not a notebook one. */
  who: readonly ('session' | 'key')[] | 'identity';
  run: (ctx: Ctx) => Promise<Response>;
}

const NO_STORE = { 'Cache-Control': 'no-store' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...NO_STORE, 'Content-Type': 'application/json; charset=utf-8' } });
}

const fail = (status: number, code: string, message: string) => json({ error: code, message }, status);

async function readJson(req: Request, maxBytes = 64 * 1024): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new NotebookError(413, 'body_too_large', 'That request is too large.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text || '{}');
  } catch {
    throw new NotebookError(400, 'invalid_json', 'Send JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new NotebookError(400, 'invalid_body', 'Send a JSON object.');
  return parsed as Record<string, unknown>;
}

/** Who a Claude Code session says it is ("Mason"): shown in the history next to its key's name. */
function sessionName(raw: unknown, fallback: string): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s && s.length <= 40 && /^[\w .()-]+$/.test(s) ? s : fallback;
}

function actor(who: Principal, by: unknown): { by: string; via: string } {
  return who.kind === 'session' ? { by: who.email, via: 'notebook' } : { by: sessionName(by, who.label), via: `key:${who.label}` };
}

async function signIn(req: Request, deps: NotebookDeps): Promise<Response> {
  const token = bearerToken(req);
  if (!token) return fail(401, 'no_identity_token', 'Sign in with Google first.');
  const user = await deps.verifier.verify(token);
  if (!user) return fail(401, 'bad_identity_token', 'That sign-in has expired. Sign in again.');
  if (!user.confirmed) return fail(403, 'unconfirmed', 'Confirm your email address first.');
  // As the comp report decides (server/session.ts): Google proves the address; a password
  // account proves it only when Identity makes sign-ups confirm by email.
  if (user.provider !== 'google' && user.provider !== 'email') return fail(403, 'provider_not_allowed', 'Sign in with Google.');
  if (user.provider === 'email' && !(await deps.verifier.emailConfirmationRequired())) {
    return fail(403, 'unconfirmed_signups', 'Password sign-ins can’t prove an address on this site. Sign in with Google.');
  }
  if (!devEmails(deps.env).includes(user.email)) return fail(403, 'not_a_dev', 'This notebook is for the studio’s developers only.');
  const session = await deps.store.createSession(user.email, req.headers.get('user-agent'));
  return json({ ...session, email: user.email }, 201);
}

export const ROUTES: Route[] = [
  { method: 'POST', path: /^\/session$/, who: 'identity', run: async () => fail(500, 'unreachable', 'handled before routing') },
  {
    method: 'DELETE', path: /^\/session$/, who: ['session'],
    run: async ({ deps, who }) => {
      if (who.kind === 'session') await deps.store.endSession(who.sid);
      return json({ signedOut: true });
    },
  },
  {
    method: 'DELETE', path: /^\/sessions$/, who: ['session'],
    run: async ({ deps }) => json({ signedOut: await deps.store.endAllSessions() }),
  },
  {
    method: 'GET', path: /^\/me$/, who: ['session', 'key'],
    run: async ({ who }) => json(who.kind === 'session' ? { kind: 'session', email: who.email } : { kind: 'key', label: who.label }),
  },
  {
    method: 'GET', path: /^\/vocabulary$/, who: ['session', 'key'],
    run: async () => json({ tags: TAGS, statuses: STATUSES, params: PARAMS }),
  },
  {
    method: 'GET', path: /^\/notes$/, who: ['session', 'key'],
    run: async ({ url, deps }) => {
      const q = url.searchParams;
      const limit = q.get('limit') ? Number(q.get('limit')) : undefined;
      const { notes, open } = await deps.store.list({
        status: q.get('status') ?? undefined,
        tag: q.get('tag') ?? undefined,
        surface: q.get('surface') ?? undefined,
        ...(limit && Number.isFinite(limit) ? { limit } : {}),
      });
      return json({ summary: describeOpen(open), open: open.length, notes });
    },
  },
  {
    method: 'POST', path: /^\/notes$/, who: ['session'],
    run: async ({ req, deps, who }) => {
      const body = await readJson(req, 32 * 1024);
      const note = await deps.store.create(
        { body: body.body, tags: body.tags, route: body.route, params: body.params, title: body.title, context: body.context, viewport: body.viewport },
        {
          author: who.kind === 'session' ? who.email : 'unknown',
          userAgent: req.headers.get('user-agent'),
          commit: await deps.commit().catch(() => null),
          deployId: deps.deployId,
        },
      );
      return json({ note }, 201);
    },
  },
  {
    method: 'GET', path: /^\/notes\/(dn_[0-9a-z]{12})$/, who: ['session', 'key'],
    run: async ({ deps, params }) => json({ note: await deps.store.get(params[0]!) }),
  },
  {
    method: 'PATCH', path: /^\/notes\/(dn_[0-9a-z]{12})$/, who: ['session', 'key'],
    run: async ({ req, deps, params, who }) => {
      const body = await readJson(req);
      return json({ note: await deps.store.record(params[0]!, { status: body.status, note: body.note, pr: body.pr }, actor(who, body.by)) });
    },
  },
  {
    // The only delete, and the notebook page is the only thing that calls it.
    method: 'DELETE', path: /^\/notes\/(dn_[0-9a-z]{12})$/, who: ['session'],
    run: async ({ deps, params }) => {
      await deps.store.remove(params[0]!);
      return json({ deleted: params[0] });
    },
  },
  {
    method: 'POST', path: /^\/notes\/(dn_[0-9a-z]{12})\/shots$/, who: ['session'],
    run: async ({ req, deps, params }) => {
      const length = Number(req.headers.get('content-length') ?? 0);
      if (length > MAX_SHOT_BYTES) throw new NotebookError(413, 'too_large', 'Screenshots are 5 MB at most.');
      const bytes = new Uint8Array(await req.arrayBuffer());
      return json({ shot: await deps.store.addShot(params[0]!, bytes) }, 201);
    },
  },
  {
    method: 'GET', path: /^\/notes\/(dn_[0-9a-z]{12})\/shots\/(sh_[0-9a-z]{10})$/, who: ['session', 'key'],
    run: async ({ deps, params }) => {
      const shot = await deps.store.getShot(params[0]!, params[1]!);
      if (!shot) return fail(404, 'not_found', 'No such screenshot.');
      return new Response(shot.data, {
        headers: { ...NO_STORE, 'Content-Type': shot.type, 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' },
      });
    },
  },
  {
    // The team Feedback button's submissions carry names and emails: the developers read them, a key can't.
    method: 'GET', path: /^\/feedback$/, who: ['session'],
    run: async ({ deps }) => json({ feedback: await deps.feedback() }),
  },
  {
    method: 'GET', path: /^\/keys$/, who: ['session'],
    run: async ({ deps }) => json({ keys: await deps.store.listKeys() }),
  },
  {
    method: 'POST', path: /^\/keys$/, who: ['session'],
    run: async ({ req, deps, who }) => {
      // A key outlives the session that makes it, so making one needs a recent sign-in:
      // a session lifted from a browser can't mint itself a lasting way back in.
      if (who.kind === 'session' && deps.now() - who.signedInAt > FRESH_SIGN_IN_MS) {
        return fail(403, 'sign_in_again', 'To make a key, sign in again first: keys need a sign-in from the last 15 minutes.');
      }
      const body = await readJson(req);
      const key = await deps.store.createKey(String(body.label ?? ''), who.kind === 'session' ? who.email : 'unknown');
      return json({ key: { id: key.id, label: key.label }, token: key.token }, 201);
    },
  },
  {
    method: 'DELETE', path: /^\/keys\/([0-9a-z]{12})$/, who: ['session'],
    run: async ({ deps, params }) => {
      await deps.store.revokeKey(params[0]!);
      return json({ revoked: params[0] });
    },
  },
];

async function authenticate(req: Request, store: NotebookStore): Promise<Principal | null> {
  const token = bearerToken(req);
  if (!token) return null;
  if (token.startsWith('dns_')) {
    const s = await store.verifySession(token);
    return s ? { kind: 'session', ...s } : null;
  }
  if (token.startsWith('dnk_')) {
    const k = await store.verifyKey(token);
    return k ? { kind: 'key', ...k } : null;
  }
  return null;
}

export async function handleNotebook(req: Request, deps: NotebookDeps): Promise<Response> {
  try {
    const url = new URL(req.url);
    if (!url.pathname.startsWith(BASE)) return fail(404, 'not_found', 'No such route.');
    const path = url.pathname.slice(BASE.length).replace(/\/+$/, '') || '/';
    const onPath = ROUTES.filter((r) => r.path.test(path));
    const route = onPath.find((r) => r.method === req.method);
    if (!route) return onPath.length ? fail(405, 'method_not_allowed', 'Not with that method.') : fail(404, 'not_found', 'No such route.');
    if (route.who === 'identity') return await signIn(req, deps);

    const who = await authenticate(req, deps.store);
    if (!who) return fail(401, 'sign_in', 'Sign in to the notebook first.');
    if (!route.who.includes(who.kind)) return fail(403, 'not_with_a_key', 'A session key can read, re-status and comment, nothing more.');
    return await route.run({ req, url, deps, who, params: route.path.exec(path)!.slice(1) });
  } catch (error) {
    if (error instanceof NotebookError) return fail(error.status, error.code, error.message);
    if (error instanceof IdentityUnavailable) return fail(503, 'identity_unavailable', 'Sign-in can’t be checked right now. Try again shortly.');
    console.error('dev-notebook: unhandled error', error);
    return fail(500, 'internal', 'Something went wrong on our side.');
  }
}
