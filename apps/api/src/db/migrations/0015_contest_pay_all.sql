-- Add a per-contest pay-curve override. Default false → standard
-- top-30% curve. Backfill Practice → true so all 10 seats receive
-- a payout (~$2.50 down to ~$0.50 from the $5 house pool).

ALTER TABLE contests ADD COLUMN IF NOT EXISTS pay_all boolean NOT NULL DEFAULT false;

UPDATE contests SET pay_all = true WHERE name = 'Practice';
