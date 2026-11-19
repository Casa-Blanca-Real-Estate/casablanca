// The Studio's keys (api/studio-keys.ts): the CMS token goes to the team, and nobody else.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { accessConfig } from './access.ts';
import { handleStudioKeys } from './api/studio-keys.ts';
import type { IdentityUser } from './identity.ts';
import type { AuthDeps } from './session.ts';

const users: Record<string, Partial<IdentityUser>> = {
  'token-admin-00000': { email: 'kimani@casa-blanca.com' },
  'token-team-000000': { email: 'creative@email.casa-blanca.com' },
  'token-agent-00000': { email: 'ana@casa-blanca.com' },
};

const deps: AuthDeps = {
  verifier: {
    async verify(token: string) {
      const u = users[token];
      return u ? { id: 'id-' + token, email: 'x@x.com', confirmed: true, provider: 'google', name: null, ...u } as IdentityUser : null;
    },
    emailConfirmationRequired: async () => true,
  },
  access: accessConfig({ CR_ADMIN_EMAILS: 'kimani@casa-blanca.com', CR_ALLOWED_DOMAINS: 'email.casa-blanca.com' }),
  pool: null,
  env: { CB_CMS_TOKEN: ' cms-secret ', CB_PICS_TOKEN: 'pics-secret' },
};

const call = (token?: string, method = 'GET') =>
  handleStudioKeys(new Request('https://site/api/studio/keys', { method, headers: token ? { 'x-studio-token': token } : {} }), deps);

describe('the Studio keys', () => {
  test('an admin and the old team list are given both tokens, not cached', async () => {
    for (const t of ['token-admin-00000', 'token-team-000000']) {
      const res = await call(t);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { cms: 'cms-secret', pics: 'pics-secret' });
      assert.equal(res.headers.get('cache-control'), 'no-store');
    }
  });

  test('the built-in list includes Derek\'s Google sign-in', async () => {
    const res = await handleStudioKeys(new Request('https://site/api/studio/keys', { headers: { 'x-studio-token': 'token-derek-00000' } }), {
      ...deps,
      verifier: { ...deps.verifier, verify: async () => ({ id: 'd', email: 'd.prestly@casa-blanca.com', confirmed: true, provider: 'google', name: null }) as IdentityUser },
    });
    assert.equal(res.status, 200);
  });

  test('an agent, a stranger and the signed-out are refused', async () => {
    assert.equal((await call('token-agent-00000')).status, 403);
    assert.equal((await call('token-nobody-0000')).status, 401);
    assert.equal((await call()).status, 401);
  });

  test('only GET', async () => {
    assert.equal((await call('token-admin-00000', 'POST')).status, 405);
  });

  test('an unset token comes back null, so the page falls back to asking', async () => {
    const res = await handleStudioKeys(new Request('https://site/api/studio/keys', { headers: { 'x-studio-token': 'token-admin-00000' } }), { ...deps, env: {} });
    assert.deepEqual(await res.json(), { cms: null, pics: null });
  });
});
