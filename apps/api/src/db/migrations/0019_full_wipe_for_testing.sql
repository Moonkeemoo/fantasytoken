-- One-shot full wipe for fresh-start testing (tutorial, referral, signup
-- bonus flows). Authorized pre-launch by the product owner ("вайпай так
-- наче нас взагалі не було"). Drizzle-kit's journal makes this a one-shot —
-- subsequent migrations / fresh users won't be wiped.
--
-- We keep:
--   • users rows (so re-auth doesn't lose telegram_id mapping) but reset
--     all per-user state to first-launch defaults
--   • seasons (current season needed for XP awards)
--   • tokens (catalogue — re-fetching from CoinGecko is wasteful)
--   • coin_packages (catalogue)
--
-- We wipe:
--   • balances + transactions (already wiped in 0018; this is idempotent)
--   • entries + contests + price_snapshots (game state)
--   • xp_events (XP audit log)
--   • friendships (referral graph)
--   • referral_payouts + referral_signup_bonuses (cascaded by transactions)
--   • bot_dm_queue (any pending DMs are stale)

-- Wipe game state. CASCADE picks up dependent FKs (entries → contests,
-- entries → users, etc.).
TRUNCATE TABLE entries RESTART IDENTITY CASCADE;
TRUNCATE TABLE contests RESTART IDENTITY CASCADE;
TRUNCATE TABLE price_snapshots RESTART IDENTITY CASCADE;
TRUNCATE TABLE xp_events RESTART IDENTITY CASCADE;
TRUNCATE TABLE friendships RESTART IDENTITY CASCADE;
TRUNCATE TABLE bot_dm_queue RESTART IDENTITY CASCADE;
TRUNCATE TABLE transactions RESTART IDENTITY CASCADE;
TRUNCATE TABLE balances RESTART IDENTITY CASCADE;

-- Reset per-user state. tutorial_done_at = NULL forces /tutorial routing on
-- next auth; current_rank = 1 makes every contest beyond R2 lock again so
-- the tier-progression UX is testable from scratch.
UPDATE users
   SET xp_total = 0,
       xp_season = 0,
       current_rank = 1,
       career_highest_rank = 1,
       tutorial_done_at = NULL,
       referrer_user_id = NULL,
       welcome_credited_at = NULL,
       welcome_expired_at = NULL,
       last_dm_sent_at = NULL;
