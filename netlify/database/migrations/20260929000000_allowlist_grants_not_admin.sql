-- CR-1.1 (Casanova's review of #48): admin comes from CR_ADMIN_EMAILS only, so
-- an allowlist grant can't say admin. The API and the Access card already
-- refuse it; this makes the database refuse it too.
--
-- NOT VALID: the check applies to every row written from now on, but doesn't
-- scan the rows already there, so an old admin row can't fail the deploy. The
-- access rule ignores any such row (tools-src/comp-report/server/access.ts).
alter table comp_report.allowlist
  add constraint allowlist_role_grantable
  check (role in ('agent', 'mentor', 'external')) not valid;
