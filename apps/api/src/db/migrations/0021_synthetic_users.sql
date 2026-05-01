-- TZ-005 M1: synthetic users — schema additions only (no behaviour yet).
--
-- Adds three columns to `users` plus the `synthetic_actions_log` table.
-- All changes are additive and idempotent (`IF NOT EXISTS`, `IF EXISTS`),
-- so re-running on a partially-applied DB is safe.
--
-- Why a sequence for negative TG IDs:
--   Real Telegram IDs are always positive 32–64-bit ints. Synthetic users
--   need a `users.telegram_id` value to satisfy NOT NULL + UNIQUE, and
--   choosing a deterministic monotonic negative number lets us run
--   parallel seeders without a race on `min(telegram_id) - 1`.

-- 1. Sequence for synthetic telegram_ids (negative space).
CREATE SEQUENCE IF NOT EXISTS synthetic_telegram_id_seq
  START WITH 1000000
  INCREMENT BY 1
  NO MAXVALUE
  CACHE 1;

-- 2. Synthetic-related columns on users.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_synthetic   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS persona_kind   text,
  ADD COLUMN IF NOT EXISTS synthetic_seed integer;

-- 3. Constraints. Persona kind required for synthetics; whitelist of values.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_synthetic_persona_chk') THEN
    ALTER TABLE users ADD CONSTRAINT users_synthetic_persona_chk
      CHECK (is_synthetic = false OR persona_kind IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_persona_kind_chk') THEN
    ALTER TABLE users ADD CONSTRAINT users_persona_kind_chk
      CHECK (persona_kind IS NULL OR persona_kind IN
        ('whale','casual','meme_chaser','newbie','streaker','inviter','lurker'));
  END IF;
END $$;

-- 4. Hot-path index: every "real users only" query must filter
--    `is_synthetic = false`. Partial index keeps the planner cheap and
--    serves as documentation for INV-14.
CREATE INDEX IF NOT EXISTS users_real_only_idx
  ON users (created_at DESC)
  WHERE is_synthetic = false;

-- 5. synthetic_actions_log — append-only behaviour log.
CREATE TABLE IF NOT EXISTS synthetic_actions_log (
  id                  bigserial PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tick                timestamptz NOT NULL,
  action              text NOT NULL,
  outcome             text NOT NULL,
  error_code          text,
  payload             jsonb,
  balance_after_cents bigint,
  created_at          timestamptz NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sim_log_outcome_chk') THEN
    ALTER TABLE synthetic_actions_log ADD CONSTRAINT sim_log_outcome_chk
      CHECK (outcome IN ('success','rejected','skipped','error'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sim_log_user_tick_idx   ON synthetic_actions_log (user_id, tick);
CREATE INDEX IF NOT EXISTS sim_log_action_tick_idx ON synthetic_actions_log (action,  tick);
CREATE INDEX IF NOT EXISTS sim_log_tick_idx        ON synthetic_actions_log (tick);
