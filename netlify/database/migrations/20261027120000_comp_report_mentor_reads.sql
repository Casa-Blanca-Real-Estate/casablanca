-- Dispatch 22a (CR-7e) · NW-088 a, answered by Kimani as NB-23 A (2026-10-27):
-- mentors read every agent's report, read-only. Admins already could.
--
-- can_see_report (CR-1) is split in two:
--   can_read_report  owner, admin or mentor: every select policy inside a report
--   can_edit_report  owner or admin: today's rule under a new name, so no write
--                    is gained or lost; every insert and update policy
-- and can_see_report is dropped, so nothing is left calling it. Later
-- migrations use the new two.
--
-- The mentor clause lives in exactly two places: can_read_report and
-- reports_select. reports_select can't call the function (it selects from
-- reports, which has FORCE RLS, so the policy would recurse), so it states the
-- rule inline. db/mentor-reads.test.ts fails if the two disagree for any role.
-- Nothing here touches reports_insert or reports_update: a mentor writes nowhere.

-- Whether the request's user may read a report: its owner, an admin or a mentor.
-- The mentor clause's twin is reports_select, below.
create function comp_report.can_read_report(p_report_id uuid) returns boolean
  language sql stable
  as $$ select exists (
          select 1 from comp_report.reports r
           where r.id = p_report_id
             and (r.owner_email = comp_report.actor_email()
                  or comp_report.actor_role() in ('admin', 'mentor'))) $$;

-- Whether the request's user may change what's inside a report: its owner, or an
-- admin (CR-1's can_see_report, renamed). The handlers still insist on ownership.
create function comp_report.can_edit_report(p_report_id uuid) returns boolean
  language sql stable
  as $$ select exists (
          select 1 from comp_report.reports r
           where r.id = p_report_id
             and (r.owner_email = comp_report.actor_email() or comp_report.is_admin())) $$;

-- reports: the owner, admins and mentors read; writes are unchanged.
-- The mentor clause's twin is can_read_report, above.
drop policy reports_select on comp_report.reports;
create policy reports_select on comp_report.reports for select
  using (owner_email = comp_report.actor_email()
         or comp_report.actor_role() in ('admin', 'mentor'));

-- observations: the importing agent's own, admins, and anyone who can read the
-- report an observation came in with (without it a mentor sees comps with no facts).
drop policy observations_select on comp_report.property_observations;
create policy observations_select on comp_report.property_observations for select
  using (created_by = comp_report.actor_email() or comp_report.is_admin()
         or (report_id is not null and comp_report.can_read_report(report_id)));
drop policy observations_insert on comp_report.property_observations;
create policy observations_insert on comp_report.property_observations for insert
  with check (comp_report.actor_email() is not null
              and (report_id is null or comp_report.can_edit_report(report_id)));

-- Everything inside a report follows the report: read by can_read_report,
-- written by can_edit_report.
drop policy report_comps_select on comp_report.report_comps;
drop policy report_comps_insert on comp_report.report_comps;
drop policy report_comps_update on comp_report.report_comps;
create policy report_comps_select on comp_report.report_comps for select
  using (comp_report.can_read_report(report_id));
create policy report_comps_insert on comp_report.report_comps for insert
  with check (comp_report.can_edit_report(report_id));
create policy report_comps_update on comp_report.report_comps for update
  using (comp_report.can_edit_report(report_id)) with check (comp_report.can_edit_report(report_id));

drop policy reasons_select on comp_report.reasons;
drop policy reasons_insert on comp_report.reasons;
create policy reasons_select on comp_report.reasons for select
  using (comp_report.can_read_report(report_id));
create policy reasons_insert on comp_report.reasons for insert
  with check (comp_report.can_edit_report(report_id));

drop policy messages_select on comp_report.messages;
drop policy messages_insert on comp_report.messages;
create policy messages_select on comp_report.messages for select
  using (comp_report.can_read_report(report_id));
create policy messages_insert on comp_report.messages for insert
  with check (comp_report.can_edit_report(report_id));

drop policy imports_select on comp_report.imports;
drop policy imports_insert on comp_report.imports;
create policy imports_select on comp_report.imports for select
  using (comp_report.can_read_report(report_id));
create policy imports_insert on comp_report.imports for insert
  with check (comp_report.actor_email() is not null and comp_report.can_edit_report(report_id));

drop policy link_reads_select on comp_report.link_reads;
drop policy link_reads_insert on comp_report.link_reads;
drop policy link_reads_update on comp_report.link_reads;
create policy link_reads_select on comp_report.link_reads for select
  using (comp_report.can_read_report(report_id));
create policy link_reads_insert on comp_report.link_reads for insert
  with check (comp_report.actor_email() is not null and comp_report.can_edit_report(report_id));
create policy link_reads_update on comp_report.link_reads for update
  using (comp_report.can_edit_report(report_id)) with check (comp_report.can_edit_report(report_id));

drop policy narratives_select on comp_report.narratives;
drop policy narratives_insert on comp_report.narratives;
drop policy narratives_update on comp_report.narratives;
create policy narratives_select on comp_report.narratives for select
  using (comp_report.can_read_report(report_id));
create policy narratives_insert on comp_report.narratives for insert
  with check (comp_report.actor_email() is not null and comp_report.can_edit_report(report_id));
create policy narratives_update on comp_report.narratives for update
  using (comp_report.can_edit_report(report_id)) with check (comp_report.can_edit_report(report_id));

drop function comp_report.can_see_report(uuid);

