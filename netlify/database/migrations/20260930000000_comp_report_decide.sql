-- CR-D phase 1 (Dispatch 10): the decision layer's tables. Jev, with a Haiku
-- 4.5 fallback, reads public listing text and returns typed judgments; in
-- phase 1 every one of them lands as "watch": recorded, never shown.
--
--   decide_requests   the durable queue, which is also the drop ledger: one
--                     row per request (one listing's questions, both option
--                     orders), ending answered or dropped with a named reason
--   decide_runtime    one row: the drainer's lease, the shared pacing and
--                     cool-down, and the one-use token that starts a drainer
--   judgments         design §12: every Jev or fallback answer, per question,
--                     with both orders' probabilities, the verdict, how it
--                     landed, and the state and option-order hashes
--   usage             (CR-1's table) gains a policy so the drainer, a system
--                     actor, can record its calls — Jev at its own price
--
-- All of it is written by the system only (the drainer and the enqueue), and
-- read by the system and admins. Agents see none of it: nothing is shown to
-- agents in this dispatch. Earlier migrations are frozen; this one only adds.

create table comp_report.decide_requests (
  id               bigint generated always as identity primary key,
  lane             text not null check (lane in ('listing')),
  target_kind      text not null check (target_kind in ('property_observation')),
  observation_id   bigint references comp_report.property_observations (id),
  question_ids     text[] not null check (cardinality(question_ids) >= 1),
  wire_questions   integer not null check (wire_questions >= 1),
  registry_version text not null,
  state            jsonb not null,
  state_hash       text not null check (state_hash ~ '^[0-9a-f]{64}$'),
  user_email       text,
  status           text not null default 'queued' check (status in ('queued', 'running', 'answered', 'dropped')),
  drop_reason      text check (drop_reason is null or drop_reason ~ '^(no-key|queue-full|retries-exhausted|network|malformed|unanswered|out-of-time|http-[0-9]{3})$'),
  claimed_by       text,
  attempts         integer not null default 0 check (attempts >= 0),
  requeues         integer not null default 0 check (requeues >= 0),
  last_status      integer,
  not_before       timestamptz not null,
  enqueued_at      timestamptz not null,
  finished_at      timestamptz,
  provider         text check (provider is null or provider in ('jev', 'haiku')),
  model            text,
  unanswered       text[] not null default '{}',
  detail           jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  created_by       text not null,
  updated_at       timestamptz not null default now(),
  updated_by       text not null,
  check ((target_kind = 'property_observation') = (observation_id is not null)),
  -- A request ends one of two ways, and a drop always has its reason. An
  -- answered request carries "unanswered" when some of its questions came back
  -- without an answer (a 200 missing some).
  check (
    (status in ('queued', 'running') and drop_reason is null and finished_at is null)
    or (status = 'answered' and (drop_reason is null or drop_reason = 'unanswered') and finished_at is not null)
    or (status = 'dropped' and drop_reason is not null and finished_at is not null)
  ),
  check ((status = 'running') = (claimed_by is not null))
);

create index decide_requests_queue_idx on comp_report.decide_requests (not_before, id) where status = 'queued';
create index decide_requests_running_idx on comp_report.decide_requests (claimed_by) where status = 'running';
create index decide_requests_observation_idx on comp_report.decide_requests (observation_id);

create table comp_report.decide_runtime (
  id             smallint primary key default 1 check (id = 1),
  lease_holder   text,
  lease_until    timestamptz,
  next_start_at  timestamptz not null default '-infinity',
  cool_until     timestamptz not null default '-infinity',
  kick_hash      text,
  kick_until     timestamptz,
  updated_at     timestamptz not null default now(),
  updated_by     text not null default 'migration'
);

-- The one row, before its triggers exist (a migration has no actor).
insert into comp_report.decide_runtime (id) values (1);

create table comp_report.judgments (
  id                 bigint generated always as identity primary key,
  request_id         bigint not null references comp_report.decide_requests (id),
  target_kind        text not null check (target_kind in ('property_observation', 'report_comp')),
  observation_id     bigint references comp_report.property_observations (id),
  report_comp_id     uuid references comp_report.report_comps (id),
  lane               text not null check (lane in ('listing')),
  question_id        text not null,
  question_version   integer not null check (question_version >= 1),
  question_type      text not null check (question_type in ('choice', 'boolean', 'score')),
  registry_version   text not null,
  provider           text not null check (provider in ('jev', 'haiku')),
  model              text,              -- as the provider reported serving it
  answer             text,
  probability        double precision check (probability is null or (probability >= 0 and probability <= 1)),
  order_stable       boolean not null,
  probabilities      jsonb not null,    -- {"fwd": {...}, "rev": {...}} or {"once": {...}}
  vendor_confidence  jsonb not null default '{}',
  band               text not null check (band in ('high', 'middling', 'low', 'ask', 'unsure')),
  landed             text not null check (landed in ('watch', 'applied', 'suggested', 'asked')),
  bar                text not null,     -- 'uncalibrated', or the bar's evidence pointer
  state_hash         text not null check (state_hash ~ '^[0-9a-f]{64}$'),
  option_order_hash  text not null check (option_order_hash ~ '^[0-9a-f]{64}$'),
  created_at         timestamptz not null default now(),
  created_by         text not null,
  check ((target_kind = 'property_observation') = (observation_id is not null)),
  check ((target_kind = 'report_comp') = (report_comp_id is not null)),
  -- Nothing lands above watch without a measured bar (§7.1).
  check (landed = 'watch' or bar <> 'uncalibrated')
);

create index judgments_observation_idx on comp_report.judgments (observation_id, question_id);
create index judgments_question_idx on comp_report.judgments (question_id, provider, created_at);
create index judgments_request_idx on comp_report.judgments (request_id);

-- ── Triggers ────────────────────────────────────────────────────────────────

create trigger decide_requests_stamp_insert before insert on comp_report.decide_requests
  for each row execute function comp_report.stamp_insert_mutable();
create trigger decide_requests_stamp_update before update on comp_report.decide_requests
  for each row execute function comp_report.stamp_update();

create function comp_report.stamp_runtime() returns trigger
  language plpgsql
  as $$
begin
  new.updated_at := now();
  new.updated_by := comp_report.actor();
  if new.updated_by is null then
    raise exception 'comp_report: no actor for a write to % (call comp_report.enter first)', tg_table_name;
  end if;
  return new;
end
$$;
create trigger decide_runtime_stamp_update before update on comp_report.decide_runtime
  for each row execute function comp_report.stamp_runtime();

create trigger judgments_stamp_insert before insert on comp_report.judgments
  for each row execute function comp_report.stamp_insert();
create trigger judgments_refuse_change before update or delete on comp_report.judgments
  for each row execute function comp_report.refuse_change();
create trigger judgments_refuse_truncate before truncate on comp_report.judgments
  for each statement execute function comp_report.refuse_change();
create trigger decide_requests_refuse_delete before delete on comp_report.decide_requests
  for each row execute function comp_report.refuse_change();
create trigger decide_requests_refuse_truncate before truncate on comp_report.decide_requests
  for each statement execute function comp_report.refuse_change();

-- ── Row-level security ──────────────────────────────────────────────────────

alter table comp_report.decide_requests enable row level security;
alter table comp_report.decide_runtime  enable row level security;
alter table comp_report.judgments       enable row level security;
alter table comp_report.decide_requests force row level security;
alter table comp_report.decide_runtime  force row level security;
alter table comp_report.judgments       force row level security;

create policy decide_requests_select on comp_report.decide_requests for select
  using (comp_report.is_system() or comp_report.is_admin());
create policy decide_requests_insert on comp_report.decide_requests for insert
  with check (comp_report.is_system());
create policy decide_requests_update on comp_report.decide_requests for update
  using (comp_report.is_system()) with check (comp_report.is_system());

create policy decide_runtime_select on comp_report.decide_runtime for select
  using (comp_report.is_system() or comp_report.is_admin());
create policy decide_runtime_update on comp_report.decide_runtime for update
  using (comp_report.is_system()) with check (comp_report.is_system());

create policy judgments_select on comp_report.judgments for select
  using (comp_report.is_system() or comp_report.is_admin());
create policy judgments_insert on comp_report.judgments for insert
  with check (comp_report.is_system());

-- The drainer records its own calls. Only decision-layer rows, only as the system.
create policy usage_insert_decide on comp_report.usage for insert
  with check (comp_report.is_system() and provider in ('jev', 'anthropic') and purpose like 'decide:%');

-- ── The least-privilege role ────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'comp_report_app') then
    grant select, insert, update on comp_report.decide_requests to comp_report_app;
    grant select, update on comp_report.decide_runtime to comp_report_app;
    grant select, insert on comp_report.judgments to comp_report_app;
  end if;
exception when insufficient_privilege then
  raise notice 'comp_report: comp_report_app can''t be granted the decision tables from here; row-level security alone scopes access';
end
$$;
