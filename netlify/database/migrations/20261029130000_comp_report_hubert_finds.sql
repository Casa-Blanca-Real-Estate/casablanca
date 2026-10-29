-- Hubert's finds (Kimani, 2026-10-29, HB-8): a sale Hubert found on the web
-- comes into the report only through its StreetEasy link, read like any
-- other, and it counts in nothing until the agent confirms it. found_by marks
-- the reads Hubert asked for, so Sort can ask the agent to check that link
-- before confirming: the right unit, a sale and not an asking price, current.
-- The earlier migrations are frozen; this one only adds.
alter table comp_report.link_reads add column found_by text check (found_by in ('hubert'));
