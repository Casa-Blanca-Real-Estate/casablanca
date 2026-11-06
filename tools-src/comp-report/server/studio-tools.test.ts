// Who each Studio tool is for (api/studio-tools.ts): anyone reads it, only an admin changes it,
// and a tool that needs the team's sign-in never opens wider than the team.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { accessConfig } from './access.ts';
import { handleStudioTools, type ToolBlobs } from './api/studio-tools.ts';
import type { IdentityUser } from './identity.ts';
import type { AuthDeps } from './session.ts';

const users: Record<string, string> = {
  'token-admin-00000': 'kimani@casa-blanca.com',
  'token-agent-00000': 'ana@casa-blanca.com',
};

function deps() {
  const data = new Map<string, unknown>();
  const store: ToolBlobs = {
    async get(k) { return data.has(k) ? structuredClone(data.get(k)) : null; },
    async setJSON(k, v) { data.set(k, structuredClone(v)); },
  };
  const auth: AuthDeps = {
    verifier: {
      async verify(token: string) {
        const email = users[token];
        return email ? ({ id: 'id-' + token, email, confirmed: true, provider: 'google', name: null } as IdentityUser) : null;
      },
      emailConfirmationRequired: async () => true,
    },
    access: accessConfig({ CR_ADMIN_EMAILS: 'kimani@casa-blanca.com' }),
    pool: null,
  };
  return { ...auth, store };
}

const req = (method: string, token?: string, body?: unknown) =>
  new Request('https://site/api/studio/tools', {
    method,
    headers: { ...(token ? { 'x-studio-token': token } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const levels = async (res: Response) =>
  Object.fromEntries(((await res.json()).tools as { key: string; level: string }[]).map((t) => [t.key, t.level]));

describe('the Studio tools levels', () => {
  test('signed out, anyone reads the defaults', async () => {
    const d = deps();
    const res = await handleStudioTools(req('GET'), d);
    assert.equal(res.status, 200);
    const l = await levels(res);
    assert.equal(l.closed, 'everyone');
    assert.equal(l.agentcms, 'team');
  });

  test('an admin hides a tool under construction, and puts it back', async () => {
    const d = deps();
    const set = await handleStudioTools(req('PUT', 'token-admin-00000', { key: 'forsale', level: 'admin' }), d);
    assert.equal(set.status, 200);
    assert.equal((await levels(await handleStudioTools(req('GET'), d))).forsale, 'admin');
    const tools = (await (await handleStudioTools(req('GET'), d)).json()).tools as { key: string; changedBy: string | null }[];
    assert.equal(tools.find((t) => t.key === 'forsale')?.changedBy, 'kimani@casa-blanca.com');
    await handleStudioTools(req('PUT', 'token-admin-00000', { key: 'forsale', level: null }), d);
    assert.equal((await levels(await handleStudioTools(req('GET'), d))).forsale, 'everyone');
  });

  test('the CMS never opens to everyone; a bad tool or level is refused', async () => {
    const d = deps();
    const below = await handleStudioTools(req('PUT', 'token-admin-00000', { key: 'agentcms', level: 'everyone' }), d);
    assert.equal(below.status, 400);
    assert.equal((await below.json()).error, 'below_floor');
    assert.equal((await handleStudioTools(req('PUT', 'token-admin-00000', { key: 'nope', level: 'team' }), d)).status, 400);
    assert.equal((await handleStudioTools(req('PUT', 'token-admin-00000', { key: 'closed', level: 'owner' }), d)).status, 400);
  });

  test('an agent or the signed-out can\'t change it', async () => {
    const d = deps();
    assert.equal((await handleStudioTools(req('PUT', 'token-agent-00000', { key: 'closed', level: 'admin' }), d)).status, 403);
    assert.equal((await handleStudioTools(req('PUT', undefined, { key: 'closed', level: 'admin' }), d)).status, 401);
    assert.equal((await levels(await handleStudioTools(req('GET'), d))).closed, 'everyone');
  });
});
