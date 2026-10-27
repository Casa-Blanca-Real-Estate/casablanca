-- Dispatch 22a (CR-7e), Kimani's follow-up of 2026-10-27: a mentor's mentees.
-- Its own migration: 20261027120000 had already been applied to the deploy
-- preview's database, and an applied migration never changes.

-- A filter, not a permission: mentors read every report either way (NB-23 A).
-- Everyone's reports opens on a mentor's mentees when they have any. Each
-- mentor keeps their own list; a removed mentee keeps the row, stamped
-- (the app role has no DELETE, §12).
create table comp_report.mentees (
  mentor_email  text not null references comp_report.users (email),
  agent_email   text not null references comp_report.users (email),
  removed_at    timestamptz,
  created_at    timestamptz not null default now(),
  created_by    text not null,
  updated_at    timestamptz not null default now(),
  updated_by    text not null,
  primary key (mentor_email, agent_email),
  check (mentor_email <> agent_email)
);

create trigger mentees_stamp_insert before insert on comp_report.mentees
  for each row execute function comp_report.stamp_insert_mutable();
create trigger mentees_stamp_update before update on comp_report.mentees
  for each row execute function comp_report.stamp_update();
create trigger mentees_refuse_delete before delete on comp_report.mentees
  for each row execute function comp_report.refuse_change();
create trigger mentees_refuse_truncate before truncate on comp_report.mentees
  for each statement execute function comp_report.refuse_change();

alter table comp_report.mentees enable row level security;
alter table comp_report.mentees force row level security;

-- A mentor sees and keeps their own list; admins see every list.
create policy mentees_select on comp_report.mentees for select
  using (mentor_email = comp_report.actor_email() or comp_report.is_admin());
create policy mentees_insert on comp_report.mentees for insert
  with check (mentor_email = comp_report.actor_email() and comp_report.actor_role() = 'mentor');
create policy mentees_update on comp_report.mentees for update
  using (mentor_email = comp_report.actor_email() and comp_report.actor_role() = 'mentor')
  with check (mentor_email = comp_report.actor_email() and comp_report.actor_role() = 'mentor');

-- The least-privilege role (CR-1) needs the new table too. Skipped where the
-- role doesn't exist or can't be granted to, as in the first migration.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'comp_report_app') then
    grant select, insert, update on comp_report.mentees to comp_report_app;
  end if;
exception when insufficient_privilege then
  raise notice 'comp_report: comp_report_app can''t be granted mentees from here; row-level security alone scopes access';
end
$$;
