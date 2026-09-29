-- CR-3a (Dispatch 07): what the walkthrough scaffold needs beyond CR-1's
-- first slice. The earlier migrations are frozen; this one only adds.
--
--   imports                   each StreetEasy export added to a report: the
--                             file as uploaded, its parser version and warnings
--                             (design §12). The file lives in the row for now;
--                             §12 puts it in Blobs, which CR-3 proper can do.
--   reports.sample_data       set once any sample value is filled in, so the
--                             report is badged as a sample and never passes for
--                             a real one (Dispatch 07, "Sample prefill")
--   reasons.sample            a tier reason the sample filled in, so it shows
--                             labelled "Sample" like every other sample value
--   messages.prompt_version   which system prompt and tool set a turn ran
--                             under. A conversation keeps its first version:
--                             changing either under an existing conversation
--                             would invalidate its thinking blocks (§8.3 rule 5)
--
-- Intake, the brief, the call, the target and deal terms go in the report's
-- existing columns (brief, agent_call, target, state).

create table comp_report.imports (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references comp_report.reports (id),
  filename        text check (filename is null or length(filename) between 1 and 255),
  format          text not null check (format in ('csv', 'xlsx')),
  content         bytea not null check (octet_length(content) between 1 and 5242880),
  content_sha256  text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  as_of           date not null,   -- when the export was pulled: every value's as-of date
  parser_version  text not null,
  export_schema   text not null,
  comp_count      integer not null check (comp_count >= 0),
  warnings        jsonb not null default '[]',
  sample          boolean not null default false,   -- Hannah's export, from the sample button
  created_at      timestamptz not null default now(),
  created_by      text not null
);

create index imports_report_idx on comp_report.imports (report_id, created_at);

create trigger imports_stamp_insert before insert on comp_report.imports
  for each row execute function comp_report.stamp_insert();
create trigger imports_refuse_change before update or delete on comp_report.imports
  for each row execute function comp_report.refuse_change();
create trigger imports_refuse_truncate before truncate on comp_report.imports
  for each statement execute function comp_report.refuse_change();

alter table comp_report.imports enable row level security;
alter table comp_report.imports force row level security;

create policy imports_select on comp_report.imports for select
  using (comp_report.can_see_report(report_id));
create policy imports_insert on comp_report.imports for insert
  with check (comp_report.actor_email() is not null and comp_report.can_see_report(report_id));

-- CR-1 left property_observations.import_id waiting for this table.
alter table comp_report.property_observations
  add constraint observations_import_fk foreign key (import_id) references comp_report.imports (id);

alter table comp_report.reports add column sample_data boolean not null default false;

alter table comp_report.reasons add column sample boolean not null default false;

alter table comp_report.messages add column prompt_version text;

-- The least-privilege role (CR-1) needs the new table too. Skipped where the
-- role doesn't exist or can't be granted to, as in the first migration.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'comp_report_app') then
    grant select, insert on comp_report.imports to comp_report_app;
  end if;
exception when insufficient_privilege then
  raise notice 'comp_report: comp_report_app can''t be granted imports from here; row-level security alone scopes access';
end
$$;
