-- Server-side tutorial completion flag. NULL = not yet completed → frontend
-- routes to /tutorial. Set once the user finishes (or skips) the onboarding.
-- localStorage stays as a no-flicker cache, but server is source of truth so a
-- wipe/new-device shows the tutorial again.
ALTER TABLE "users" ADD COLUMN "tutorial_done_at" timestamp with time zone;
--> statement-breakpoint
-- Backfill: existing users have already onboarded (their localStorage flag
-- proves it for one device); mark them all done so this rollout doesn't pop
-- the tutorial back up for active accounts. Brand-new sign-ups via
-- upsertOnAuth will get NULL by default and see the tutorial as expected.
UPDATE "users" SET "tutorial_done_at" = now() WHERE "tutorial_done_at" IS NULL;
