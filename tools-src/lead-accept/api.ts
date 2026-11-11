// /api/lead-accept — the Studio's window onto the StreetEasy lead auto-accept service.
//
// The service runs on Railway (repo Casa-Blanca-Real-Estate/se-autoaccept): Make forwards each
// StreetEasy lead email from blancacasa1002 to it, it logs into the referral agent's account,
// clicks Respond Now and sends the pre-filled message, and emails Derek when a person is needed.
// Its admin endpoints are guarded by one shared secret, so this function holds that secret
// (Netlify env SE_AUTOMATION_SECRET) and the browser never sees it.
//
//   GET  ?view=status         observe mode, counts for the last 24 hours, the last run
//   GET  ?view=runs&limit=N   the run log, newest first (N up to 500)
//   GET  ?view=agents         the referral agents the service knows (passwords never leave Railway)
//   GET  ?capture=<name>      one run's screenshot, as PNG
//   POST {observeMode: bool}  switch observe mode; takes effect on the next lead
//   POST {agentPassword: {email, password | null}}  set or clear one agent's own StreetEasy password
//   POST {addAgent: {email, name?, password?}}      add an agent by hand (or update one that exists)
//
// SECURITY
//   Every request needs the Studio sign-in, and the user must be the Studio's team (the same rule as
//   the Property Sign builder). A preview's guest can read but not switch observe mode. Screenshots
//   show clients' names and inquiries, which is why they're fetched through here, not linked.
import { isTeam, type SignUser } from '../property-signs/api.ts';

export interface LeadAcceptDeps {
  /** The signed-in user; throws the comp report's HttpError(401/403/503) when there's none. */
  user(req: Request): Promise<SignUser>;
  /** The service's base URL, e.g. https://casablanca-production-e067.up.railway.app */
  baseUrl: string | undefined;
  secret: string | undefined;
  fetch: typeof fetch;
}

export class LeadAcceptError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message?: string) { super(message ?? code); this.status = status; this.code = code; }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

/** A capture name as the service writes them: <ISO time>_<agent id>_<step>. */
export const CAPTURE_NAME = /^[0-9TZ-]+_[a-z0-9-]+_[a-z0-9-]+$/i;

export async function handleLeadAccept(req: Request, deps: LeadAcceptDeps): Promise<Response> {
  try {
    const user = await deps.user(req);
    if (!isTeam(user)) throw new LeadAcceptError(403, 'not_team', 'The lead auto-accept page is for the Studio team.');
    if (!deps.baseUrl || !deps.secret) {
      throw new LeadAcceptError(503, 'not_configured', 'Set SE_AUTOMATION_URL and SE_AUTOMATION_SECRET in Netlify to connect this page to the service.');
    }
    const base = deps.baseUrl.replace(/\/+$/, '');
    const call = async (path: string, init: RequestInit = {}) => {
      let res: Response;
      try {
        res = await deps.fetch(base + path, {
          ...init, headers: { 'x-casa-secret': deps.secret!, ...(init.headers as Record<string, string> | undefined) },
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        throw new LeadAcceptError(502, 'unreachable', 'The auto-accept service didn’t answer. Check that it’s running in Railway.');
      }
      if (res.status === 401) throw new LeadAcceptError(502, 'secret_mismatch', 'The service refused the key. SE_AUTOMATION_SECRET in Netlify must match CASA_SECRET in Railway.');
      if (res.status === 404) throw new LeadAcceptError(404, 'not_found', 'The service doesn’t have that.');
      if (!res.ok) throw new LeadAcceptError(502, 'service_error', `The service answered ${res.status}.`);
      return res;
    };
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const capture = url.searchParams.get('capture');
      if (capture !== null) {
        if (!CAPTURE_NAME.test(capture)) throw new LeadAcceptError(400, 'bad_capture');
        const res = await call(`/captures/${encodeURIComponent(capture)}.png`);
        return new Response(await res.arrayBuffer(), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' } });
      }
      const view = url.searchParams.get('view') ?? 'status';
      if (view === 'status') return json(await (await call('/admin/status')).json());
      if (view === 'runs') {
        const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit')) || 200));
        return json(await (await call(`/admin/runs?limit=${limit}`)).json());
      }
      if (view === 'agents') return json(await (await call('/agents')).json());
      throw new LeadAcceptError(400, 'bad_view');
    }

    if (req.method === 'POST') {
      if (user.guest) throw new LeadAcceptError(403, 'guest', 'A preview guest can look but not change anything.');
      const body = await req.json().catch(() => null) as { observeMode?: unknown; agentPassword?: { email?: unknown; password?: unknown };
        addAgent?: { email?: unknown; name?: unknown; password?: unknown } } | null;

      // One agent's own StreetEasy password: { agentPassword: { email, password } }, or password null
      // to go back to the shared one. Passed straight to the service; never logged or returned.
      // Add an agent by hand: { addAgent: { email, name?, password? } }. The password, if any,
      // goes straight to the service and is never logged or returned.
      if (body?.addAgent) {
        const { email, name, password } = body.addAgent;
        if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) throw new LeadAcceptError(400, 'bad_email', 'Enter the agent’s StreetEasy email.');
        if (name != null && typeof name !== 'string') throw new LeadAcceptError(400, 'bad_name');
        if (password != null && password !== '' && (typeof password !== 'string' || password.length > 200)) {
          throw new LeadAcceptError(400, 'bad_password', 'The password must be text, up to 200 characters.');
        }
        const res = await call('/admin/agents', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), name: typeof name === 'string' ? name.trim() : '', password: password || null }),
        });
        console.log(`lead-accept: agent ${email.trim()} added or updated by ${user.email}${password ? ' (own password)' : ''}`);
        return json(await res.json(), res.status);
      }

      if (body?.agentPassword) {
        const { email, password } = body.agentPassword;
        if (typeof email !== 'string' || !email.includes('@')) throw new LeadAcceptError(400, 'bad_email', 'Which agent? Send their StreetEasy email.');
        if (!(password === null || (typeof password === 'string' && password.length > 0 && password.length <= 200))) {
          throw new LeadAcceptError(400, 'bad_password', 'Send a password, or null to use the shared one.');
        }
        const res = await call('/admin/agents/password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
        });
        console.log(`lead-accept: own password ${password === null ? 'cleared' : 'set'} for ${email} by ${user.email}`);
        return json(await res.json());
      }

      if (typeof body?.observeMode !== 'boolean') throw new LeadAcceptError(400, 'bad_body', 'Send { observeMode: true | false }.');
      const res = await call('/admin/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ observeMode: body.observeMode }),
      });
      console.log(`lead-accept: observe mode ${body.observeMode ? 'on' : 'off'} by ${user.email}`);
      return json(await res.json());
    }

    throw new LeadAcceptError(405, 'method');
  } catch (e) {
    if (e instanceof LeadAcceptError) return json({ error: e.code, message: e.message }, e.status);
    if (e && typeof e === 'object' && 'status' in e && 'code' in e && typeof (e as { status: unknown }).status === 'number') {
      const h = e as { status: number; code: string; message?: string };   // the comp report's HttpError, from the sign-in check
      return json({ error: h.code, message: h.message }, h.status);
    }
    console.error('lead-accept: unhandled error', e);
    return json({ error: 'internal', message: 'Something went wrong on our side.' }, 500);
  }
}
