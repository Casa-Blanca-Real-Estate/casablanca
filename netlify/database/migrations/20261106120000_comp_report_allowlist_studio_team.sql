-- The Studio's team, granted from the Access panel (Kimani, 2026-11-06: "an easy way for me to manage
-- access and grant perms to whoever from the platform directly", so adding someone to the team no longer
-- takes a PR). A grant with studio_team gives that person the Studio's team tools: the agent CMS, the
-- profile-pic roster, the property sign's roster, and the CMS and roster tokens (/api/studio/keys).
-- It is separate from the role: a Casa agent, a mentor or an outsider can each be on the team, and the
-- team is never admin. The old four team emails stay built in (server/access.ts, STUDIO_TEAM).
alter table comp_report.allowlist
  add column studio_team boolean not null default false;
