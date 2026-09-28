-- Comp report — foundations (Dispatch 05, CR-1). The first slice of design §12:
-- users, allowlist, properties, property_observations, reports, report_comps,
-- reasons, messages, usage — in their own schema, comp_report.
--
-- Netlify applies this on deploy (netlify/database/migrations/, checksummed):
-- never edit it once it has shipped anywhere, preview branches included —
-- write a new migration instead.
--
-- HOW ACCESS WORKS
-- Every request runs in a transaction that starts with comp_report.enter(),
-- which records who is asking — transaction-local settings, so a pooled
-- connection never carries them into the next request:
--   cr.kind          'user' (a signed-in person) or 'system' (the server's own
--                    bookkeeping, e.g. provisioning a user at first sign-in)
--   cr.email         the verified user's email          (user requests)
--   cr.role          agent | mentor | admin | external  (user requests)
--   cr.system_actor  what the system is doing           (system requests)
-- Row-level security reads those settings on every table. FORCE ROW LEVEL
-- SECURITY makes the policies bind the tables' owner too, so they hold
-- whichever database role the functions connect as — unless that role has
-- BYPASSRLS, and enter() reports that so the server can refuse to run.
-- Where the connecting role is allowed to create roles, enter() also drops to
-- comp_report_app, which can read and insert but never delete, truncate or
-- change the schema.
--
-- Nothing unset gets through: with no settings a request is nobody, and no
-- policy admits nobody. Every row records when it was created and by whom —
-- set by triggers from the same settings, not by application code (§4.9).

create schema comp_report;

-- ── Who is asking ───────────────────────────────────────────────────────────

create function comp_report.actor_kind() returns text
  language sql stable
  as $$ select nullif(current_setting('cr.kind', true), '') $$;

create function comp_report.actor_email() returns text
  language sql stable
  as $$ select case when comp_report.actor_kind() = 'user'
                    then nullif(current_setting('cr.email', true), '') end $$;

create function comp_report.actor_role() returns text
  language sql stable
  as $$ select case when comp_report.actor_kind() = 'user'
                    then nullif(current_setting('cr.role', true), '') end $$;

create function comp_report.is_system() returns boolean
  language sql stable
  as $$ select coalesce(comp_report.actor_kind() = 'system', false) $$;

create function comp_report.is_admin() returns boolean
  language sql stable
  as $$ select coalesce(comp_report.actor_role() = 'admin', false) $$;

-- The name written into created_by / updated_by: an email, or system:<what>.
create function comp_report.actor() returns text
  language sql stable
  as $$ select case comp_report.actor_kind()
                 when 'user' then comp_report.actor_email()
                 when 'system' then 'system:' || coalesce(nullif(current_setting('cr.system_actor', true), ''), 'unspecified')
               end $$;

-- Starts a request. Call first, inside the request's transaction.
create function comp_report.enter(p_kind text, p_email text, p_role text, p_system_actor text)
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
  else
    raise exception 'comp_report.enter: kind must be user or system';
  end if;

  perform set_config('cr.kind', p_kind, true);
  perform set_config('cr.email', coalesce(p_email, ''), true);
  perform set_config('cr.role', coalesce(p_role, ''), true);
  perform set_config('cr.system_actor', coalesce(p_system_actor, ''), true);

  -- Least privilege where the platform allows it; otherwise FORCE RLS alone.
  begin
    perform set_config('role', 'comp_report_app', true);
  exception when others then
    null;
  end;

  return query
    select current_user::text, r.rolbypassrls from pg_roles r where r.rolname = current_user;
end
$$;

-- ── Stamping and append-only ────────────────────────────────────────────────

create function comp_report.stamp_insert() returns trigger
  language plpgsql
  as $$
begin
  new.created_at := now();
  new.created_by := comp_report.actor();
  if new.created_by is null then
    raise exception 'comp_report: no actor for a write to % (call comp_report.enter first)', tg_table_name;
  end if;
  return new;
end
$$;

create function comp_report.stamp_insert_mutable() returns trigger
  language plpgsql
  as $$
begin
  new.created_at := now();
  new.created_by := comp_report.actor();
  if new.created_by is null then
    raise exception 'comp_report: no actor for a write to % (call comp_report.enter first)', tg_table_name;
  end if;
  new.updated_at := new.created_at;
  new.updated_by := new.created_by;
  return new;
end
$$;

create function comp_report.stamp_update() returns trigger
  language plpgsql
  as $$
begin
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.updated_by := comp_report.actor();
  if new.updated_by is null then
    raise exception 'comp_report: no actor for a write to % (call comp_report.enter first)', tg_table_name;
  end if;
  return new;
end
$$;

create function comp_report.refuse_change() returns trigger
  language plpgsql
  as $$
begin
  raise exception 'comp_report.% is append-only: add a new row instead', tg_table_name;
end
$$;

-- ── Tables ──────────────────────────────────────────────────────────────────

-- Users are keyed by email (§13), so leaving Netlify Identity is a re-login,
-- not a migration. capability is scaffolded for the training gate (§11).
create table comp_report.users (
  email             text primary key check (email = lower(btrim(email)) and position('@' in email) > 1),
  name              text,
  identity_provider text,
  identity_id       text,
  role              text not null default 'agent' check (role in ('agent', 'mentor', 'admin', 'external')),
  status            text not null default 'active' check (status in ('active', 'disabled')),
  capability        text not null default 'full' check (capability in ('practice', 'full')),
  unlocked_by       text,
  unlocked_reason   text,
  unlocked_at       timestamptz,
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  created_by        text not null,
  updated_at        timestamptz not null default now(),
  updated_by        text not null
);

-- Authorised people who aren't on Casa's domain, and role grants (admin,
-- mentor) for people who are. Revoking keeps the row.
create table comp_report.allowlist (
  email       text primary key check (email = lower(btrim(email)) and position('@' in email) > 1),
  role        text not null default 'external' check (role in ('agent', 'mentor', 'admin', 'external')),
  note        text,
  revoked_at  timestamptz,
  revoked_by  text,
  created_at  timestamptz not null default now(),
  created_by  text not null,
  updated_at  timestamptz not null default now(),
  updated_by  text not null
);

-- One row per property: identity only. What was seen about it — prices, size,
-- dates, links — lives in property_observations, visible to the agent whose
-- import saw it. Sharing observations across agents waits on D-9; the identity
-- rows are shared so every import of the same unit lands on one record.
create table comp_report.properties (
  id             uuid primary key default gen_random_uuid(),
  property_key   text not null unique,   -- the parser's stable key (CR-2)
  address        text not null,
  unit           text,
  streeteasy_id  text,
  created_at     timestamptz not null default now(),
  created_by     text not null
);

create table comp_report.reports (
  id             uuid primary key default gen_random_uuid(),
  owner_email    text not null references comp_report.users (email),
  title          text not null check (length(btrim(title)) between 1 and 200),
  property_type  text not null default 'condo' check (property_type in ('condo', 'coop')),
  mode           text not null default 'full' check (mode in ('practice', 'full')),
  status         text not null default 'active' check (status in ('active', 'archived')),
  brief          jsonb not null default '{}',
  agent_call     jsonb,   -- the agent's own view of value — never shown to the assistant (§8.4)
  target         jsonb,   -- a price goal — never shown to the assistant (§8.4)
  state          jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  created_by     text not null,
  updated_at     timestamptz not null default now(),
  updated_by     text not null
);

-- Each time a property's facts were seen: which import, what they were then.
create table comp_report.property_observations (
  id           bigint generated always as identity primary key,
  property_id  uuid not null references comp_report.properties (id),
  report_id    uuid references comp_report.reports (id),
  import_id    uuid,   -- the imports table arrives with CR-3
  source       text not null check (source in ('se_export', 'se_pdf', 'listing', 'agent')),
  as_of        date,
  facts        jsonb not null,
  links        text[] not null default '{}',
  created_at   timestamptz not null default now(),
  created_by   text not null
);

-- A property in a report. Its tier changes only by recording a reason.
create table comp_report.report_comps (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references comp_report.reports (id),
  property_id     uuid not null references comp_report.properties (id),
  observation_id  bigint references comp_report.property_observations (id),
  evidence_class  text not null check (evidence_class in ('sold', 'in_contract', 'active')),
  tier            text check (tier in ('primary', 'secondary', 'excluded')),
  is_anchor       boolean not null default false,
  reviewed_at     timestamptz,
  reviewed_by     text,
  created_at      timestamptz not null default now(),
  created_by      text not null,
  updated_at      timestamptz not null default now(),
  updated_by      text not null,
  unique (report_id, property_id),
  unique (id, report_id)
);

-- Reason history per report comp, append-only; the latest is the current one.
create table comp_report.reasons (
  id              bigint generated always as identity primary key,
  report_comp_id  uuid not null,
  report_id       uuid not null,
  tier            text not null check (tier in ('primary', 'secondary', 'excluded')),
  reason          text not null check (length(btrim(reason)) > 0),
  reason_type     text not null check (reason_type in ('property', 'client', 'method')),
  actor           text not null check (actor in ('agent', 'assistant', 'jev', 'system')),
  created_at      timestamptz not null default now(),
  created_by      text not null,
  foreign key (report_comp_id, report_id) references comp_report.report_comps (id, report_id)
);

-- The assistant transcript, verbatim for replay, append-only (§8.3 rule 5).
-- in_context = false keeps a turn on the record without replaying it (a
-- refused or interrupted reply).
create table comp_report.messages (
  id           bigint generated always as identity primary key,
  report_id    uuid not null references comp_report.reports (id),
  seq          integer not null check (seq >= 1),
  role         text not null check (role in ('user', 'assistant')),
  content      jsonb not null,
  model        text,
  stop_reason  text,
  request_id   text,
  in_context   boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   text not null,
  unique (report_id, seq)
);

-- One row per model or Jev call (§8.9: log real usage from day one).
create table comp_report.usage (
  id                  bigint generated always as identity primary key,
  user_email          text not null,
  report_id           uuid references comp_report.reports (id),
  provider            text not null check (provider in ('anthropic', 'jev')),
  model               text not null,
  purpose             text not null,
  request_id          text,
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  cache_read_tokens   integer not null default 0,
  cache_write_tokens  integer not null default 0,
  estimated_cost_usd  numeric(12, 6),
  detail              jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  created_by          text not null
);

create index reports_owner_idx on comp_report.reports (owner_email, updated_at desc);
create index observations_property_idx on comp_report.property_observations (property_id, created_at desc);
create index observations_creator_idx on comp_report.property_observations (created_by);
create index report_comps_report_idx on comp_report.report_comps (report_id);
create index reasons_comp_idx on comp_report.reasons (report_comp_id, id desc);
create index messages_report_idx on comp_report.messages (report_id, seq);
create index usage_user_idx on comp_report.usage (user_email, created_at desc);

-- ── Triggers ────────────────────────────────────────────────────────────────

create trigger users_stamp_insert before insert on comp_report.users
  for each row execute function comp_report.stamp_insert_mutable();
create trigger users_stamp_update before update on comp_report.users
  for each row execute function comp_report.stamp_update();
create trigger allowlist_stamp_insert before insert on comp_report.allowlist
  for each row execute function comp_report.stamp_insert_mutable();
create trigger allowlist_stamp_update before update on comp_report.allowlist
  for each row execute function comp_report.stamp_update();
create trigger properties_stamp_insert before insert on comp_report.properties
  for each row execute function comp_report.stamp_insert();
create trigger reports_stamp_insert before insert on comp_report.reports
  for each row execute function comp_report.stamp_insert_mutable();
create trigger reports_stamp_update before update on comp_report.reports
  for each row execute function comp_report.stamp_update();
create trigger report_comps_stamp_insert before insert on comp_report.report_comps
  for each row execute function comp_report.stamp_insert_mutable();
create trigger report_comps_stamp_update before update on comp_report.report_comps
  for each row execute function comp_report.stamp_update();
create trigger observations_stamp_insert before insert on comp_report.property_observations
  for each row execute function comp_report.stamp_insert();
create trigger reasons_stamp_insert before insert on comp_report.reasons
  for each row execute function comp_report.stamp_insert();
create trigger messages_stamp_insert before insert on comp_report.messages
  for each row execute function comp_report.stamp_insert();
create trigger usage_stamp_insert before insert on comp_report.usage
  for each row execute function comp_report.stamp_insert();

-- Property identity rows never change; the four history tables are append-only.
create trigger properties_refuse_change before update or delete on comp_report.properties
  for each row execute function comp_report.refuse_change();
create trigger observations_refuse_change before update or delete on comp_report.property_observations
  for each row execute function comp_report.refuse_change();
create trigger reasons_refuse_change before update or delete on comp_report.reasons
  for each row execute function comp_report.refuse_change();
create trigger messages_refuse_change before update or delete on comp_report.messages
  for each row execute function comp_report.refuse_change();
create trigger usage_refuse_change before update or delete on comp_report.usage
  for each row execute function comp_report.refuse_change();
create trigger properties_refuse_truncate before truncate on comp_report.properties
  for each statement execute function comp_report.refuse_change();
create trigger observations_refuse_truncate before truncate on comp_report.property_observations
  for each statement execute function comp_report.refuse_change();
create trigger reasons_refuse_truncate before truncate on comp_report.reasons
  for each statement execute function comp_report.refuse_change();
create trigger messages_refuse_truncate before truncate on comp_report.messages
  for each statement execute function comp_report.refuse_change();
create trigger usage_refuse_truncate before truncate on comp_report.usage
  for each statement execute function comp_report.refuse_change();

-- A comp's tier is whatever its latest reason says (§4.6: judgment is
-- structural). Recording a reason sets it; nothing else may.
create function comp_report.guard_comp_tier() returns trigger
  language plpgsql
  as $$
begin
  if coalesce(current_setting('cr.applying_reason', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.tier is not null then
    raise exception 'comp_report: a comp arrives untiered; tier it by recording a reason';
  end if;
  if tg_op = 'UPDATE' and new.tier is distinct from old.tier then
    raise exception 'comp_report: a comp''s tier changes only by recording a reason';
  end if;
  return new;
end
$$;

create trigger report_comps_guard_tier before insert or update on comp_report.report_comps
  for each row execute function comp_report.guard_comp_tier();

create function comp_report.apply_reason() returns trigger
  language plpgsql
  as $$
declare
  changed integer;
begin
  perform set_config('cr.applying_reason', 'on', true);
  update comp_report.report_comps
     set tier = new.tier
   where id = new.report_comp_id and report_id = new.report_id;
  get diagnostics changed = row_count;
  perform set_config('cr.applying_reason', '', true);
  if changed = 0 then
    raise exception 'comp_report: no comp % in report % visible to this request', new.report_comp_id, new.report_id;
  end if;
  return new;
end
$$;

create trigger reasons_apply after insert on comp_report.reasons
  for each row execute function comp_report.apply_reason();

-- ── Row-level security ──────────────────────────────────────────────────────

alter table comp_report.users                 enable row level security;
alter table comp_report.allowlist             enable row level security;
alter table comp_report.properties            enable row level security;
alter table comp_report.property_observations enable row level security;
alter table comp_report.reports               enable row level security;
alter table comp_report.report_comps          enable row level security;
alter table comp_report.reasons               enable row level security;
alter table comp_report.messages              enable row level security;
alter table comp_report.usage                 enable row level security;

alter table comp_report.users                 force row level security;
alter table comp_report.allowlist             force row level security;
alter table comp_report.properties            force row level security;
alter table comp_report.property_observations force row level security;
alter table comp_report.reports               force row level security;
alter table comp_report.report_comps          force row level security;
alter table comp_report.reasons               force row level security;
alter table comp_report.messages              force row level security;
alter table comp_report.usage                 force row level security;

-- Whether the request's user owns (or, as an admin, may see) a report.
create function comp_report.can_see_report(p_report_id uuid) returns boolean
  language sql stable
  as $$ select exists (
          select 1 from comp_report.reports r
           where r.id = p_report_id
             and (r.owner_email = comp_report.actor_email() or comp_report.is_admin())) $$;

-- users: provisioned and touched by the system at sign-in; a user sees their
-- own row; admins and mentors see everyone (they grant access, §11); only
-- admins change roles, status or capability.
create policy users_select on comp_report.users for select
  using (comp_report.is_system() or email = comp_report.actor_email()
         or comp_report.actor_role() in ('admin', 'mentor'));
create policy users_insert on comp_report.users for insert
  with check (comp_report.is_system());
create policy users_update on comp_report.users for update
  using (comp_report.is_system() or comp_report.is_admin())
  with check (comp_report.is_system() or comp_report.is_admin());

-- allowlist: read by the system at sign-in; managed by admins.
create policy allowlist_select on comp_report.allowlist for select
  using (comp_report.is_system() or comp_report.is_admin());
create policy allowlist_insert on comp_report.allowlist for insert
  with check (comp_report.is_admin());
create policy allowlist_update on comp_report.allowlist for update
  using (comp_report.is_admin()) with check (comp_report.is_admin());

-- properties: identity rows, readable and creatable by any signed-in user.
create policy properties_select on comp_report.properties for select
  using (comp_report.actor_email() is not null or comp_report.is_system());
create policy properties_insert on comp_report.properties for insert
  with check (comp_report.actor_email() is not null);

-- observations: the importing agent's own, and admins.
create policy observations_select on comp_report.property_observations for select
  using (created_by = comp_report.actor_email() or comp_report.is_admin());
create policy observations_insert on comp_report.property_observations for insert
  with check (comp_report.actor_email() is not null
              and (report_id is null or comp_report.can_see_report(report_id)));

-- reports: the owner, and admins (who may reassign a departing agent's reports).
create policy reports_select on comp_report.reports for select
  using (owner_email = comp_report.actor_email() or comp_report.is_admin());
create policy reports_insert on comp_report.reports for insert
  with check (owner_email = comp_report.actor_email());
create policy reports_update on comp_report.reports for update
  using (owner_email = comp_report.actor_email() or comp_report.is_admin())
  with check (owner_email = comp_report.actor_email() or comp_report.is_admin());

-- Everything inside a report follows the report.
create policy report_comps_select on comp_report.report_comps for select
  using (comp_report.can_see_report(report_id));
create policy report_comps_insert on comp_report.report_comps for insert
  with check (comp_report.can_see_report(report_id));
create policy report_comps_update on comp_report.report_comps for update
  using (comp_report.can_see_report(report_id)) with check (comp_report.can_see_report(report_id));

create policy reasons_select on comp_report.reasons for select
  using (comp_report.can_see_report(report_id));
create policy reasons_insert on comp_report.reasons for insert
  with check (comp_report.can_see_report(report_id));

create policy messages_select on comp_report.messages for select
  using (comp_report.can_see_report(report_id));
create policy messages_insert on comp_report.messages for insert
  with check (comp_report.can_see_report(report_id));

-- usage: your own calls, and admins (spend, §16 CR-7).
create policy usage_select on comp_report.usage for select
  using (user_email = comp_report.actor_email() or comp_report.is_admin());
create policy usage_insert on comp_report.usage for insert
  with check (user_email = comp_report.actor_email());

-- ── The least-privilege role, where the platform allows it ──────────────────

-- A hardening layer, never a reason to fail a deploy: if roles can't be
-- managed here, the section is skipped and FORCE ROW LEVEL SECURITY alone
-- scopes every request (enter() then simply stays the connecting role).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = current_user and (rolcreaterole or rolsuper)) then
    raise notice 'comp_report: cannot create roles here; row-level security alone scopes access';
    return;
  end if;
  begin
    if not exists (select 1 from pg_roles where rolname = 'comp_report_app') then
      create role comp_report_app nologin noinherit;
    end if;
    begin
      -- PostgreSQL 16+: the creator gets ADMIN on a new role, not SET.
      execute format('grant comp_report_app to %I with set true, inherit false', current_user);
    exception when syntax_error then
      execute format('grant comp_report_app to %I', current_user);
    end;
    grant usage on schema comp_report to comp_report_app;
    grant select, insert, update on comp_report.users, comp_report.allowlist, comp_report.reports,
      comp_report.report_comps to comp_report_app;
    grant select, insert on comp_report.properties, comp_report.property_observations,
      comp_report.reasons, comp_report.messages, comp_report.usage to comp_report_app;
  exception when insufficient_privilege then
    raise notice 'comp_report: comp_report_app exists but can''t be granted from here; row-level security alone scopes access';
  end;
end
$$;
