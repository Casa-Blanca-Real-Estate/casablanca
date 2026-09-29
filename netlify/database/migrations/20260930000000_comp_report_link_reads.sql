-- CR-3b phase 1 (Dispatch 09): comps and the home from StreetEasy links, and
-- comps typed in. The earlier migrations are frozen; this one only adds.
--
--   link_reads                  one row per StreetEasy page the agent asked the
--                               tool to read: queued, then running, then done or
--                               failed. A background function does the reading
--                               (Firecrawl), so the agent sees a row at once and
--                               it fills in when the read finishes. The agent's
--                               one-tap confirm of what was read is recorded here
--                               (confirmed_at): until then, the engine counts the
--                               comp in neither result (§6.2).
--   property_observations.raw   what the source itself said: a listing page's
--                               extract as Firecrawl returned it, or the fields
--                               the agent typed. The facts column keeps the
--                               parsed facts, as for an export (§12).
--   property_observations.parser_version
--                               the parser that read it
--   report_comps.evidence_class also 'off_market': a listing that came off the
--                               market unsold, "didn't sell" (§6.3, D-23). The
--                               engine counts it once CR-2.2 phase 2 lands.

alter table comp_report.report_comps drop constraint report_comps_evidence_class_check;
alter table comp_report.report_comps
  add constraint report_comps_evidence_class_check
  check (evidence_class in ('sold', 'in_contract', 'active', 'off_market'));

alter table comp_report.property_observations add column raw jsonb;
alter table comp_report.property_observations add column parser_version text;

create table comp_report.link_reads (
  id              uuid primary key default gen_random_uuid(),
  seq             bigint generated always as identity,   -- the order the links were pasted in
  report_id       uuid not null references comp_report.reports (id),
  purpose         text not null check (purpose in ('comp', 'subject')),
  -- Only StreetEasy pages, canonical: https, no query string or fragment.
  url             text not null check (url ~ '^https://streeteasy\.com/[^?#[:space:]]+$' and length(url) <= 500),
  status          text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts        integer not null default 0 check (attempts >= 0),
  started_at      timestamptz,
  finished_at     timestamptz,
  as_of           date,        -- the day the page was read: every value's as-of date
  extract         jsonb check (extract is null or pg_column_size(extract) < 262144),
  parser_version  text,
  warnings        jsonb not null default '[]',
  error           text check (error is null or length(error) <= 40),
  error_message   text check (error_message is null or length(error_message) <= 500),
  observation_id  bigint references comp_report.property_observations (id),
  report_comp_id  uuid,
  confirmed_at    timestamptz,
  confirmed_by    text,
  dismissed_at    timestamptz, -- a failed read the agent cleared from the list
  created_at      timestamptz not null default now(),
  created_by      text not null,
  updated_at      timestamptz not null default now(),
  updated_by      text not null,
  foreign key (report_comp_id, report_id) references comp_report.report_comps (id, report_id)
);

create index link_reads_report_idx on comp_report.link_reads (report_id, seq);
-- The per-user limit counts a person's reads over the last day (each costs Firecrawl credit).
create index link_reads_creator_idx on comp_report.link_reads (created_by, created_at);

create trigger link_reads_stamp_insert before insert on comp_report.link_reads
  for each row execute function comp_report.stamp_insert_mutable();
create trigger link_reads_stamp_update before update on comp_report.link_reads
  for each row execute function comp_report.stamp_update();
create trigger link_reads_refuse_delete before delete on comp_report.link_reads
  for each row execute function comp_report.refuse_change();
create trigger link_reads_refuse_truncate before truncate on comp_report.link_reads
  for each statement execute function comp_report.refuse_change();

alter table comp_report.link_reads enable row level security;
alter table comp_report.link_reads force row level security;

-- Everything inside a report follows the report.
create policy link_reads_select on comp_report.link_reads for select
  using (comp_report.can_see_report(report_id));
create policy link_reads_insert on comp_report.link_reads for insert
  with check (comp_report.actor_email() is not null and comp_report.can_see_report(report_id));
create policy link_reads_update on comp_report.link_reads for update
  using (comp_report.can_see_report(report_id)) with check (comp_report.can_see_report(report_id));

-- The least-privilege role (CR-1) needs the new table too. Skipped where the
-- role doesn't exist or can't be granted to, as in the first migration.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'comp_report_app') then
    grant select, insert, update on comp_report.link_reads to comp_report_app;
  end if;
exception when insufficient_privilege then
  raise notice 'comp_report: comp_report_app can''t be granted link_reads from here; row-level security alone scopes access';
end
$$;
