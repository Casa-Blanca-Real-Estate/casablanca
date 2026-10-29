// Test harness: a throwaway PostgreSQL database per test file, migrated with
// the real files from netlify/database/migrations/ — applied, as on Netlify,
// by a database owner that is NOT a superuser (Neon's owner roles aren't), so
// the tests see the same row-level security behaviour production will.
//
// CR_TEST_DATABASE_URL must point at a server where that URL's user can create
// roles and databases (a local superuser, or CI's postgres service). Tests
// that need it skip themselves when it isn't set.
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const MIGRATIONS_DIR = join(repo, 'netlify', 'database', 'migrations');

export const TEST_DATABASE_URL = process.env.CR_TEST_DATABASE_URL;
// Locally, no database means these tests skip. In CI it means the workflow is
// broken, and a skipped security test must not read as a pass.
if (!TEST_DATABASE_URL && process.env.CI) {
  throw new Error('CR_TEST_DATABASE_URL is not set in CI: the row-level security tests would silently skip');
}
export const skipWithoutDatabase = TEST_DATABASE_URL
  ? false
  : 'set CR_TEST_DATABASE_URL to a PostgreSQL server the tests may create databases on';

/** Netlify's naming rule for migrations: <number>_<slug>, sorted lexicographically. */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_[a-z0-9_-]+\.sql$/.test(f))
    .sort();
}

function urlFor(base: string, user: string, database: string): string {
  const u = new URL(base);
  u.username = user;
  u.password = '';
  u.pathname = `/${database}`;
  return u.toString();
}

/** A pool on a test database. Dropping the database ends its connections
 *  from the server side; listened for, that's not an uncaught exception. */
export function testPool(connectionString: string, max = 4): pg.Pool {
  const pool = new pg.Pool({ connectionString, max });
  pool.on('error', () => undefined);
  return pool;
}

export interface TestDatabase {
  name: string;
  owner: string;
  /** Connects as the database owner — how Netlify's functions are expected to connect. */
  ownerUrl: string;
  urlAs(role: string): string;
  admin: pg.Client;
  drop(): Promise<void>;
}

/**
 * ownerCanCreateRoles: true models a Neon owner (CREATEROLE, so the migration
 * sets up comp_report_app); false models a platform that doesn't allow it,
 * leaving FORCE ROW LEVEL SECURITY to do the scoping alone.
 */
export async function createTestDatabase(opts: { ownerCanCreateRoles?: boolean; migrate?: boolean } = {}): Promise<TestDatabase> {
  if (!TEST_DATABASE_URL) throw new Error('CR_TEST_DATABASE_URL is not set');
  const canCreateRoles = opts.ownerCanCreateRoles ?? true;
  const owner = canCreateRoles ? 'cr_test_owner' : 'cr_test_owner_plain';
  const name = `cr_test_${randomBytes(6).toString('hex')}`;

  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  // Roles are cluster-wide: create them once and keep them between runs.
  await admin.query(`do $$ begin
      if not exists (select 1 from pg_roles where rolname = '${owner}') then
        create role ${owner} login ${canCreateRoles ? 'createrole' : 'nocreaterole'};
      end if;
    end $$`);
  // comp_report_app (and Dispatch 23's comp_report_inspect) is cluster-wide too. If an earlier owner created it, give
  // this owner the ADMIN a creator would have had, so the migration can set it
  // up the way it does on a fresh Neon database.
  if (canCreateRoles) {
    await admin.query(`do $$ begin
        if exists (select 1 from pg_roles where rolname = 'comp_report_app') then
          grant comp_report_app to ${owner} with admin option;
        end if;
        if exists (select 1 from pg_roles where rolname = 'comp_report_inspect') then
          grant comp_report_inspect to ${owner} with admin option;
        end if;
      end $$`);
  }
  await admin.query(`create database ${name} owner ${owner}`);

  const ownerUrl = urlFor(TEST_DATABASE_URL, owner, name);
  if (opts.migrate ?? true) {
    const client = new pg.Client({ connectionString: ownerUrl });
    await client.connect();
    try {
      // As Netlify's runner does: each file whole, in its own transaction.
      for (const file of migrationFiles()) {
        await client.query('begin');
        await client.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
        await client.query('commit');
      }
    } finally {
      await client.end();
    }
  }

  return {
    name,
    owner,
    ownerUrl,
    urlAs: (role: string) => urlFor(TEST_DATABASE_URL, role, name),
    admin,
    async drop() {
      await admin.query(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}
