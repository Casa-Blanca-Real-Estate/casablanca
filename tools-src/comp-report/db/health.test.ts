// The setup-state endpoint: what it reports in each state, and that it
// reports nothing else.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { handleHealth } from '../server/api/health.ts';
import type { PoolLike } from '../server/db.ts';
import { createTestDatabase, skipWithoutDatabase, testPool, type TestDatabase } from './testing.ts';

const identityOff = (async () => new Response('Not found', { status: 404 })) as unknown as typeof fetch;
const identityOn = (async () => Response.json({ disable_signup: false, autoconfirm: false, external: { google: true, email: true } })) as unknown as typeof fetch;
const autoconfirmOn = (async () => Response.json({ disable_signup: false, autoconfirm: true, external: { google: true, email: true } })) as unknown as typeof fetch;
const identityBroken = (async () => new Response('Bad gateway', { status: 502 })) as unknown as typeof fetch;
const get = (deps: Parameters<typeof handleHealth>[1]) => handleHealth(new Request('https://site/api/comp-report/health'), deps).then((r) => r.json());

describe('health, without a database', () => {
  test('says what is missing', async () => {
    const body = await get({ pool: null, identityUrl: 'https://site/.netlify/identity', fetchImpl: identityOff });
    assert.deepEqual(body.database, { state: 'not_configured' });
    assert.deepEqual(body.identity, { state: 'not_enabled' });
  });
  test('reads Identity\'s setup when it is on', async () => {
    const body = await get({ pool: null, identityUrl: 'https://site/.netlify/identity', fetchImpl: identityOn });
    assert.deepEqual(body.identity, { state: 'enabled', openRegistration: true, google: true });
  });

  test('autoconfirm is a setup error, not a flag', async () => {
    const body = await get({ pool: null, identityUrl: 'https://site/.netlify/identity', fetchImpl: autoconfirmOn });
    assert.equal(body.identity.state, 'setup_error');
    assert.equal(body.identity.errors.length, 1);
    assert.match(body.identity.errors[0], /^Autoconfirm is on/);
    assert.match(body.identity.errors[0], /Confirmation template/);
  });

  test('Identity answering badly is unreachable, not "not enabled"', async () => {
    const body = await get({ pool: null, identityUrl: 'https://site/.netlify/identity', fetchImpl: identityBroken });
    assert.deepEqual(body.identity, { state: 'unreachable' });
  });
});

describe('health, with a database', { skip: skipWithoutDatabase }, () => {
  let db: TestDatabase;
  let bare: TestDatabase;
  before(async () => {
    db = await createTestDatabase();
    bare = await createTestDatabase({ migrate: false });
  });
  after(async () => {
    await db?.drop();
    await bare?.drop();
  });

  test('ready, with requests on the least-privilege role; and nothing but setup state', async () => {
    const pool = testPool(db.ownerUrl, 1);
    try {
      const body = await get({ pool: pool as unknown as PoolLike, identityUrl: 'x', fetchImpl: identityOff });
      assert.deepEqual(body.database, { state: 'ready', leastPrivilege: true });
      assert.deepEqual(Object.keys(body).sort(), ['assistant', 'database', 'identity']);
    } finally {
      await pool.end();
    }
  });

  test('not migrated', async () => {
    const pool = testPool(bare.ownerUrl, 1);
    try {
      assert.deepEqual((await get({ pool: pool as unknown as PoolLike, identityUrl: 'x', fetchImpl: identityOff })).database, { state: 'not_migrated' });
    } finally {
      await pool.end();
    }
  });
});
