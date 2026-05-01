-- ADR-0008: per-contest prize structure (DraftKings-style formats).
--
-- 'linear' — Practice (house-funded linear curve).
-- '50_50'  — Double-Up: top floor(N/2) split equally (~1.8× entry).
-- '3x'     — top floor(N/3) split (~2.7× entry).
-- '5x'     — top floor(N/5) split (~4.5× entry).
-- 'gpp'    — Guaranteed Prize Pool: top 25% paid, top-heavy gradient.

ALTER TABLE contests
  ADD COLUMN IF NOT EXISTS prize_format text NOT NULL DEFAULT 'gpp';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contests_prize_format_chk') THEN
    ALTER TABLE contests ADD CONSTRAINT contests_prize_format_chk
      CHECK (prize_format IN ('linear','50_50','3x','5x','gpp'));
  END IF;
END $$;

-- Backfill existing live (scheduled/active) rows using payAll as the
-- legacy proxy: payAll=true → linear (Practice), else 'gpp' default.
UPDATE contests
   SET prize_format = CASE WHEN pay_all THEN 'linear' ELSE 'gpp' END
 WHERE prize_format = 'gpp'; -- only touch rows still on the default
