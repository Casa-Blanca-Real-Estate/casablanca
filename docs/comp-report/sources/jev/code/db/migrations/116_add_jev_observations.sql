-- 116_add_jev_observations.sql — Jev WATCH MODE: what Jev would have decided, beside what the
-- platform did decide (docs/design/jev-decision-layer-2026-09-22.md; KJ's ruling of 2026-09-23 that
-- Jev becomes the card mediator only once its accuracy is measured).
--
-- An INSTRUMENT, not story data: nothing in the product reads this table to make a decision, and the
-- module that writes it (server/lib/jev-shadow.ts) writes nothing else — asserted by
-- scripts/verify-jev-shadow.ts. Raw-SQL only, like write_trace (migration 110), so no product read
-- path can grow a typed dependency on it. Rows are written only when JEV_SHADOW=true.
--
-- Read back by scripts/audit-jev-agreement.ts: agreement per lane, agreement by Jev's own confidence,
-- and the disagreements a human labels to learn how often Jev is RIGHT when the two differ.
--
-- Additive, idempotent. Number taken from schema_migrations (highest applied: 115), not the directory.
CREATE TABLE IF NOT EXISTS jev_observations (
  id               bigserial PRIMARY KEY,
  binder_id        integer REFERENCES binders(id) ON DELETE CASCADE,
  job_id           text,
  lane             text NOT NULL,          -- 'kind' | 'citation'
  subject          text NOT NULL,          -- the new name (kind) / the atom's subject (citation)
  item_key         text,                   -- a stable handle when there is one (segment id, …)
  incumbent        text,                   -- what the platform decided: a kind, or 'true' (the citation it made)
  jev_answer       text,                   -- Jev's pick: a kind, or 'true' / 'false'
  jev_probability  real,                   -- the pick's probability (choice) or P(true) (boolean)
  jev_confidence   real,                   -- the vendor confidence statistic, when returned (choice only)
  jev_distribution jsonb,                  -- every option's probability
  jev_model        text,                   -- what the Gateway says served it (version-drift evidence)
  evidence         text,                   -- what a human needs to label the row: the context / fact + cited text
  agrees           boolean,                -- jev_answer = incumbent
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jev_observations_binder_lane_idx ON jev_observations (binder_id, lane, created_at);
