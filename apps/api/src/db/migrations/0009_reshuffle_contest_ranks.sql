-- Reshuffle the early-rank contest progression so the entry-level cash contest
-- is available immediately and the top-tier "memecoin" contest sits later in
-- the rank curve (Memecoin Madness was previously at R3 and was wrongly the
-- featured headline for fresh accounts). Featured is now computed dynamically
-- on the lobby (highest unlocked contest), so we also clear is_featured on
-- Memecoin Madness so the static flag never re-introduces the bug.
--
-- Idempotent: only touches contests that match the *previous* canonical rank
-- (set by 0008). Safe to re-run; safe alongside hand-tuned contests at other
-- ranks.
UPDATE contests SET min_rank = 1 WHERE name = 'Quick Match'      AND status = 'scheduled' AND min_rank = 2;
--> statement-breakpoint
UPDATE contests SET min_rank = 3 WHERE name = 'Bear Trap'        AND status = 'scheduled' AND min_rank = 5;
--> statement-breakpoint
UPDATE contests SET min_rank = 5, is_featured = false WHERE name = 'Memecoin Madness' AND status = 'scheduled' AND min_rank = 3;
