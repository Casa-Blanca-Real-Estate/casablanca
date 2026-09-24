// DEV ONLY — applies netlify/database/migrations/ to a LOCAL database for
// `npm run dev:comp-report`. On Netlify the platform applies migrations
// itself at deploy; this never runs there. It works the way Netlify's runner
// does (@netlify/database-dev): each file whole, in its own transaction,
// recorded by name in netlify.migrations.
//
//   createdb comp_report_dev
//   CR_LOCAL_DATABASE_URL=postgres://you@localhost/comp_report_dev npm run db:local
//
// Refuses anything that isn't on this machine, and any database holding
// tables it didn't create — so it can't touch a shared or foreign database
// (in the Claude Code cloud environment, DATABASE_URL is another project's).
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS_DIR, migrationFiles } from '../db/testing.ts';

const url = process.env.CR_LOCAL_DATABASE_URL;
if (!url) {
  console.error('Set CR_LOCAL_DATABASE_URL to a local PostgreSQL database.');
  process.exit(2);
}
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  console.error(`Refusing: ${host} isn't this machine. Netlify applies migrations to its own databases on deploy.`);
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const foreign = await client.query<{ t: string }>(
    `select table_schema || '.' || table_name as t from information_schema.tables
      where table_schema not in ('pg_catalog', 'information_schema', 'comp_report', 'netlify')`,
  );
  if (foreign.rowCount) {
    console.error(`Refusing: this database has tables that aren't the comp report's (${foreign.rows.slice(0, 3).map((r) => r.t).join(', ')}…).`);
    process.exit(2);
  }
  await client.query(`create schema if not exists netlify;
    create table if not exists netlify.migrations (name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await client.query<{ name: string }>('select name from netlify.migrations')).rows.map((r) => r.name));

  for (const file of migrationFiles()) {
    const name = file.replace(/\.sql$/, '');
    if (applied.has(name)) continue;
    await client.query('begin');
    await client.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    await client.query('insert into netlify.migrations (name) values ($1)', [name]);
    await client.query('commit');
    console.log(`applied ${name}`);
  }
  console.log('local database is up to date');
} finally {
  await client.end();
}
