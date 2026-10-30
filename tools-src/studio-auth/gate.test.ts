// The Studio gate on the older functions (CR-9): who gets through, and which functions carry it.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { accessConfig } from '../comp-report/server/access.ts';
import type { IdentityUser } from '../comp-report/server/identity.ts';
import type { AuthDeps } from '../comp-report/server/session.ts';
import { studioRefusal } from './gate.ts';

const users: Record<string, Partial<IdentityUser>> = {
  'token-ana-0000000': { email: 'ana@casa-blanca.com' },
  'token-erez-000000': { email: 'erez@casa-blanca.com' },
  'token-kimani-0000': { email: 'kimani@casa-blanca.com' },
  'token-gmail-00000': { email: 'someone@gmail.com' },
};
const deps: AuthDeps = {
  verifier: {
    async verify(token: string) {
      const u = users[token];
      return u ? ({ id: 'id-' + token, email: 'x@x.com', confirmed: true, provider: 'google', name: null, ...u } as IdentityUser) : null;
    },
    emailConfirmationRequired: async () => true,
  },
  access: accessConfig({ CR_ADMIN_EMAILS: 'kimani@casa-blanca.com' }),
  pool: null,
  guest: { key: 'a-guest-key-long-enough-to-count' },
  env: {},
};
const req = (token?: string) =>
  new Request('https://studio.example/.netlify/functions/claude', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
const CORS = { 'Access-Control-Allow-Origin': '*' };

describe('the gate', () => {
  test('a signed-in Casa agent, an admin and a preview guest get through', async () => {
    assert.equal(await studioRefusal(req('token-ana-0000000'), deps), null);
    assert.equal(await studioRefusal(req('token-kimani-0000'), deps), null);
    assert.equal(await studioRefusal(req('guest.a-guest-key-long-enough-to-count'), deps), null);
  });

  test('no token, an ended session, or an outside account is refused, with the function\'s CORS', async () => {
    const none = await studioRefusal(req(), deps, { headers: CORS });
    assert.equal(none?.status, 401);
    assert.equal(none?.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(((await none?.json()) as { error: string }).error, 'signed_out');
    assert.equal((await studioRefusal(req('token-unknown-000'), deps))?.status, 401);
    assert.equal((await studioRefusal(req('token-gmail-00000'), deps))?.status, 403);
    assert.equal((await studioRefusal(req('guest.not-the-key-but-long-enough'), deps))?.status, 401);
  });

  test('the token in X-Studio-Token, as studio-auth.js sends it, counts', async () => {
    const own = new Request('https://studio.example/.netlify/functions/claude', { method: 'POST', headers: { 'X-Studio-Token': 'token-ana-0000000' } });
    assert.equal(await studioRefusal(own, deps), null);
  });

  test('team-only: the old dev list, an admin and a guest; not every agent', async () => {
    const team = { team: true };
    assert.equal(await studioRefusal(req('token-erez-000000'), deps, team), null);
    assert.equal(await studioRefusal(req('token-kimani-0000'), deps, team), null);
    assert.equal(await studioRefusal(req('guest.a-guest-key-long-enough-to-count'), deps, team), null);
    const agent = await studioRefusal(req('token-ana-0000000'), deps, team);
    assert.equal(agent?.status, 403);
    assert.equal(((await agent?.json()) as { error: string }).error, 'team_only');
  });
});

// Every function is gated, or named here with the reason it isn't. A new function
// fails this test until it's one or the other.
const NOT_GATED: Record<string, string> = {
  '_lib.mjs': 'shared helpers, not an endpoint',
  'agent-store.mjs': 'the CMS: CB_CMS_TOKEN, which the roster import script uses outside a browser',
  'agent-copy.mjs': 'the CMS: CB_CMS_TOKEN',
  'agent-pics.mts': 'the profile-pic roster: CB_PICS_TOKEN, which the import script uses',
  'feedback.mts': 'the Feedback button: posting stays open; reading is the dev notebook\'s',
  'dev-notebook.mts': 'its own sign-in and keys',
  'identity-login.mts': 'called by Netlify Identity itself',
  'identity-signup.mts': 'called by Netlify Identity itself',
  'identity-validate.mts': 'called by Netlify Identity itself',
};
const GATED = [
  'agents.mts', 'brand.mts', 'claude.mts', 'copy.mts', 'img.mts', 'import.mts', 'sessions.mts', 'site.mts',
  'streeteasy.mts', 'streeteasy-import-background.mts', 'streeteasy-status.mts',
];

describe('which functions carry it', () => {
  const dir = new URL('../../netlify/functions/', import.meta.url);
  const files = readdirSync(dir).filter((f) => /\.(m?js|m?ts)$/.test(f) && !f.endsWith('.md'));

  test('every older function calls requireStudio before anything else it does', () => {
    for (const f of GATED) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      assert.match(src, /from '\.\.\/\.\.\/tools-src\/studio-auth\/production\.ts'/, f);
      assert.match(src, /await requireStudio\(req/, f);
    }
  });

  test('every function is gated, has its own check, or is named with its reason', () => {
    for (const f of files) {
      if (f.startsWith('comp-report-')) continue; // requireUser, in the comp report's own handlers
      assert.ok(GATED.includes(f) || f in NOT_GATED, `${f}: gate it (requireStudio) or say why not in NOT_GATED`);
    }
  });
});
