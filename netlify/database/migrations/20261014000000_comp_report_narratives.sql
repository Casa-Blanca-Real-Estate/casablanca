-- CR-5 (Dispatch 13): the writer's drafts and the agent's emails, each pinned
-- to its numbers (design §12, narratives). The earlier migrations are frozen;
-- this one only adds.
--
--   narratives   one row per draft, append-only in effect:
--                - origin 'writer': Claude's draft. It's queued, then running,
--                  then done or failed — a background function writes it and
--                  the browser polls — and once finished it never changes.
--                - origin 'agent': the agent's own email — what they copied,
--                  or an edited draft a new write replaced. It forks from the
--                  draft it came from (parent_id; none when it came from the
--                  template) and is finished from the start.
--                Every row is pinned to what it was written from: the engine
--                version, the house method, the inputs hash and the headline
--                facts; a writer row also keeps its whole input — exactly what
--                the model was given — the model, the prompt version and its
--                usage's request id. QA's results and the agent's answers to
--                them (acknowledgments) are kept with it.
--   usage        a writer call is logged with purpose 'writer', as every call is.

create table comp_report.narratives (
  id               uuid primary key default gen_random_uuid(),
  report_id        uuid not null references comp_report.reports (id),
  parent_id        uuid references comp_report.narratives (id),
  origin           text not null check (origin in ('writer', 'agent')),
  status           text not null check (status in ('queued', 'running', 'done', 'failed')),
  length           text not null check (length in ('full', 'short', 'text')),
  result_kind      text not null check (result_kind in ('on_facts', 'with_estimates')),
  audience         text check (audience in ('buyer', 'seller')),
  -- Pinned: the numbers it was written from.
  engine_version   text not null check (length(engine_version) <= 40),
  house_method     text check (house_method is null or length(house_method) <= 100),
  inputs_hash      text not null check (length(inputs_hash) <= 100),
  headline_facts   jsonb not null,
  -- A writer draft: exactly what the model was given (workspace/writer-input.ts).
  input            jsonb check (input is null or pg_column_size(input) < 262144),
  -- writer: {headlines, sections}; agent: {headline, subject, text}.
  content          jsonb check (content is null or pg_column_size(content) < 262144),
  model            text check (model is null or length(model) <= 80),
  prompt_version   text check (prompt_version is null or length(prompt_version) <= 80),
  request_id       text check (request_id is null or length(request_id) <= 200),
  stop_reason      text check (stop_reason is null or length(stop_reason) <= 40),
  -- While it's written: characters of the draft streamed so far, for the browser to show.
  progress         integer not null default 0 check (progress >= 0),
  attempts         integer not null default 0 check (attempts >= 0),
  started_at       timestamptz,
  finished_at      timestamptz,
  error            text check (error is null or length(error) <= 40),
  error_message    text check (error_message is null or length(error_message) <= 500),
  qa               jsonb,
  acknowledgments  jsonb not null default '[]' check (jsonb_typeof(acknowledgments) = 'array'),
  -- An agent row the agent copied to send.
  copied           boolean not null default false,
  created_at       timestamptz not null default now(),
  created_by       text not null,
  updated_at       timestamptz not null default now(),
  updated_by       text not null,
  check (origin = 'writer' or (status = 'done' and input is null)),
  check (origin = 'agent' or (parent_id is null and copied = false)),
  check (status not in ('done', 'failed') or finished_at is not null or origin = 'agent')
);

create index narratives_report_idx on comp_report.narratives (report_id, created_at desc);
-- The per-person daily limit counts their writes (each is a model call).
create index narratives_creator_idx on comp_report.narratives (created_by, created_at) where origin = 'writer';
-- One write at a time per report.
create unique index narratives_one_write_idx on comp_report.narratives (report_id)
  where origin = 'writer' and status in ('queued', 'running');

-- Finished is final, and what a draft was written from never changes.
create function comp_report.narratives_guard() returns trigger
  language plpgsql
  as $$
begin
  if old.status in ('done', 'failed') then
    raise exception 'comp_report.narratives: a finished draft never changes: add a new one';
  end if;
  if new.report_id <> old.report_id or new.parent_id is distinct from old.parent_id or new.origin <> old.origin
     or new.length <> old.length or new.result_kind <> old.result_kind or new.audience is distinct from old.audience
     or new.engine_version <> old.engine_version or new.house_method is distinct from old.house_method
     or new.inputs_hash <> old.inputs_hash or new.headline_facts <> old.headline_facts
     or new.input is distinct from old.input or new.prompt_version is distinct from old.prompt_version then
    raise exception 'comp_report.narratives: what a draft was written from is pinned';
  end if;
  return new;
end
$$;

create trigger narratives_stamp_insert before insert on comp_report.narratives
  for each row execute function comp_report.stamp_insert_mutable();
create trigger narratives_guard before update on comp_report.narratives
  for each row execute function comp_report.narratives_guard();
create trigger narratives_stamp_update before update on comp_report.narratives
  for each row execute function comp_report.stamp_update();
create trigger narratives_refuse_delete before delete on comp_report.narratives
  for each row execute function comp_report.refuse_change();
create trigger narratives_refuse_truncate before truncate on comp_report.narratives
  for each statement execute function comp_report.refuse_change();

alter table comp_report.narratives enable row level security;
alter table comp_report.narratives force row level security;

-- Everything inside a report follows the report.
create policy narratives_select on comp_report.narratives for select
  using (comp_report.can_see_report(report_id));
create policy narratives_insert on comp_report.narratives for insert
  with check (comp_report.actor_email() is not null and comp_report.can_see_report(report_id));
create policy narratives_update on comp_report.narratives for update
  using (comp_report.can_see_report(report_id)) with check (comp_report.can_see_report(report_id));

-- The least-privilege role (CR-1) needs the new table too. Skipped where the
-- role doesn't exist or can't be granted to, as in the first migration.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'comp_report_app') then
    grant select, insert, update on comp_report.narratives to comp_report_app;
  end if;
exception when insufficient_privilege then
  raise notice 'comp_report: comp_report_app can''t be granted narratives from here; row-level security alone scopes access';
end
$$;
