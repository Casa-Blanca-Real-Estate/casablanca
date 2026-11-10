-- Done's What's next, in the activity log (the wiring pass, 2026-11-06).
-- Renamed from 20261106120000 on 2026-11-10: that version was taken by the allowlist migration on
-- claude/main, and production had already applied 20261106130000, so the old name would land out of order.
--
-- Done saves its two ticks (Follow up in two days, Plan the offer together) on
-- the report as state.doneChecks. The server now logs each tick and untick as
-- an action, report.next_ticked, so a report's Access timeline shows when the
-- agent followed up. Its detail is the item's key and whether it's on: an
-- enum and a flag, no free text.
--
-- Two changes, no data touched: the detail spec learns the new name, and the
-- name check on comp_report.activity takes it. The check was unnamed in
-- 20261028120000, so it's found by what it says and replaced by a named one.

create or replace function comp_report.activity_detail_ok(p_name text, p_detail jsonb) returns boolean
  language plpgsql immutable
  as $$
declare
  spec jsonb;
  k    text;
  v    jsonb;
  allowed jsonb;
begin
  if p_detail is null or jsonb_typeof(p_detail) <> 'object' or length(p_detail::text) > 500 then
    return false;
  end if;
  spec := case p_name
    when 'import.read'       then '{"format": ["csv", "xlsx", "sample"], "comps": "count"}'
    when 'comp.added'        then '{"via": ["manual", "link"], "by": ["agent", "hubert"]}'
    when 'comp.tiered'       then '{"tier": ["primary", "secondary", "excluded"], "by": ["agent", "hubert"], "starred": "bool"}'
    when 'comp.removed'      then '{"by": ["agent", "hubert"]}'
    when 'comp.restored'     then '{"by": ["agent", "hubert"]}'
    when 'call.given'        then '{"skipped": "bool", "by": ["agent", "hubert"]}'
    when 'narrative.copied'  then '{"length": ["full", "short", "text"]}'
    when 'report.sent'       then '{"by": ["agent", "hubert"]}'
    when 'report.next_ticked' then '{"item": ["follow-up", "plan-offer"], "on": "bool"}'
    else '{}'  -- screen.* and error.* carry no detail
  end::jsonb;
  for k, v in select * from jsonb_each(p_detail) loop
    allowed := spec -> k;
    if allowed is null then
      return false;
    elsif allowed = '"count"'::jsonb then
      if jsonb_typeof(v) <> 'number' or v::numeric <> floor(v::numeric) or v::numeric < 0 or v::numeric > 100000 then
        return false;
      end if;
    elsif allowed = '"bool"'::jsonb then
      if jsonb_typeof(v) <> 'boolean' then
        return false;
      end if;
    elsif not (allowed @> jsonb_build_array(v)) then
      return false;
    end if;
  end loop;
  return true;
end
$$;

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'comp_report.activity'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%narrative.copied%'
  loop
    execute format('alter table comp_report.activity drop constraint %I', c.conname);
  end loop;
end
$$;

alter table comp_report.activity add constraint activity_name_check
  check ((kind = 'screen' and name ~ '^screen\.[a-z0-9-]{1,40}$')
         or (kind = 'error' and name ~ '^error\.[a-z0-9_]{1,40}$')
         or (kind = 'action' and name in ('import.read', 'comp.added', 'comp.tiered', 'comp.removed', 'comp.restored',
                                          'call.given', 'narrative.copied', 'report.sent', 'report.next_ticked')));
