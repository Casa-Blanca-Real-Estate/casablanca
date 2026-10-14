-- CR-6 (Dispatch 14): the design port. The earlier migrations are frozen; this
-- one only adds.
--
--   report_comps.note       the agent's note on a comp: "Why it's a comp" (the
--                           handoff). It can come before a tier, so it lives on
--                           the comp; every tier, and every changed note on a
--                           tiered comp, still appends a reason (§12), and the
--                           reason history keeps every version
--   report_comps.tags       the agent's tags on a comp, from the handoff's fixed
--                           list (workspace/features.ts): at least one before
--                           Findings unlocks
--   report_comps.features   the comp's features as the agent sees them, in the
--                           same pickers as the home's: outdoor space, views,
--                           exposure, unit condition, building
--   report_comps.removed_at a comp taken out of the report (a read never
--                           confirmed, or an export row the agent doesn't want).
--                           Nothing is deleted: a removed comp counts in no
--                           result, and an export's removed row is what Hubert
--                           can point back to ("You might also look at")

alter table comp_report.report_comps add column note text
  check (note is null or length(note) <= 2000);
alter table comp_report.report_comps add column tags text[] not null default '{}'
  check (cardinality(tags) <= 30);
alter table comp_report.report_comps add column features jsonb not null default '{}'
  check (jsonb_typeof(features) = 'object' and pg_column_size(features) < 8192);
alter table comp_report.report_comps add column removed_at timestamptz;
alter table comp_report.report_comps add column removed_by text;

-- A removed comp is never the anchor.
alter table comp_report.report_comps add constraint report_comps_removed_not_anchor
  check (removed_at is null or not is_anchor);
