import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { contests } from './contests.js';
import { users } from './users.js';

// INV-10: picks immutable after submitted_at.
export const entries = pgTable(
  'entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    contestId: uuid('contest_id')
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    isBot: boolean('is_bot').notNull().default(false),
    botHandle: text('bot_handle'),
    picks: jsonb('picks').notNull(), // [{ symbol: string, alloc: number }]
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    currentScore: numeric('current_score', { precision: 15, scale: 9 }),
    finalScore: numeric('final_score', { precision: 15, scale: 9 }),
    finalRank: integer('final_rank'),
    // mode:'bigint' for INV-9 — CurrencyService operates on bigint end-to-end.
    // default uses sql`0` not 0n because drizzle-kit 0.28 cannot serialize BigInt literals.
    prizeCents: bigint('prize_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    status: varchar('status', { length: 16 }).notNull().default('submitted'),
  },
  (t) => ({
    // One real entry per (user,contest). Bots (user_id=null) are excluded.
    uniqRealEntry: uniqueIndex('entries_user_contest_uniq')
      .on(t.userId, t.contestId)
      // Note: drizzle-kit 0.28 didn't emit partial WHERE clause; appended manually in 0000_*.sql
      .where(sql`${t.userId} IS NOT NULL`),
  }),
);

export type EntryRow = typeof entries.$inferSelect;
export type NewEntryRow = typeof entries.$inferInsert;
