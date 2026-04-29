-- Backfill min_rank / xp_multiplier on contests created before 0007 added these
-- columns (or before replenish started passing them). Match by canonical template
-- name; only touch contests that still hold the column default (min_rank=1) so this
-- is safe to re-run and never clobbers a custom-tuned contest.
UPDATE contests SET min_rank = 2 WHERE name = 'Quick Match' AND min_rank = 1;
--> statement-breakpoint
UPDATE contests SET min_rank = 3, xp_multiplier = '1.00' WHERE name = 'Memecoin Madness' AND min_rank = 1;
--> statement-breakpoint
UPDATE contests SET min_rank = 5, xp_multiplier = '1.50' WHERE name = 'Bear Trap' AND min_rank = 1;
