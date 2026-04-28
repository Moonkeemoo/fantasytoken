import { sql } from 'drizzle-orm';
import { pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Symmetric friendship: stored as unordered pair (user_a < user_b lexicographically)
 * so each relationship has exactly one row. Mutual by construction.
 */
export const friendships = pgTable(
  'friendships',
  {
    userAId: uuid('user_a_id')
      .notNull()
      .references(() => users.id),
    userBId: uuid('user_b_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userAId, t.userBId] }),
    ordered: sql`CHECK (user_a_id < user_b_id)`,
  }),
);

export type FriendshipRow = typeof friendships.$inferSelect;
