-- Removing a report (Kimani's decision, 2026-10-22, dev note dn_mvjq24vjq77p): a real
-- report is archived and can be restored; a sample report can also be deleted.
--
-- A deleted report is a status, not a removed row. The app role has no DELETE on any
-- comp_report table by design (§12: the record is append-only), and a report's rows
-- reach a dozen tables. 'deleted' takes it out of every list and every route for good.
alter table comp_report.reports drop constraint if exists reports_status_check;
alter table comp_report.reports
  add constraint reports_status_check check (status in ('active', 'archived', 'deleted'));
