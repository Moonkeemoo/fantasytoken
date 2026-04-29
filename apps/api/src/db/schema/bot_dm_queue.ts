import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Outbox for Telegram bot direct messages. Producer side: referrals.service
 * enqueues one row per commission with `scheduled_at` calculated to honour
 * the per-recipient 1-DM/hour cap (REFERRAL_SYSTEM.md §11.2). Consumer side:
 * a 1-min cron picks up rows where scheduled_at ≤ NOW(), groups them per
 * recipient, sends one aggregated message via grammY, then marks them sent.
 *
 * Failures bump `attempts` but stay in the queue — the next cron tick retries.
 * Once attempts ≥ MAX (handled in service), we mark sent_at = now() with a
 * note in error_message and move on, so a permanently-blocked user (never
 * /start-ed the bot) doesn't poison the queue forever.
 */
export const botDmQueue = pgTable(
  'bot_dm_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id),
    payload: jsonb('payload').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Cron query: WHERE sent_at IS NULL AND scheduled_at ≤ NOW().
    pendingIdx: index('bot_dm_pending_idx')
      .on(t.scheduledAt)
      .where(sql`sent_at IS NULL`),
  }),
);

export type BotDmQueueRow = typeof botDmQueue.$inferSelect;
