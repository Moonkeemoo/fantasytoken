-- TZ-002: Coins Economy
--
-- Replaces the USD-cents soft-currency layer with a coin-denominated one
-- (1 coin = $1 fantasy display, 1 Star = 10 coins). The wipe is intentional
-- and authorized by the product owner — pre-launch, no real customer money
-- in transactions yet.
--
-- Column names stay (`balance_cents`, `entry_fee_cents`, `prize_pool_cents`,
-- `prize_cents`, `delta_cents`) to avoid a 100-file rename; their VALUES are
-- now whole coins. A follow-up renaming pass is on the roadmap.

-- 1. Wipe ledger + balances + dependent FK tables. CASCADE picks up
--    referral_payouts.tx_id and referral_signup_bonuses.tx_id which
--    reference transactions(id). Authorized on a fresh-launch dataset.
TRUNCATE TABLE transactions RESTART IDENTITY CASCADE;
TRUNCATE TABLE balances RESTART IDENTITY CASCADE;

-- 3. Scale stored "cents" values to "coins" by /100. Floor is fine — all
--    contest fees and prize floors were whole-dollar values to begin with.
UPDATE contests
   SET entry_fee_cents = entry_fee_cents / 100,
       prize_pool_cents = prize_pool_cents / 100,
       virtual_budget_cents = virtual_budget_cents / 100;

UPDATE entries
   SET prize_cents = prize_cents / 100;

-- 4. Coin packages catalogue. Stars price is what TG charges; coins_base is
--    what we credit; bonus_pct stacks multiplicatively at credit time
--    (round half-up).
CREATE TABLE IF NOT EXISTS coin_packages (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  stars_price     integer NOT NULL,
  coins_base      integer NOT NULL,
  bonus_pct       integer NOT NULL DEFAULT 0,
  is_highlighted  boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO coin_packages (id, name, stars_price, coins_base, bonus_pct, is_highlighted, sort_order)
VALUES
  ('starter', 'Starter', 100, 1000, 0, false, 1),
  ('trader',  'Trader',  500, 5000, 10, true,  2),
  ('pro',     'Pro',    1000,10000, 20, false, 3),
  ('whale',   'Whale',  5000,50000, 30, false, 4)
ON CONFLICT (id) DO NOTHING;

-- 5. Idempotency for TG payment webhooks. The bot may retry the
--    successful_payment update; the unique index guarantees a single credit
--    even if creditFromPayment runs twice.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_charge_id text;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_payment_charge_id_uniq
  ON transactions (payment_charge_id)
  WHERE payment_charge_id IS NOT NULL;
