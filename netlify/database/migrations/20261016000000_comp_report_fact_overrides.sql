-- CR-7a (Dispatch 15, NW-044 a): the agent's corrections to a comp's source
-- facts. The earlier migrations are frozen; this one only adds.
--
--   report_comps.fact_overrides  a correction to StreetEasy's price, size,
--                                date or floor for this comp in this report:
--                                { "<key>": { "value", "by", "at" } }. The keys
--                                are a closed list (price, size, date, floor),
--                                checked by the comps API; `by` and `at` are
--                                stamped from the session and the clock. The
--                                engine reads an override as the agent's fact,
--                                marked "changed"; the source's value stays in
--                                the observation, so clearing a key puts it back
--
-- It's a column of report_comps, so it follows that table's row-level security
-- policies, whichever function they call.

alter table comp_report.report_comps add column fact_overrides jsonb not null default '{}'
  check (jsonb_typeof(fact_overrides) = 'object' and octet_length(fact_overrides::text) <= 2048);

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
