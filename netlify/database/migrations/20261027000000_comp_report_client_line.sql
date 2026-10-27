-- CR-8b (Dispatch 26): a comp's paragraph for the client, written on Send's
-- client step. The earlier migrations are frozen; this one only adds.
--
--   report_comps.client_line  { "text", "by", "at" }: the paragraph the email
--                             shows under the comp, for every length; `by` is
--                             agent, writer or both (the writer's draft as the
--                             agent edited it), `at` is stamped by the comps
--                             API. Null: the email falls back to the writer's
--                             lines or the Sort note, as before
--
-- It's a column of report_comps, so it follows that table's row-level security
-- policies, whichever function they call.

alter table comp_report.report_comps add column client_line jsonb
  check (client_line is null or (jsonb_typeof(client_line) = 'object' and octet_length(client_line::text) <= 4096));

-- The app role already has select, insert and update on report_comps (the
-- table's grants cover a new column). Granted again here, the same way, so a
-- database whose earlier grant failed picks it up.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'comp_report_app') then
    grant select, insert, update on comp_report.report_comps to comp_report_app;
  end if;
exception when insufficient_privilege then
  raise notice 'comp_report: comp_report_app can''t be granted report_comps from here; row-level security alone scopes access';
end
$$;
