// Admins managing the allowlist through the API, against a real PostgreSQL:
// the grant is what lets someone from outside Casa in (with the invitation
// from Netlify Identity), and changing or removing it applies on their next
// request.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { accessConfig } from '../server/access.ts';
import { handleAllowlist } from '../server/api/allowlist.ts';
import { handleMe } from '../server/api/me.ts';
import type { PoolLike } from '../server/db.ts';
import { handleIdentityEvent } from '../server/identity-events.ts';
import type { IdentityUser } from '../server/identity.ts';
import type { AuthDeps } from '../server/session.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const PEOPLE: Record<string, string> = {
  'tok-kimani-000000': 'kimani@casa-blanca.com',
  'tok-ana-000000000': 'ana@casa-blanca.com',
  'tok-counsel-00000': 'counsel@firm.com',
  'tok-hannah-000000': 'hannah@partner.com',
};

describe('the allowlist API', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let pool: pg.Pool;
  let deps: AuthDeps;

  before(async () => {
    db = await createTestDatabase();
    pool = testPool(db.ownerUrl, 4);
    deps = {
      verifier: {
        async verify(token: string) {
          const email = PEOPLE[token];
          return email ? ({ id: `id-${token}`, email, confirmed: true, provider: 'google', name: null } as IdentityUser) : null;
        },
      },
      access: accessConfig({ CR_ADMIN_EMAILS: 'kimani@casa-blanca.com' }),
      pool: pool as unknown as PoolLike,
    };
  });
  after(async () => {
    await pool.end();
    await db?.drop();
  });

  const call = (token: string, method = 'GET', body?: unknown, query = '') =>
    handleAllowlist(
      new Request(`https://site/api/comp-report/allowlist${query}`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      deps,
    );
  const roleOf = async (token: string) => {
    const res = await handleMe(new Request('https://site/api/comp-report/me', { headers: { authorization: `Bearer ${token}` } }), deps);
    return res.status === 200 ? (await res.json()).user.role : res.status;
  };

  test('only admins can read or change it', async () => {
    const agent = await call('tok-ana-000000000');
    assert.equal(agent.status, 403);
    assert.equal((await agent.json()).error, 'admins_only');
    assert.equal((await call('tok-ana-000000000', 'POST', { email: 'friend@gmail.com' })).status, 403);
    assert.equal((await call('tok-ana-000000000', 'DELETE', undefined, '?email=ana@casa-blanca.com')).status, 403);
    // An outsider isn't even signed in as far as the API is concerned.
    assert.equal((await call('tok-counsel-00000')).status, 403);
    assert.equal((await call('no-such-token-000')).status, 401);
  });

  test('a grant lets an outsider in with its role, and records who granted it', async () => {
    assert.equal(await roleOf('tok-counsel-00000'), 403);
    const res = await call('tok-kimani-000000', 'POST', { email: '  Counsel@Firm.com ', note: 'Casa counsel' });
    assert.equal(res.status, 200);
    const { entry } = await res.json();
    assert.equal(entry.email, 'counsel@firm.com');
    assert.equal(entry.role, 'external');
    assert.equal(entry.note, 'Casa counsel');
    assert.equal(entry.createdBy, 'kimani@casa-blanca.com');
    assert.equal(entry.revokedAt, null);
    assert.equal(await roleOf('tok-counsel-00000'), 'external');
  });

  test('changing the role applies on the next request', async () => {
    const res = await call('tok-kimani-000000', 'POST', { email: 'counsel@firm.com', role: 'mentor', note: 'Mentor programme' });
    assert.equal(res.status, 200);
    const { entry } = await res.json();
    assert.equal(entry.role, 'mentor');
    assert.equal(entry.createdBy, 'kimani@casa-blanca.com');
    assert.equal(await roleOf('tok-counsel-00000'), 'mentor');
  });

  test('removing a grant shuts them out on the next request; granting again restores it', async () => {
    const removed = await call('tok-kimani-000000', 'DELETE', undefined, '?email=counsel@firm.com');
    assert.equal(removed.status, 200);
    const { entry } = await removed.json();
    assert.equal(entry.revokedBy, 'kimani@casa-blanca.com');
    assert.ok(entry.revokedAt);
    assert.equal(await roleOf('tok-counsel-00000'), 403);
    assert.equal((await call('tok-kimani-000000', 'DELETE', undefined, '?email=counsel@firm.com')).status, 404);

    await call('tok-kimani-000000', 'POST', { email: 'hannah@partner.com', role: 'admin' });
    const listed = (await (await call('tok-kimani-000000')).json()).entries as { email: string; revokedAt: string | null }[];
    assert.deepEqual(listed.map((e) => [e.email, e.revokedAt === null]), [['hannah@partner.com', true], ['counsel@firm.com', false]]);

    const again = await (await call('tok-kimani-000000', 'POST', { email: 'counsel@firm.com' })).json();
    assert.equal(again.entry.revokedAt, null);
    assert.equal(again.entry.revokedBy, null);
    assert.equal(await roleOf('tok-counsel-00000'), 'external');
  });

  test('an admin by grant can manage it too, but not their own access', async () => {
    assert.equal(await roleOf('tok-hannah-000000'), 'admin');
    assert.equal((await call('tok-hannah-000000', 'POST', { email: 'photographer@studio.com' })).status, 200);
    assert.equal((await call('tok-hannah-000000', 'DELETE', undefined, '?email=hannah@partner.com')).status, 400);
    assert.equal((await call('tok-hannah-000000', 'POST', { email: 'hannah@partner.com', role: 'external' })).status, 400);
    assert.equal(await roleOf('tok-hannah-000000'), 'admin');
  });

  test('the sign-up gate reads grants made here', async () => {
    const gate = (email: string) =>
      handleIdentityEvent(
        new Request('https://site/.netlify/functions/identity-signup', {
          method: 'POST',
          body: JSON.stringify({ event: 'signup', user: { email, app_metadata: { provider: 'email' } } }),
        }),
        { access: deps.access, pool: deps.pool },
      );
    assert.equal((await gate('photographer@studio.com')).status, 204);
    assert.equal((await gate('stranger@studio.com')).status, 403);
  });

  test('bad input is refused', async () => {
    const bad = async (body: unknown) => {
      const res = await call('tok-kimani-000000', 'POST', body);
      return [res.status, (await res.json()).error];
    };
    assert.deepEqual(await bad({ email: 'not an address' }), [400, 'bad_email']);
    assert.deepEqual(await bad({ email: 'a@b.com, c@d.com' }), [400, 'bad_email']);
    assert.deepEqual(await bad({ email: 'x@y.com', role: 'owner' }), [400, 'bad_role']);
    assert.deepEqual(await bad({ email: 'x@y.com', note: 42 }), [400, 'bad_note']);
    assert.deepEqual(await bad({ email: 'x@y.com', note: 'n'.repeat(501) }), [400, 'bad_note']);
    assert.deepEqual(await bad({ email: 'kimani@casa-blanca.com' }), [400, 'own_access']);
    assert.equal((await call('tok-kimani-000000', 'DELETE')).status, 400);
    assert.equal((await call('tok-kimani-000000', 'PUT', {})).status, 405);
  });
});
