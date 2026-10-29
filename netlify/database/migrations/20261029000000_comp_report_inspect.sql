-- Dispatch 23 items 3–4 (CR-7f) · NW-090 a, the inspection API (NB-22 A), and
-- NW-090 b, the test user. Its own timestamp, after 22b's 20261028120000 (the
-- dispatch named 20261017000000, which would now sort before the tables this
-- reads).
--
--   the inspect actor   a third kind beside user and system. Select only, on
--                       twelve tables, through its own clause in each table's
--                       SELECT policy; in no INSERT, UPDATE or DELETE policy,
--                       and in no function a policy calls. Where roles can be
--                       managed it also runs as comp_report_inspect, which
--                       holds SELECT grants only and can't read imports.content
--                       or link_reads.extract
--   inspect-audit       the system actor that writes the API's audit rows into
--                       access_events, and reads back only its own text=1 rows
--                       (for the hourly and daily caps)
--   users.is_test       the test user's row: only on an @test.invalid address,
--                       only inserted by the system actor test-key, and never
--                       changed after insert
--   allowlist           refuses @test.invalid, so no grant can admit the test
--                       address through Identity

-- ── Who is asking: the inspect kind ────────────────────────────────────────

-- Same signature as foundations', so db.ts's migrated check still holds.
create or replace function comp_report.enter(p_kind text, p_email text, p_role text, p_system_actor text)
  returns table (db_role text, bypasses_rls boolean)
  language plpgsql
  as $$
begin
  if p_kind = 'user' then
    if p_email is null or p_email <> lower(btrim(p_email)) or position('@' in p_email) < 2 then
      raise exception 'comp_report.enter: a user request needs a normalised email';
    end if;
    if p_role is null or p_role not in ('agent', 'mentor', 'admin', 'external') then
      raise exception 'comp_report.enter: unknown role %', p_role;
    end if;
  elsif p_kind = 'system' then
    if p_system_actor is null or p_system_actor = '' then
      raise exception 'comp_report.enter: a system request names what it is doing';
    end if;
  elsif p_kind = 'inspect' then
    if p_email is not null or p_role is not null or p_system_actor is not null then
      raise exception 'comp_report.enter: an inspect request carries no email, role or system actor';
    end if;
  else
    raise exception 'comp_report.enter: kind must be user, system or inspect';
  end if;

  perform set_config('cr.kind', p_kind, true);
  perform set_config('cr.email', coalesce(p_email, ''), true);
  perform set_config('cr.role', coalesce(p_role, ''), true);
  perform set_config('cr.system_actor', coalesce(p_system_actor, ''), true);

  -- Least privilege where the platform allows it; otherwise FORCE RLS alone.
  if p_kind = 'inspect' then
    begin
      perform set_config('role', 'comp_report_inspect', true);
    exception when others then
      null;
    end;
  else
    begin
      perform set_config('role', 'comp_report_app', true);
    exception when others then
      null;
    end;
  end if;

  return query
    select current_user::text, r.rolbypassrls from pg_roles r where r.rolname = current_user;
end
$$;

-- ── The inspect actor's reads: its own clause in each SELECT policy ────────

-- Each policy is recreated as it stands after 22b, with the one clause added.
-- No function changes: can_read_report is also called from activity's insert
-- policy, so a clause inside it would open a write path.

drop policy reports_select on comp_report.reports;
create policy reports_select on comp_report.reports for select
  using (owner_email = comp_report.actor_email()
         or comp_report.actor_role() in ('admin', 'mentor')
         or comp_report.actor_kind() = 'inspect');

drop policy report_comps_select on comp_report.report_comps;
create policy report_comps_select on comp_report.report_comps for select
  using (comp_report.can_read_report(report_id) or comp_report.actor_kind() = 'inspect');

drop policy reasons_select on comp_report.reasons;
create policy reasons_select on comp_report.reasons for select
  using (comp_report.can_read_report(report_id) or comp_report.actor_kind() = 'inspect');

drop policy messages_select on comp_report.messages;
create policy messages_select on comp_report.messages for select
  using (comp_report.can_read_report(report_id) or comp_report.actor_kind() = 'inspect');

drop policy usage_select on comp_report.usage;
create policy usage_select on comp_report.usage for select
  using (user_email = comp_report.actor_email() or comp_report.is_admin() or comp_report.actor_kind() = 'inspect');

drop policy access_events_select on comp_report.access_events;
create policy access_events_select on comp_report.access_events for select
  using (comp_report.is_admin() or comp_report.actor_kind() = 'inspect');

drop policy activity_select on comp_report.activity;
create policy activity_select on comp_report.activity for select
  using (comp_report.is_admin() or user_email = comp_report.actor_email() or comp_report.actor_kind() = 'inspect');

drop policy properties_select on comp_report.properties;
create policy properties_select on comp_report.properties for select
  using (comp_report.actor_email() is not null or comp_report.is_system() or comp_report.actor_kind() = 'inspect');

drop policy observations_select on comp_report.property_observations;
create policy observations_select on comp_report.property_observations for select
  using (created_by = comp_report.actor_email() or comp_report.is_admin()
         or (report_id is not null and comp_report.can_read_report(report_id))
         or comp_report.actor_kind() = 'inspect');

drop policy imports_select on comp_report.imports;
create policy imports_select on comp_report.imports for select
  using (comp_report.can_read_report(report_id) or comp_report.actor_kind() = 'inspect');

drop policy link_reads_select on comp_report.link_reads;
create policy link_reads_select on comp_report.link_reads for select
  using (comp_report.can_read_report(report_id) or comp_report.actor_kind() = 'inspect');

drop policy geocodes_select on comp_report.geocodes;
create policy geocodes_select on comp_report.geocodes for select
  using (comp_report.actor_email() is not null or comp_report.is_system() or comp_report.actor_kind() = 'inspect');

-- ── The audit: access_events rows written by inspect-audit ─────────────────

alter table comp_report.access_events drop constraint access_events_kind_check;
alter table comp_report.access_events add constraint access_events_kind_check
  check (kind in ('gate', 'session_start', 'refused', 'viewed_other', 'viewed_list', 'signin_error', 'capability_change',
                  'inspect', 'inspect_text', 'inspect_copy'));

-- The view called, whether text=1 was asked, and for copy-to-test the new
-- report (written before the copy exists, so no foreign key).
alter table comp_report.access_events add column view text
  check (view in ('reports', 'workspace', 'comps', 'messages', 'usage', 'access', 'activity', 'health', 'copy-to-test'));
alter table comp_report.access_events add column text_flag boolean;
alter table comp_report.access_events add column target_report_id uuid;
alter table comp_report.access_events add constraint access_events_inspect_view_check
  check ((kind in ('inspect', 'inspect_text', 'inspect_copy')) = (view is not null));
alter table comp_report.access_events add constraint access_events_inspect_text_check
  check (kind not in ('inspect', 'inspect_text', 'inspect_copy') or text_flag = (kind = 'inspect_text'));

create index access_events_inspect_text_idx on comp_report.access_events (at desc) where kind = 'inspect_text';

-- 22b's insert policy excludes inspect-audit by name; this is the only policy
-- that admits it, and only for its own kinds, with no address of anyone.
create policy access_events_insert_inspect_audit on comp_report.access_events for insert
  with check (comp_report.is_system()
              and current_setting('cr.system_actor', true) = 'inspect-audit'
              and kind in ('inspect', 'inspect_text', 'inspect_copy')
              and source = 'server'
              and email is null and by_email is null and owner_email is null and domain is null);

-- What it reads back: its own text=1 rows, to count them.
create policy access_events_select_inspect_audit on comp_report.access_events for select
  using (comp_report.is_system()
         and current_setting('cr.system_actor', true) = 'inspect-audit'
         and kind = 'inspect_text');

-- ── The test user (item 4) ─────────────────────────────────────────────────

alter table comp_report.users add column is_test boolean not null default false;
alter table comp_report.users add constraint users_is_test_address_check
  check (not is_test or email like '%@test.invalid');

-- Set once, at insert: an admin can't hide a real user by flagging it.
create function comp_report.users_is_test_fixed() returns trigger
  language plpgsql
  as $$
begin
  if new.is_test is distinct from old.is_test then
    raise exception 'comp_report.users.is_test can''t be changed after insert';
  end if;
  return new;
end
$$;

create trigger users_is_test_fixed before update on comp_report.users
  for each row execute function comp_report.users_is_test_fixed();

-- Only the test-key path inserts a test user.
drop policy users_insert on comp_report.users;
create policy users_insert on comp_report.users for insert
  with check (comp_report.is_system()
              and (not is_test or current_setting('cr.system_actor', true) = 'test-key'));

-- No grant can admit the test address through Identity.
alter table comp_report.allowlist add constraint allowlist_not_test_address_check
  check (email not like '%@test.invalid');

-- ── The select-only role, where the platform allows it ─────────────────────

-- As foundations' comp_report_app: a hardening layer, never a reason to fail a
-- deploy. Without it the policies above are the guard, and views.ts never names
-- imports.content or link_reads.extract.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = current_user and (rolcreaterole or rolsuper)) then
    raise notice 'comp_report: cannot create roles here; row-level security alone scopes the inspect actor';
    return;
  end if;
  begin
    if not exists (select 1 from pg_roles where rolname = 'comp_report_inspect') then
      create role comp_report_inspect nologin noinherit;
    end if;
    begin
      execute format('grant comp_report_inspect to %I with set true, inherit false', current_user);
    exception when syntax_error then
      execute format('grant comp_report_inspect to %I', current_user);
    end;
    grant usage on schema comp_report to comp_report_inspect;
    grant select on comp_report.reports, comp_report.report_comps, comp_report.reasons, comp_report.messages,
      comp_report.usage, comp_report.access_events, comp_report.activity, comp_report.properties,
      comp_report.property_observations, comp_report.geocodes to comp_report_inspect;
    grant select (id, report_id, filename, format, content_sha256, as_of, parser_version, export_schema, comp_count,
                  warnings, sample, created_at, created_by)
      on comp_report.imports to comp_report_inspect;
    grant select (id, seq, report_id, purpose, url, status, attempts, started_at, finished_at, as_of, parser_version,
                  warnings, error, error_message, observation_id, report_comp_id, confirmed_at, confirmed_by,
                  dismissed_at, created_at, created_by, updated_at, updated_by)
      on comp_report.link_reads to comp_report_inspect;
  exception when insufficient_privilege then
    raise notice 'comp_report: comp_report_inspect exists but can''t be granted from here; row-level security alone scopes the inspect actor';
  end;
end
$$;
