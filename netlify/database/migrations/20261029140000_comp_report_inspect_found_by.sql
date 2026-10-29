-- The inspect role (20261029000000) is granted link_reads column by column;
-- Hubert's finds (20261029130000) added found_by after it. The workspace load
-- selects found_by, so the inspect actor needs it too. found_by is an enum
-- ('hubert' or null); views.ts classifies it 'never' (its name reads as an email key).
-- Both earlier migrations are frozen; this one only adds the grant.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'comp_report_inspect') then
    begin
      grant select (found_by) on comp_report.link_reads to comp_report_inspect;
    exception when insufficient_privilege then
      raise notice 'comp_report: found_by can''t be granted to comp_report_inspect from here; row-level security alone scopes it';
    end;
  end if;
end
$$;
