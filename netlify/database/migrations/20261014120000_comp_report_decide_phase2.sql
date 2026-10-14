-- CR-D phase 2, before the first live call (Dispatch 10): what calibration
-- needs that the watch-mode tables don't have. The earlier migrations are
-- frozen; this one only adds, and widens two lists.
--
--   decide_requests.target_kind / fixture_id
--   judgments.target_kind / fixture_id
--                     'fixture': a fixed listing text written in code
--                     (decide/fixtures.ts), with no user data. The weekly drift
--                     check re-asks them, because the Gateway reports only
--                     "typesafe-ai/jev", never a version.
--   decide_requests.second_judge
--                     the labelled batch asks Haiku 4.5 too, on every listing,
--                     as a second judge. Its answers are judgments of their own
--                     (provider 'haiku'). The fallback is unchanged.
--   decide_requests.batch
--                     which admin batch a request belongs to: the labelled set
--                     ("labels-v1") or a week's drift check ("drift-2026-w42").
--                     Null for a link import's request.
--   decide_requests.source_url
--                     the StreetEasy page a listing's text came from, canonical
--                     (as link_reads keeps it). The labelled batch finds a
--                     listing's scrubbed text by it here, in the decision
--                     layer's own table, so it never reads the observations.
--   decide_probes     the go/no-go call: one fixed request with no user data,
--                     sent once, its raw response kept. One row per call.
--   usage             the system may read the decision layer's own rows, as it
--                     may already write them: the readout's cost, when a
--                     session's key (CR_DECIDE_KEY) reads it as the system.
--
-- All of it is written by the system and read by the system and admins, like
-- its neighbours. Agents see none of it.

alter table comp_report.decide_requests
  drop constraint decide_requests_target_kind_check,
  add constraint decide_requests_target_kind_check check (target_kind in ('property_observation', 'fixture')),
  add column fixture_id text check (fixture_id is null or fixture_id ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  add constraint decide_requests_fixture_check check ((target_kind = 'fixture') = (fixture_id is not null)),
  add column second_judge boolean not null default false,
  add column batch text check (batch is null or batch ~ '^[a-z0-9][a-z0-9._-]{0,47}$'),
  add column source_url text check (source_url is null or (source_url ~ '^https://streeteasy\.com/[^?#[:space:]]+$' and length(source_url) <= 500));

create index decide_requests_source_url_idx on comp_report.decide_requests (source_url, id) where source_url is not null;

create index decide_requests_batch_idx on comp_report.decide_requests (batch, id) where batch is not null;
-- A week's drift check asks each fixture once, however many times it's started.
create unique index decide_requests_fixture_batch_idx on comp_report.decide_requests (batch, fixture_id) where fixture_id is not null;

alter table comp_report.judgments
  drop constraint judgments_target_kind_check,
  add constraint judgments_target_kind_check check (target_kind in ('property_observation', 'report_comp', 'fixture')),
  add column fixture_id text check (fixture_id is null or fixture_id ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  add constraint judgments_fixture_check check ((target_kind = 'fixture') = (fixture_id is not null));

create index judgments_fixture_idx on comp_report.judgments (fixture_id, question_id, provider, id) where fixture_id is not null;

create table comp_report.decide_probes (
  id                bigint generated always as identity primary key,
  -- Whether every question came back answered: the go/no-go.
  ok                boolean not null,
  -- answered | unanswered | no-key | busy | busy-<status> | network | malformed | http-<status> | zdr-required
  outcome           text not null check (outcome ~ '^(answered|unanswered|no-key|busy|network|malformed|zdr-required|busy-[0-9]{3}|http-[0-9]{3})$'),
  status            integer,
  ms                integer check (ms is null or ms >= 0),
  provider          text not null default 'jev' check (provider in ('jev')),
  model             text,
  zdr               boolean not null,
  registry_version  text not null,
  fixture_id        text not null check (fixture_id ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  wire_ids          text[] not null,
  unanswered        text[] not null default '{}',
  -- The body as it came back, cut at 64 KiB: what the parser gets pinned to.
  raw               text check (raw is null or length(raw) <= 65536),
  answers           jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  created_by        text not null
);

create index decide_probes_created_idx on comp_report.decide_probes (created_at desc);

create trigger decide_probes_stamp_insert before insert on comp_report.decide_probes
  for each row execute function comp_report.stamp_insert();
create trigger decide_probes_refuse_change before update or delete on comp_report.decide_probes
  for each row execute function comp_report.refuse_change();
create trigger decide_probes_refuse_truncate before truncate on comp_report.decide_probes
  for each statement execute function comp_report.refuse_change();

alter table comp_report.decide_probes enable row level security;
alter table comp_report.decide_probes force row level security;

create policy decide_probes_select on comp_report.decide_probes for select
  using (comp_report.is_system() or comp_report.is_admin());
create policy decide_probes_insert on comp_report.decide_probes for insert
  with check (comp_report.is_system());

-- Only decision-layer rows, only as the system: the twin of usage_insert_decide.
create policy usage_select_decide on comp_report.usage for select
  using (comp_report.is_system() and purpose like 'decide:%');

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'comp_report_app') then
    grant select, insert on comp_report.decide_probes to comp_report_app;
  end if;
exception when insufficient_privilege then
  raise notice 'comp_report: comp_report_app can''t be granted decide_probes from here; row-level security alone scopes access';
end
$$;
