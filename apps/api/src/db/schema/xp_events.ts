import { index, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { contests } from './contests.js';
import { seasons } from './seasons.js';
import { users } from './users.js';

/**
 * INV-11: XP audit log. Once written, never UPDATE — corrections write a new
 * REVERSAL row. users.xp_total / xp_season are denormalised caches; this table
 * is the source of truth (mirrors INV-9 for currency).
 */
export const xpEvents = pgTable(
  'xp_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    contestId: uuid('contest_id').references(() => contests.id, { onDelete: 'set null' }),
    seasonId: uuid('season_id').references(() => seasons.id, { onDelete: 'set null' }),
    deltaXp: integer('delta_xp').notNull(),
    /** 'contest_finalized' | 'season_reset' | 'reversal' | 'admin_grant' */
    reason: varchar('reason', { length: 32 }).notNull(),
    /** Per-row context — XP breakdown rows for UI, or reset details. */
    breakdown: jsonb('breakdown'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byUser: index('xp_events_user_created_idx').on(t.userId, t.createdAt),
  }),
);

export type XpEventRow = typeof xpEvents.$inferSelect;
