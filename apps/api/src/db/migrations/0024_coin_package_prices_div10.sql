-- 0024_coin_package_prices_div10.sql
--
-- Reduce every coin-package stars price by 10× (per user request, 2026-05-01).
-- Coins payout stays the same — this is purely a discount on the entry
-- price to lower the bar for first-time top-ups while we're still in the
-- early-traction phase.
--
-- Pre-migration:                  Post-migration:
--   Starter 100⭐ → 1000c            Starter  10⭐ → 1000c
--   Trader  500⭐ → 5500c (10%)      Trader   50⭐ → 5500c (10%)
--   Pro    1000⭐ → 12000c (20%)     Pro     100⭐ → 12000c (20%)
--   Whale  5000⭐ → 65000c (30%)     Whale   500⭐ → 65000c (30%)
--
-- Idempotent: divides only when the stored price still matches the old
-- value. Re-running the migration is a no-op once it has been applied,
-- so nothing happens if Drizzle's __drizzle_migrations table reports it
-- as already-applied (defence-in-depth — the migration runner already
-- guards that).

UPDATE coin_packages SET stars_price = 10  WHERE id = 'starter' AND stars_price = 100;
UPDATE coin_packages SET stars_price = 50  WHERE id = 'trader'  AND stars_price = 500;
UPDATE coin_packages SET stars_price = 100 WHERE id = 'pro'     AND stars_price = 1000;
UPDATE coin_packages SET stars_price = 500 WHERE id = 'whale'   AND stars_price = 5000;
