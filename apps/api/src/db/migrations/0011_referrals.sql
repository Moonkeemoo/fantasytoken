-- Referral system foundation. Spec: docs/REFERRAL_SYSTEM.md.
-- INV-13 referrer immutable | INV-14 payouts immutable | INV-15 depth ≤ 2.

-- 1. Asymmetric referrer attribution + welcome accounting on users.
ALTER TABLE "users" ADD COLUMN "referrer_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "welcome_credited_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "welcome_expired_at" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_referrer_user_id_users_id_fk"
    FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_referrer_idx" ON "users" ("referrer_user_id")
  WHERE "referrer_user_id" IS NOT NULL;
--> statement-breakpoint

-- Existing users are GRANDFATHERED: they received $100 under the previous flow,
-- and we DELIBERATELY leave welcome_credited_at = NULL so the daily expiry cron
-- skips them (cron filter requires welcome_credited_at IS NOT NULL). New signups
-- from this point forward set welcome_credited_at = NOW() in upsertOnAuth, which
-- makes them eligible for the 7-day expiry. referrer_user_id stays NULL for
-- existing users since no referral tracking existed before.
--> statement-breakpoint

-- 2. Immutable commission payout audit log (INV-14).
CREATE TABLE IF NOT EXISTS "referral_payouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_user_id" uuid NOT NULL,
  "source_user_id" uuid NOT NULL,
  "source_contest_id" uuid NOT NULL,
  "source_entry_id" uuid NOT NULL,
  "level" integer NOT NULL,
  "commission_pct_bps" integer NOT NULL,
  "source_prize_cents" bigint NOT NULL,
  "payout_cents" bigint NOT NULL,
  "currency_code" varchar(16) NOT NULL,
  "transaction_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "rp_level_chk" CHECK ("level" IN (1, 2))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "referral_payouts" ADD CONSTRAINT "rp_recipient_fk"
    FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "referral_payouts" ADD CONSTRAINT "rp_source_user_fk"
    FOREIGN KEY ("source_user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "referral_payouts" ADD CONSTRAINT "rp_source_contest_fk"
    FOREIGN KEY ("source_contest_id") REFERENCES "public"."contests"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "referral_payouts" ADD CONSTRAINT "rp_source_entry_fk"
    FOREIGN KEY ("source_entry_id") REFERENCES "public"."entries"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "referral_payouts" ADD CONSTRAINT "rp_transaction_fk"
    FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rp_recipient_created_idx"
  ON "referral_payouts" ("recipient_user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rp_source_entry_idx"
  ON "referral_payouts" ("source_entry_id");
--> statement-breakpoint
-- Idempotency: re-running finalize must never double-pay the same (recipient, source-entry, level).
CREATE UNIQUE INDEX IF NOT EXISTS "rp_unique_payout_idx"
  ON "referral_payouts" ("recipient_user_id", "source_entry_id", "level");
--> statement-breakpoint

-- 3. Pre-created referee + recruiter signup bonus rows.
CREATE TABLE IF NOT EXISTS "referral_signup_bonuses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "source_user_id" uuid,
  "bonus_type" varchar(16) NOT NULL,
  "amount_cents" bigint NOT NULL,
  "currency_code" varchar(16) DEFAULT 'USD' NOT NULL,
  "unlocked_at" timestamp with time zone,
  "triggered_by_entry_id" uuid,
  "transaction_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "rsb_type_chk" CHECK ("bonus_type" IN ('REFEREE', 'RECRUITER'))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "referral_signup_bonuses" ADD CONSTRAINT "rsb_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "referral_signup_bonuses" ADD CONSTRAINT "rsb_source_user_fk"
    FOREIGN KEY ("source_user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "referral_signup_bonuses" ADD CONSTRAINT "rsb_entry_fk"
    FOREIGN KEY ("triggered_by_entry_id") REFERENCES "public"."entries"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "referral_signup_bonuses" ADD CONSTRAINT "rsb_transaction_fk"
    FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- Idempotency: one row per (recipient, type, source). source_user_id is part of the key
-- so REFEREE (NULL source) and RECRUITER (the referee as source) coexist cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS "rsb_unique_idx"
  ON "referral_signup_bonuses" ("user_id", "bonus_type", COALESCE("source_user_id", '00000000-0000-0000-0000-000000000000'));
