-- Admin, granted from the Access panel (Kimani, 2026-11-06: "Yes I want that grantable from the panel
-- too"). Until now admin came from CR_ADMIN_EMAILS alone; an admin can now make someone else an admin
-- with a grant, and take it back. It's a separate flag, not role = 'admin': a row written before CR-1.1
-- that says role admin still grants nothing (allowlist_role_grantable stays), so no old row turns into
-- an admin by this change. CR_ADMIN_EMAILS stays the root: those admins can't be removed from the panel.
alter table comp_report.allowlist
  add column admin boolean not null default false;
