-- 0025_coin_packages_div10.sql
--
-- Follow-up to 0024 (which divided only stars). Divide the coins payout
-- by 10× too so the original stars-to-coins ratio is preserved:
--
--   Starter  10⭐ → 100c     (was 10⭐ → 1000c after 0024)
--   Trader   50⭐ → 500c     (was 50⭐ → 5000c)
--   Pro     100⭐ → 1000c    (was 100⭐ → 10000c)
--   Whale   500⭐ → 5000c    (was 500⭐ → 50000c)
--
-- Idempotent: only applies when the post-0024 coins_base value still
-- matches; re-running is a no-op.

UPDATE coin_packages SET coins_base =  100 WHERE id = 'starter' AND coins_base = 1000;
UPDATE coin_packages SET coins_base =  500 WHERE id = 'trader'  AND coins_base = 5000;
UPDATE coin_packages SET coins_base = 1000 WHERE id = 'pro'     AND coins_base = 10000;
UPDATE coin_packages SET coins_base = 5000 WHERE id = 'whale'   AND coins_base = 50000;
