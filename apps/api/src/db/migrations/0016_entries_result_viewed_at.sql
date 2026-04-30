-- Tracks when the user first opened the result page for a finalized
-- contest entry. Used by the bot's contest-finalized DM to skip
-- recipients who already came back to see their reward themselves.

ALTER TABLE entries ADD COLUMN IF NOT EXISTS result_viewed_at timestamptz;
