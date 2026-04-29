import { sql } from 'drizzle-orm';
import {
  bigint,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  username: text('username'),
  firstName: text('first_name'),
  photoUrl: text('photo_url'),
  // INV-11: xp_total / xp_season are denormalised counters; xp_events is source of truth.
  xpTotal: bigint('xp_total', { mode: 'number' })
    .notNull()
    .default(sql`0`),
  xpSeason: bigint('xp_season', { mode: 'number' })
    .notNull()
    .default(sql`0`),
  // INV-12: current_rank monotonic in-season; only the season-end soft reset can drop it.
  currentRank: integer('current_rank').notNull().default(1),
  careerHighestRank: integer('career_highest_rank').notNull().default(1),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  // NULL = tutorial not yet completed → frontend routes to /tutorial. Set once
  // the user finishes (or skips) — server-side source of truth so wipe/new
  // device re-shows the tutorial. localStorage stays as a no-flicker cache.
  tutorialDoneAt: timestamp('tutorial_done_at', { withTimezone: true }),
  // INV-13: immutable once set. Asymmetric attribution — see REFERRAL_SYSTEM.md
  // §1. Only assigned at first auth IF the user is brand-new (created_at < 60s)
  // AND has 0 finalized entries. Friendships row is created in parallel.
  referrerUserId: uuid('referrer_user_id').references((): AnyPgColumn => users.id),
  // Welcome bonus accounting. *_credited_at set when the $25 was granted via
  // CurrencyService.transact (INV-9). *_expired_at set by the daily cron when
  // the 7-day window passes without a finalized entry; null otherwise.
  welcomeCreditedAt: timestamp('welcome_credited_at', { withTimezone: true }),
  welcomeExpiredAt: timestamp('welcome_expired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
