-- 117_add_jev_watch_drops.sql — every question the Jev watch ASKED and did not get answered.
--
-- Why: after Jev's free window closed (2026-09-25) the Gateway rate-limits by the minute (a 429 with a
-- Retry-After counting down from ~60 s; 2–4 requests a minute) and answers 503 for up to ~2 minutes at
-- a stretch (docs/handoffs/JEV-REASK-633-2026-09-26.md §4). The watch fires in bursts, so a run keeps
-- only what fits each window — and until now a lost request left nothing but a log line, so an
-- agreement figure was measured on whatever subset got through, with no way to know how big it was.
--
-- One row per dropped REQUEST, carrying how many QUESTIONS it held (one per atom on the citation lane,
-- one on the kind lane), so coverage = answered observations / (answered + dropped questions).
-- A request that came back with some answers missing records the missing ones here too.
--
-- An INSTRUMENT, like jev_observations (migration 116), and kept apart from it on purpose: three
-- readers of jev_observations treat a row as an ANSWER (agrees / jev_answer), so a drop written there
-- would read as an unknown answer. Written only by server/lib/jev-shadow.ts; read by
-- scripts/audit-jev-agreement.ts. Rows are written only when JEV_SHADOW=true.
--
-- Additive, idempotent. Number taken from schema_migrations (highest applied: 116 ×2), not the directory.
CREATE TABLE IF NOT EXISTS jev_watch_drops (
  id           bigserial PRIMARY KEY,
  binder_id    integer REFERENCES binders(id) ON DELETE CASCADE,
  job_id       text,
  lane         text NOT NULL,          -- 'kind' | 'citation'
  subject      text NOT NULL,          -- the new name (kind) / the first atom's subject (citation)
  item_key     text,                   -- a stable handle when there is one (segment id, …)
  questions    integer NOT NULL,       -- how many questions went unanswered
  reason       text NOT NULL,          -- no-key | queue-full | shutdown | retries-exhausted | http-<status> | network | malformed | unanswered
  attempts     integer NOT NULL DEFAULT 0,
  last_status  integer,                -- the last HTTP status seen, when there was one
  waited_ms    integer,                -- time from enqueue to giving up (queue wait + retries)
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jev_watch_drops_binder_lane_idx ON jev_watch_drops (binder_id, lane, created_at);
