-- Dispatch 22b (CR-7e) · the sign-in log (NW-091 b, casa-r12-2), the activity
-- log (NW-099), and the capability change's record (Dispatch 14's follow-up).
-- Its own timestamp: 22a shipped as 20261027120000 and 20261027130000.
--
--   access_events          who signed in, who was refused and why, what Google
--                          or Identity handed back, who read someone else's
--                          report, who loaded everyone's, who changed a level
--   activity               what each person did: the screens they were on and
--                          the errors they hit (sent by the browser, from closed
--                          lists), and what the server did for them (written by
--                          the server alone)
--   signin_error_buckets   the open doors' rate limits, per hour
--   signin_salt            a random salt per day for the IP hashes; purged with
--                          the buckets, so a day's hashes can't be reversed
--
-- No IP address is stored anywhere (CR-1.1): only its HMAC under the day's salt,
-- in the buckets. Addresses are kept only for people with a users row: a trigger
-- drops anyone else's, whatever the inserting code passes.
--
-- Both log tables are append-only. The app role has no DELETE; the only way out
-- is the three purge functions, by age (and source), as the system actor
-- log-purge (netlify/functions/comp-report-purge-logs.mts).

-- ── access_events ──────────────────────────────────────────────────────────

create table comp_report.access_events (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  kind         text not null check (kind in ('gate', 'session_start', 'refused', 'viewed_other', 'viewed_list',
                                             'signin_error', 'capability_change')),
  source       text not null check (source in ('server', 'gate', 'public')),
  event        text check (event in ('validate', 'signup', 'login', 'other')),
  provider     text check (provider in ('google', 'email', 'other')),
  allowed      boolean,
  via          text check (via in ('admin', 'allowlist', 'domain')),
  reason       text check (reason in ('not_authorised', 'disabled', 'unconfirmed', 'address_unverified', 'provider_not_allowed')),
  error        text check (error in ('access_denied', 'admin_policy_enforced', 'invalid_request', 'server_error', 'other')),
  error_code   text check (error_code in ('gate_webhook', 'signups_not_allowed', 'other')),
  capability   text check (capability in ('practice', 'full')),
  email        text,
  domain       text check (domain ~ '^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$'),
  by_email     text,
  report_id    uuid references comp_report.reports (id),
  owner_email  text,
  dedupe_key   text unique check (dedupe_key is null or dedupe_key ~ '^[0-9a-f]{64}$'),
  created_by   text not null,
  -- The open doors pair with their kinds, and carry nothing a verified request would.
  check ((kind = 'gate') = (source = 'gate')),
  check ((kind = 'signin_error') = (source = 'public')),
  check (source = 'server'
         or (by_email is null and owner_email is null and report_id is null and reason is null and capability is null)),
  check (kind <> 'signin_error' or (email is null and domain is null and allowed is null and via is null)),
  check (kind <> 'refused' or reason is not null),
  check (kind <> 'capability_change' or capability is not null),
  check (kind not in ('viewed_other') or report_id is not null)
);

create index access_events_at_idx on comp_report.access_events (at desc);
create index access_events_report_idx on comp_report.access_events (report_id, at desc) where report_id is not null;

-- Whose address is kept, and the dedupe key, decided here from the row as
-- stored, so no code path chooses either. A non-user's address never reaches
-- the key. The time is the database's.
create function comp_report.access_events_before_insert() returns trigger
  language plpgsql
  as $$
declare
  dropped text;
  subject text;
  win     integer;
begin
  new.at := now();
  new.created_by := comp_report.actor();
  if new.created_by is null then
    raise exception 'comp_report: no actor for a write to access_events (call comp_report.enter first)';
  end if;

  if new.email is not null and not exists (select 1 from comp_report.users u where u.email = new.email) then
    dropped := new.email;
    new.email := null;
  end if;
  if new.by_email is not null and not exists (select 1 from comp_report.users u where u.email = new.by_email) then
    new.by_email := null;
  end if;
  if new.owner_email is not null and not exists (select 1 from comp_report.users u where u.email = new.owner_email) then
    new.owner_email := null;
  end if;

  -- A verified request's dropped address keeps its domain. The open doors pass a
  -- domain already filtered to a closed list, or none, and it is left as given.
  if new.source = 'server' and dropped is not null then
    new.domain := lower(substr(dropped, length(dropped) - position('@' in reverse(dropped)) + 2));
  end if;
  if new.domain is not null and new.domain !~ '^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$' then
    new.domain := null;
  end if;

  new.dedupe_key := null;
  if new.kind in ('viewed_other', 'viewed_list') then
    subject := coalesce(new.by_email, '');
    win := 30 * 60;
  elsif new.kind = 'refused' then
    subject := coalesce(new.email, new.domain, '') || '|' || new.reason;
    win := 15 * 60;
  end if;
  if win is not null then
    new.dedupe_key := encode(sha256(convert_to(
      new.kind || '|' || subject || '|' || coalesce(new.report_id::text, '') || '|'
        || floor(extract(epoch from new.at) / win)::bigint::text, 'UTF8')), 'hex');
  end if;
  return new;
end
$$;

create trigger access_events_before_insert before insert on comp_report.access_events
  for each row execute function comp_report.access_events_before_insert();

-- ── activity ───────────────────────────────────────────────────────────────

-- What a row's detail may hold, per name: enums and counts, nothing else. No
-- free text, no addresses, no client names.
create function comp_report.activity_detail_ok(p_name text, p_detail jsonb) returns boolean
  language plpgsql immutable
  as $$
declare
  spec jsonb;
  k    text;
  v    jsonb;
  allowed jsonb;
begin
  if p_detail is null or jsonb_typeof(p_detail) <> 'object' or length(p_detail::text) > 500 then
    return false;
  end if;
  spec := case p_name
    when 'import.read'      then '{"format": ["csv", "xlsx", "sample"], "comps": "count"}'
    when 'comp.added'       then '{"via": ["manual", "link"], "by": ["agent", "hubert"]}'
    when 'comp.tiered'      then '{"tier": ["primary", "secondary", "excluded"], "by": ["agent", "hubert"], "starred": "bool"}'
    when 'comp.removed'     then '{"by": ["agent", "hubert"]}'
    when 'comp.restored'    then '{"by": ["agent", "hubert"]}'
    when 'call.given'       then '{"skipped": "bool", "by": ["agent", "hubert"]}'
    when 'narrative.copied' then '{"length": ["full", "short", "text"]}'
    when 'report.sent'      then '{"by": ["agent", "hubert"]}'
    else '{}'  -- screen.* and error.* carry no detail
  end::jsonb;
  for k, v in select * from jsonb_each(p_detail) loop
    allowed := spec -> k;
    if allowed is null then
      return false;
    elsif allowed = '"count"'::jsonb then
      if jsonb_typeof(v) <> 'number' or v::numeric <> floor(v::numeric) or v::numeric < 0 or v::numeric > 100000 then
        return false;
      end if;
    elsif allowed = '"bool"'::jsonb then
      if jsonb_typeof(v) <> 'boolean' then
        return false;
      end if;
    elsif not (allowed @> jsonb_build_array(v)) then
      return false;
    end if;
  end loop;
  return true;
end
$$;

create table comp_report.activity (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_email  text not null references comp_report.users (email),
  report_id   uuid references comp_report.reports (id),
  session_id  uuid,
  kind        text not null check (kind in ('screen', 'action', 'error')),
  name        text not null,
  detail      jsonb not null default '{}',
  created_by  text not null,
  check ((kind = 'screen' and name ~ '^screen\.[a-z0-9-]{1,40}$')
         or (kind = 'error' and name ~ '^error\.[a-z0-9_]{1,40}$')
         or (kind = 'action' and name in ('import.read', 'comp.added', 'comp.tiered', 'comp.removed', 'comp.restored',
                                          'call.given', 'narrative.copied', 'report.sent'))),
  check (comp_report.activity_detail_ok(name, detail))
);

create index activity_user_idx on comp_report.activity (user_email, at desc);
create index activity_report_idx on comp_report.activity (report_id, at desc) where report_id is not null;

create function comp_report.activity_before_insert() returns trigger
  language plpgsql
  as $$
begin
  new.at := now();
  new.created_by := comp_report.actor();
  if new.created_by is null then
    raise exception 'comp_report: no actor for a write to activity (call comp_report.enter first)';
  end if;
  return new;
end
$$;

create trigger activity_before_insert before insert on comp_report.activity
  for each row execute function comp_report.activity_before_insert();

-- ── The open doors' limits ─────────────────────────────────────────────────

create table comp_report.signin_salt (
  day   date primary key,
  salt  text not null check (salt ~ '^[0-9a-f]{64}$')
);

create table comp_report.signin_error_buckets (
  hour     timestamptz not null,
  scope    text not null check (scope in ('signin_error', 'gate')),
  ip_hash  text not null check (ip_hash = '*' or ip_hash ~ '^[0-9a-f]{64}$'),
  n        integer not null default 1 check (n >= 0),
  primary key (hour, scope, ip_hash)
);

-- ── Append-only, except the purge ──────────────────────────────────────────

-- Like refuse_change, but a delete goes through while a purge function has
-- cr.purging on for its own transaction.
create function comp_report.refuse_change_unless_purging() returns trigger
  language plpgsql
  as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('cr.purging', true), '') = 'on' then
    return old;
  end if;
  raise exception 'comp_report.% is append-only: add a new row instead', tg_table_name;
end
$$;

create trigger access_events_refuse_update before update on comp_report.access_events
  for each row execute function comp_report.refuse_change();
create trigger access_events_refuse_delete before delete on comp_report.access_events
  for each row execute function comp_report.refuse_change_unless_purging();
create trigger access_events_refuse_truncate before truncate on comp_report.access_events
  for each statement execute function comp_report.refuse_change();
create trigger activity_refuse_update before update on comp_report.activity
  for each row execute function comp_report.refuse_change();
create trigger activity_refuse_delete before delete on comp_report.activity
  for each row execute function comp_report.refuse_change_unless_purging();
create trigger activity_refuse_truncate before truncate on comp_report.activity
  for each statement execute function comp_report.refuse_change();

-- ── Row-level security ─────────────────────────────────────────────────────

alter table comp_report.access_events        enable row level security;
alter table comp_report.activity             enable row level security;
alter table comp_report.signin_error_buckets enable row level security;
alter table comp_report.signin_salt          enable row level security;
alter table comp_report.access_events        force row level security;
alter table comp_report.activity             force row level security;
alter table comp_report.signin_error_buckets force row level security;
alter table comp_report.signin_salt          force row level security;

-- access_events: admins read; the system writes, except the inspect actor
-- (Dispatch 23 adds that actor's own, narrower policy: policies are ORed).
-- Inserts never use RETURNING, which would need a select policy.
create policy access_events_select on comp_report.access_events for select
  using (comp_report.is_admin());
create policy access_events_insert on comp_report.access_events for insert
  with check (comp_report.is_system()
              and coalesce(current_setting('cr.system_actor', true), '') <> 'inspect-audit');

-- activity: admins read everyone's, each user their own (the rate limit's
-- count). A user inserts only screens and errors, as themselves, about a report
-- they can read; the system writes the actions. This is the one insert policy
-- that may reference can_read_report.
create policy activity_select on comp_report.activity for select
  using (comp_report.is_admin() or user_email = comp_report.actor_email());
create policy activity_insert on comp_report.activity for insert
  with check (comp_report.is_system()
              or (kind in ('screen', 'error') and user_email = comp_report.actor_email()
                  and (report_id is null or comp_report.can_read_report(report_id))));

create policy signin_error_buckets_select on comp_report.signin_error_buckets for select
  using (comp_report.is_system());
create policy signin_error_buckets_insert on comp_report.signin_error_buckets for insert
  with check (comp_report.is_system());
create policy signin_error_buckets_update on comp_report.signin_error_buckets for update
  using (comp_report.is_system()) with check (comp_report.is_system());
create policy signin_salt_select on comp_report.signin_salt for select
  using (comp_report.is_system());
create policy signin_salt_insert on comp_report.signin_salt for insert
  with check (comp_report.is_system());

-- The only delete policies on the four tables: a purge function, running as
-- the migration role, with the system actor log-purge and cr.purging on.
create policy access_events_purge_delete on comp_report.access_events for delete
  using (comp_report.is_system() and current_setting('cr.purging', true) = 'on' and current_user <> 'comp_report_app');
create policy activity_purge_delete on comp_report.activity for delete
  using (comp_report.is_system() and current_setting('cr.purging', true) = 'on' and current_user <> 'comp_report_app');
create policy signin_error_buckets_purge_delete on comp_report.signin_error_buckets for delete
  using (comp_report.is_system() and current_setting('cr.purging', true) = 'on' and current_user <> 'comp_report_app');
create policy signin_salt_purge_delete on comp_report.signin_salt for delete
  using (comp_report.is_system() and current_setting('cr.purging', true) = 'on' and current_user <> 'comp_report_app');

-- A DELETE with a WHERE reads the rows it deletes, so row-level security also asks
-- for a select policy that admits them. These admit exactly what the purge
-- delete policies do, and nothing else: no other system actor, mentor or app
-- query sees these tables through them.
create policy access_events_purge_select on comp_report.access_events for select
  using (comp_report.is_system() and current_setting('cr.purging', true) = 'on' and current_user <> 'comp_report_app');
create policy activity_purge_select on comp_report.activity for select
  using (comp_report.is_system() and current_setting('cr.purging', true) = 'on' and current_user <> 'comp_report_app');

-- ── Retention ──────────────────────────────────────────────────────────────

-- By age and source only, never by a list of kinds, so a kind added later is
-- trimmed too. The open doors' rows: 30 days. Everything else: 13 months.
create function comp_report.purge_access_events() returns integer
  language plpgsql security definer
  set search_path = comp_report, pg_temp
  as $$
declare
  n integer;
begin
  if not comp_report.is_system() or coalesce(current_setting('cr.system_actor', true), '') <> 'log-purge' then
    raise exception 'comp_report.purge_access_events: only the system actor log-purge purges';
  end if;
  perform set_config('cr.purging', 'on', true);
  delete from comp_report.access_events
   where at < now() - interval '13 months'
      or (source in ('gate', 'public') and at < now() - interval '30 days');
  get diagnostics n = row_count;
  perform set_config('cr.purging', 'off', true);
  return n;
end
$$;

create function comp_report.purge_activity() returns integer
  language plpgsql security definer
  set search_path = comp_report, pg_temp
  as $$
declare
  n integer;
begin
  if not comp_report.is_system() or coalesce(current_setting('cr.system_actor', true), '') <> 'log-purge' then
    raise exception 'comp_report.purge_activity: only the system actor log-purge purges';
  end if;
  perform set_config('cr.purging', 'on', true);
  delete from comp_report.activity where at < now() - interval '90 days';
  get diagnostics n = row_count;
  perform set_config('cr.purging', 'off', true);
  return n;
end
$$;

-- Buckets and salts older than today (UTC), so yesterday's hashes can't be reversed.
create function comp_report.purge_signin_buckets() returns integer
  language plpgsql security definer
  set search_path = comp_report, pg_temp
  as $$
declare
  n integer;
  m integer;
begin
  if not comp_report.is_system() or coalesce(current_setting('cr.system_actor', true), '') <> 'log-purge' then
    raise exception 'comp_report.purge_signin_buckets: only the system actor log-purge purges';
  end if;
  perform set_config('cr.purging', 'on', true);
  delete from comp_report.signin_error_buckets where hour < date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  get diagnostics n = row_count;
  delete from comp_report.signin_salt where day < (now() at time zone 'utc')::date;
  get diagnostics m = row_count;
  perform set_config('cr.purging', 'off', true);
  return n + m;
end
$$;

revoke all on function comp_report.purge_access_events() from public;
revoke all on function comp_report.purge_activity() from public;
revoke all on function comp_report.purge_signin_buckets() from public;

-- The least-privilege role (CR-1) needs the new tables and the purge functions.
-- Skipped where the role doesn't exist or can't be granted to, as in the first
-- migration: a plain grant would fail the deploy on such a database.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'comp_report_app') then
    grant select, insert on comp_report.access_events, comp_report.activity, comp_report.signin_salt to comp_report_app;
    grant select, insert, update on comp_report.signin_error_buckets to comp_report_app;
    grant execute on function comp_report.purge_access_events(), comp_report.purge_activity(),
      comp_report.purge_signin_buckets() to comp_report_app;
  end if;
exception when insufficient_privilege then
  raise notice 'comp_report: comp_report_app can''t be granted the logs from here; row-level security alone scopes access';
end
$$;
