-- Contests v2 — matrix concept (ADR-0004, INV-13).
--
-- Adds three categorisation columns + a generated cell-key, and enforces
-- the "one live instance per cell" invariant via a partial unique index.
--
-- Existing rows: backfill duration_lane='10m' / stake_tier='c1' / mode=type
-- so legacy contests fit the new schema (they'll be wiped pre-deploy
-- anyway, but the backfill keeps the migration idempotent for staging).

ALTER TABLE contests
  ADD COLUMN IF NOT EXISTS duration_lane text,
  ADD COLUMN IF NOT EXISTS stake_tier    text,
  ADD COLUMN IF NOT EXISTS mode          text;

-- Backfill from legacy entry_fee_cents → stake_tier and type → mode.
-- 10m default for legacy ladder rows.
UPDATE contests
   SET duration_lane = COALESCE(duration_lane, '10m'),
       mode          = COALESCE(mode,
                                CASE WHEN type = 'bear' THEN 'bear' ELSE 'bull' END),
       stake_tier    = COALESCE(stake_tier,
                                CASE
                                  WHEN entry_fee_cents = 0   THEN 'free'
                                  WHEN entry_fee_cents = 1   THEN 'c1'
                                  WHEN entry_fee_cents = 5   THEN 'c5'
                                  WHEN entry_fee_cents = 25  THEN 'c25'
                                  WHEN entry_fee_cents = 100 THEN 'c100'
                                  WHEN entry_fee_cents = 500 THEN 'c500'
                                  -- legacy USD-cents (pre-coins): map to closest coin tier
                                  WHEN entry_fee_cents <= 100   THEN 'c1'
                                  WHEN entry_fee_cents <= 500   THEN 'c5'
                                  WHEN entry_fee_cents <= 2500  THEN 'c25'
                                  WHEN entry_fee_cents <= 10000 THEN 'c100'
                                  ELSE 'c500'
                                END);

-- Lock NOT NULL once backfill is complete.
ALTER TABLE contests
  ALTER COLUMN duration_lane SET NOT NULL,
  ALTER COLUMN stake_tier    SET NOT NULL,
  ALTER COLUMN mode          SET NOT NULL;

-- CHECK constraints — keep enum-like values from going stale.
-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so guard via a DO block
-- (this migration was hand-applied to prod via a script before being run
-- by drizzle-kit; raw ADD would error on the second pass).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contests_duration_lane_chk') THEN
    ALTER TABLE contests ADD CONSTRAINT contests_duration_lane_chk
      CHECK (duration_lane IN ('10m','30m','1h','24h','7d'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contests_stake_tier_chk') THEN
    ALTER TABLE contests ADD CONSTRAINT contests_stake_tier_chk
      CHECK (stake_tier IN ('free','c1','c5','c25','c100','c500'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contests_mode_chk') THEN
    ALTER TABLE contests ADD CONSTRAINT contests_mode_chk
      CHECK (mode IN ('bull','bear'));
  END IF;
END $$;

-- Generated cell-key: lane:stake:mode[:flavor]. The optional `flavor` is
-- distinct in `name` (e.g. Practice vs other Free-bull-10m), but for the
-- matrix cell uniqueness we treat name as the disambiguator: if two cells
-- collide on (lane,stake,mode), `name` differentiates them. We compute the
-- key as lane:stake:mode:lower(name) to keep one row per named instance
-- in flight.
ALTER TABLE contests
  ADD COLUMN IF NOT EXISTS matrix_cell_key text
    GENERATED ALWAYS AS (
      duration_lane || ':' || stake_tier || ':' || mode || ':' || lower(name)
    ) STORED;

-- INV-13: at most one live (scheduled or active) instance per matrix cell.
-- Backfill safety: dedupe before adding the index — keep the most recent
-- scheduled row, cancel duplicates so the index can be created.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY duration_lane || ':' || stake_tier || ':' || mode || ':' || lower(name)
           ORDER BY created_at DESC, id
         ) AS rn,
         status
    FROM contests
   WHERE status IN ('scheduled','active')
)
UPDATE contests
   SET status = 'cancelled'
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_live_per_cell
    ON contests(matrix_cell_key)
 WHERE status IN ('scheduled', 'active');
