-- CR-3c (Dispatch 11): distance needs coordinates for the home and every comp
-- (§6.10). The earlier migrations are frozen; this one only adds.
--
--   geocodes                      one row per building: its mapped location,
--                                 looked up once and shared by every report and
--                                 agent. A building's location is nobody's
--                                 private data, so any signed-in request reads it.
--                                 Only the street address is sent to the
--                                 geocoder. A match counts only when its house
--                                 number, street and borough agree with ours;
--                                 anything else is refused with the reason, never
--                                 guessed. A failed lookup (a timeout, an error)
--                                 is tried again a few times, spaced out.
--   property_observations.source  also 'geocoder': each lookup is recorded on the
--                                 properties it located (§12), with the
--                                 geocoder's name and the matched address in raw.

alter table comp_report.property_observations drop constraint property_observations_source_check;
alter table comp_report.property_observations
  add constraint property_observations_source_check
  check (source in ('se_export', 'se_pdf', 'listing', 'agent', 'geocoder'));

create table comp_report.geocodes (
  -- The engine's building key: the property key without its unit.
  building_key  text primary key check (building_key ~ '^pk1\|' and length(building_key) <= 300),
  -- What was sent: the street address alone ("200 Chambers Street").
  street        text not null check (length(btrim(street)) between 1 and 200),
  -- Ours, from the address: what a match has to agree with. Null when the address doesn't say.
  borough       text check (borough in ('Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island')),
  status        text not null check (status in ('pending', 'matched', 'refused', 'failed')),
  geocoder      text not null check (length(geocoder) between 1 and 40),
  lat           double precision check (lat between -90 and 90),
  lng           double precision check (lng between -180 and 180),
  -- The geocoder's own address for its match, or for the nearest it found when refused.
  matched       text check (matched is null or length(matched) <= 300),
  -- NYC's building identification number, where the geocoder gives it.
  bin           text check (bin is null or bin ~ '^[0-9]{7}$'),
  reason        text check (reason is null or length(reason) <= 300),
  attempts      integer not null default 0 check (attempts >= 0),
  looked_up_at  timestamptz,
  created_at    timestamptz not null default now(),
  created_by    text not null,
  updated_at    timestamptz not null default now(),
  updated_by    text not null,
  check ((status = 'matched') = (lat is not null and lng is not null))
);

create trigger geocodes_stamp_insert before insert on comp_report.geocodes
  for each row execute function comp_report.stamp_insert_mutable();
create trigger geocodes_stamp_update before update on comp_report.geocodes
  for each row execute function comp_report.stamp_update();
create trigger geocodes_refuse_delete before delete on comp_report.geocodes
  for each row execute function comp_report.refuse_change();
create trigger geocodes_refuse_truncate before truncate on comp_report.geocodes
  for each statement execute function comp_report.refuse_change();

alter table comp_report.geocodes enable row level security;
alter table comp_report.geocodes force row level security;

-- A building's location is shared: any signed-in request reads and records it.
create policy geocodes_select on comp_report.geocodes for select
  using (comp_report.actor_email() is not null or comp_report.is_system());
create policy geocodes_insert on comp_report.geocodes for insert
  with check (comp_report.actor_email() is not null);
create policy geocodes_update on comp_report.geocodes for update
  using (comp_report.actor_email() is not null) with check (comp_report.actor_email() is not null);

-- The least-privilege role (CR-1) needs the new table too. Skipped where the
-- role doesn't exist or can't be granted to, as in the first migration.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'comp_report_app') then
    grant select, insert, update on comp_report.geocodes to comp_report_app;
  end if;
exception when insufficient_privilege then
  raise notice 'comp_report: comp_report_app can''t be granted geocodes from here; row-level security alone scopes access';
end
$$;
