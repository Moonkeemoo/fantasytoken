-- Bot DM outbox + per-recipient rate-limit clock. REFERRAL_SYSTEM.md §11.2:
-- "1 message per recipient per hour" — the column on users gives the cron a
-- single-row lookup per recipient to apply the cap.

ALTER TABLE "users" ADD COLUMN "last_dm_sent_at" timestamp with time zone;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bot_dm_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_user_id" uuid NOT NULL,
  "payload" jsonb NOT NULL,
  "scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at" timestamp with time zone,
  "attempts" integer DEFAULT 0 NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bot_dm_queue" ADD CONSTRAINT "bot_dm_queue_recipient_fk"
    FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- Cron query: WHERE sent_at IS NULL AND scheduled_at ≤ NOW() ORDER BY scheduled_at.
-- Partial index over the active-only subset stays tiny.
CREATE INDEX IF NOT EXISTS "bot_dm_pending_idx"
  ON "bot_dm_queue" ("scheduled_at")
  WHERE "sent_at" IS NULL;
