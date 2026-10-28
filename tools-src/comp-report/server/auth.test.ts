// The access rule, the Identity check and the sign-up gate — no database.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { accessConfig, decide, normalizeEmail } from './access.ts';
import { handleMe } from './api/me.ts';
import { handleIdentityEvent } from './identity-events.ts';
import { bearerToken, IdentityUnavailable, netlifyIdentityVerifier, readIdentitySettings, type IdentityUser } from './identity.ts';
import { requireUser, type AuthDeps } from './session.ts';

const casa = accessConfig({ CR_ADMIN_EMAILS: 'Kimani@Casa-Blanca.com' });

describe('the access rule', () => {
  test('Casa agents, allowlisted outsiders and admins get in; nobody else does', () => {
    assert.deepEqual(decide('ana@casa-blanca.com', casa, null), { allowed: true, role: 'agent', via: 'domain' });
    assert.deepEqual(decide('kimani@casa-blanca.com', casa, null), { allowed: true, role: 'admin', via: 'admin' });
    assert.deepEqual(decide('counsel@firm.com', casa, 'external'), { allowed: true, role: 'external', via: 'allowlist' });
    assert.deepEqual(decide('ben@casa-blanca.com', casa, 'mentor'), { allowed: true, role: 'mentor', via: 'allowlist' });
    assert.equal(decide('someone@gmail.com', casa, null).allowed, false);
  });

  test('admin comes from CR_ADMIN_EMAILS alone: an allowlist row saying admin grants nothing', () => {
    assert.deepEqual(decide('hannah@casa-blanca.com', casa, 'admin'), { allowed: true, role: 'agent', via: 'domain' });
    assert.deepEqual(decide('hannah@partner.com', casa, 'admin'), { allowed: false, role: null, via: null });
  });

  test('domains match exactly — a subdomain or a lookalike is not Casa', () => {
    for (const email of [
      'creative@email.casa-blanca.com',
      'x@casa-blanca.com.evil.io',
      'x@evilcasa-blanca.com',
      'x@casa-blanca.co',
    ]) {
      assert.equal(decide(email, casa, null).allowed, false, email);
    }
    const both = accessConfig({ CR_ALLOWED_DOMAINS: 'casa-blanca.com, email.casa-blanca.com' });
    assert.equal(decide('creative@email.casa-blanca.com', both, null).allowed, true);
  });

  test('emails are normalised, and junk is refused', () => {
    assert.equal(normalizeEmail('  Ana@Casa-Blanca.COM '), 'ana@casa-blanca.com');
    for (const junk of ['', 'ana', 'ana@', '@casa-blanca.com', 'a b@casa-blanca.com', 'ana@casa', 42, null]) {
      assert.equal(normalizeEmail(junk), null, String(junk));
    }
  });

  test('with no domains configured, the default is casa-blanca.com only', () => {
    assert.deepEqual(accessConfig({}).domains, ['casa-blanca.com']);
  });
});

describe('verifying a session with Identity', () => {
  const identityUser = { id: 'u1', email: 'Ana@Casa-Blanca.com', confirmed_at: '2026-09-24T00:00:00Z', app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Ana Agent' } };
  const token = `h.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.s`;

  test('asks the site\'s Identity endpoint, and caches the answer briefly', async () => {
    let calls = 0;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls++;
      assert.equal(url, 'https://site.example/.netlify/identity/user');
      assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${token}`);
      return Response.json(identityUser);
    }) as unknown as typeof fetch;
    const v = netlifyIdentityVerifier('https://site.example/.netlify/identity', fetchImpl);
    const user = await v.verify(token);
    assert.deepEqual(user, { id: 'u1', email: 'ana@casa-blanca.com', confirmed: true, provider: 'google', name: 'Ana Agent' });
    await v.verify(token);
    assert.equal(calls, 1);
  });

  test('a token Identity rejects is no session; Identity being down refuses rather than trusts', async () => {
    const rejecting = netlifyIdentityVerifier('https://x', (async () => new Response('', { status: 401 })) as unknown as typeof fetch);
    assert.equal(await rejecting.verify(token), null);
    const down = netlifyIdentityVerifier('https://x', (async () => new Response('', { status: 502 })) as unknown as typeof fetch);
    await assert.rejects(down.verify(token), IdentityUnavailable);
    const limited = netlifyIdentityVerifier('https://x', (async () => new Response('', { status: 429 })) as unknown as typeof fetch);
    await assert.rejects(limited.verify(token), IdentityUnavailable);
    const unreachable = netlifyIdentityVerifier('https://x', (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch);
    await assert.rejects(unreachable.verify(token), IdentityUnavailable);
  });

  test("reads whether Identity makes password sign-ups confirm their address, and caches it briefly", async () => {
    const settings = (body: unknown, status = 200) => {
      let calls = 0;
      const fetchImpl = (async (url: string) => {
        calls++;
        assert.equal(url, 'https://site.example/.netlify/identity/settings');
        return typeof body === 'string' ? new Response(body, { status }) : Response.json(body, { status });
      }) as unknown as typeof fetch;
      return { verifier: netlifyIdentityVerifier('https://site.example/.netlify/identity', fetchImpl), calls: () => calls };
    };
    const off = settings({ autoconfirm: false, disable_signup: false, external: { google: true } });
    assert.equal(await off.verifier.emailConfirmationRequired(), true);
    assert.equal(await off.verifier.emailConfirmationRequired(), true);
    assert.equal(off.calls(), 1);
    assert.equal(await settings({ autoconfirm: true }).verifier.emailConfirmationRequired(), false);
    assert.equal(await settings({ disable_signup: false }).verifier.emailConfirmationRequired(), false, 'a missing field fails closed');
    await assert.rejects(settings('Not found', 404).verifier.emailConfirmationRequired(), IdentityUnavailable);
    await assert.rejects(settings('Bad gateway', 502).verifier.emailConfirmationRequired(), IdentityUnavailable);
    const unreachable = netlifyIdentityVerifier('https://x', (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch);
    await assert.rejects(unreachable.emailConfirmationRequired(), IdentityUnavailable);
  });

  test('the settings reader: not enabled is null, anything unexpected is unavailable', async () => {
    const reply = (body: string, status: number) => (async () => new Response(body, { status })) as unknown as typeof fetch;
    assert.equal(await readIdentitySettings('https://x', reply('Not found', 404)), null);
    await assert.rejects(readIdentitySettings('https://x', reply('<html>', 200)), IdentityUnavailable);
    assert.deepEqual(
      await readIdentitySettings('https://x', (async () => Response.json({ autoconfirm: false, disable_signup: true, external: { google: false } })) as unknown as typeof fetch),
      { autoconfirm: false, openRegistration: false, google: false },
    );
  });

  test('only an Authorization: Bearer header counts', () => {
    const req = (h: Record<string, string>) => new Request('https://x/api', { headers: h });
    assert.equal(bearerToken(req({ authorization: `Bearer ${token}` })), token);
    assert.equal(bearerToken(req({ cookie: `nf_jwt=${token}` })), null);
    assert.equal(bearerToken(req({ authorization: 'Basic abc' })), null);
    assert.equal(bearerToken(req({})), null);
  });
});

function stubVerifier(users: Record<string, Partial<IdentityUser>>, confirmation: () => Promise<boolean> = async () => true) {
  return {
    async verify(token: string): Promise<IdentityUser | null> {
      const u = users[token];
      return u ? { id: 'id-' + token, email: 'x@x.com', confirmed: true, provider: 'google', name: null, ...u } as IdentityUser : null;
    },
    emailConfirmationRequired: confirmation,
  };
}

describe('the per-request check, before the database exists', () => {
  const deps: AuthDeps = {
    verifier: stubVerifier({
      'token-ana-0000000': { email: 'ana@casa-blanca.com' },
      'token-gmail-00000': { email: 'someone@gmail.com' },
      'token-unconfirmed': { email: 'new@casa-blanca.com', confirmed: false },
      'token-password-00': { email: 'ben@casa-blanca.com', provider: 'email' },
      'token-noprovider0': { email: 'cy@casa-blanca.com', provider: null },
      'token-github-0000': { email: 'dee@casa-blanca.com', provider: 'github' },
    }),
    access: casa,
    pool: null,
  };
  const call = (token?: string) =>
    handleMe(new Request('https://site/api/comp-report/me', { headers: token ? { authorization: `Bearer ${token}` } : {} }), deps);

  test('a Casa agent is admitted, not yet recorded', async () => {
    const res = await call('token-ana-0000000');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.email, 'ana@casa-blanca.com');
    assert.equal(body.user.role, 'agent');
    assert.equal(body.user.persisted, false);
    assert.equal(body.database, 'not_configured');
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  test('a non-Casa Google account is refused, whatever Identity let through', async () => {
    const res = await call('token-gmail-00000');
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'not_authorised');
  });

  test('no token, a bad token, or an unconfirmed address', async () => {
    assert.equal((await call()).status, 401);
    assert.equal((await call('token-nobody-0000')).status, 401);
    assert.equal((await call('token-unconfirmed')).status, 403);
  });

  test("Identity being unreachable is a 503, not a free pass", async () => {
    const down: AuthDeps = {
      ...deps,
      verifier: { verify: async () => { throw new IdentityUnavailable('down'); }, emailConfirmationRequired: async () => true },
    };
    const res = await handleMe(new Request('https://site/x', { headers: { authorization: 'Bearer token-ana-0000000' } }), down);
    assert.equal(res.status, 503);
  });

  test('a password account counts only while Identity requires email confirmation; Google always counts', async () => {
    assert.equal((await call('token-password-00')).status, 200);
    const users = {
      'token-ana-0000000': { email: 'ana@casa-blanca.com' },
      'token-password-00': { email: 'ben@casa-blanca.com', provider: 'email' },
    };
    const on: AuthDeps = { ...deps, verifier: stubVerifier(users, async () => false) };
    const me = (token: string, d: AuthDeps) =>
      handleMe(new Request('https://site/x', { headers: { authorization: `Bearer ${token}` } }), d);
    const refused = await me('token-password-00', on);
    assert.equal(refused.status, 403);
    assert.equal((await refused.json()).error, 'address_unverified');
    assert.equal((await me('token-ana-0000000', on)).status, 200, 'Google is unaffected');

    const settingsDown: AuthDeps = { ...deps, verifier: stubVerifier(users, async () => { throw new IdentityUnavailable('down'); }) };
    assert.equal((await me('token-password-00', settingsDown)).status, 503);
    assert.equal((await me('token-ana-0000000', settingsDown)).status, 200, 'Google never needs the settings');
  });

  test('a sign-in from any provider but Google or email is refused, even from a Casa address', async () => {
    for (const token of ['token-noprovider0', 'token-github-0000']) {
      const res = await call(token);
      assert.equal(res.status, 403, token);
      assert.equal((await res.json()).error, 'provider_not_allowed', token);
    }
  });

  test('requireUser itself refuses outsiders', async () => {
    await assert.rejects(
      requireUser(new Request('https://x', { headers: { authorization: 'Bearer token-gmail-00000' } }), deps),
      (e: { status?: number }) => e.status === 403,
    );
  });
});

describe('the sign-up and log-in gate, before the database exists', () => {
  const gate = (email: unknown, event = 'signup') =>
    handleIdentityEvent(
      new Request('https://site/.netlify/functions/identity-signup', {
        method: 'POST',
        body: JSON.stringify({ event, user: { email, app_metadata: { provider: 'google' } } }),
      }),
      { access: casa, pool: null },
    );

  test('admits Casa and the admin list with an empty 204, so no metadata changes', async () => {
    for (const email of ['ana@casa-blanca.com', 'KIMANI@casa-blanca.com']) {
      const res = await gate(email);
      assert.equal(res.status, 204, email);
      assert.equal(await res.text(), '');
    }
  });

  test('logs each decision; a refused person’s line names only their address’s domain', async (t) => {
    const lines: string[] = [];
    t.mock.method(console, 'log', (line: string) => lines.push(line));
    await gate('ana@casa-blanca.com');
    await gate('Someone.Private@gmail.com');
    const [admitted, refused] = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    const noIp = { present: false, family: null, bucket: null };
    assert.deepEqual(admitted, { gate: 'comp-report', event: 'signup', email: 'ana@casa-blanca.com', provider: 'google', allowed: true, via: 'domain', ip: noIp });
    assert.deepEqual(refused, { gate: 'comp-report', event: 'signup', domain: 'gmail.com', provider: 'google', allowed: false, ip: noIp });
    assert.equal(lines.join('\n').includes('someone.private'), false);
  });

  test('refuses a non-Casa Google account, junk, and anything but POST', async () => {
    assert.equal((await gate('someone@gmail.com')).status, 403);
    assert.equal((await gate('someone@gmail.com', 'login')).status, 403);
    assert.equal((await gate(undefined)).status, 403);
    const get = await handleIdentityEvent(new Request('https://site/x'), { access: casa, pool: null });
    assert.equal(get.status, 405);
  });
});
