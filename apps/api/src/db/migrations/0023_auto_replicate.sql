-- 0023_auto_replicate.sql
--
-- ADR-0009: auto-replicate cell instances at fill threshold.
--
-- Rationale: matrix v3 originally enforced "one live instance per cell"
-- via a partial unique index (idx_one_live_per_cell). That worked for a
-- "one wave at a time" model, but produced the worst lobby UX once a
-- cell capped: real users saw "FILLED" with no path forward until the
-- existing wave finalized (could be 60+ minutes for 1h lanes).
--
-- DraftKings pattern: when the current wave fills to ≥90%, the lobby
-- pre-spawns a sibling instance starting at "now" with a fresh lane
-- window. The player who can't fit in #1 lands in #2 with the same
-- rules. To allow that we drop the partial unique index and rely on
-- app-level idempotency in the scheduler tick (single replica per
-- 60s scheduler cadence; race exposure is one duplicate spawn at
-- worst, easy to spot in logs).
--
-- The matrix_cell_key column stays — it's still useful for grouping
-- siblings together in the lobby UI. We just don't enforce uniqueness
-- on it anymore.

DROP INDEX IF EXISTS idx_one_live_per_cell;

-- Replace with a non-unique index for the lookup pattern used by
-- scheduler.replicateFullCells (group siblings by cell to count fill
-- ratio across the cohort). Partial on (scheduled, active) since
-- finalized/cancelled rows aren't relevant for replication decisions.
CREATE INDEX IF NOT EXISTS idx_live_per_cell
    ON contests(matrix_cell_key)
 WHERE status IN ('scheduled', 'active');
