import { integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * 4-week XP-grind seasons (RANK_SYSTEM.md §4). At the end:
 * - top-N by xp_season → bonus prizes
 * - all users get a soft rank-reset (max(5, rank − 5))
 * Statuses: 'active' (current) | 'finalized' (rewards paid out, can never reopen).
 */
export const seasons = pgTable('seasons', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: integer('number').notNull().unique(),
  name: text('name').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SeasonRow = typeof seasons.$inferSelect;
