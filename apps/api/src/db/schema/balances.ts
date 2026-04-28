import { bigint, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const balances = pgTable(
  'balances',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    currencyCode: varchar('currency_code', { length: 16 }).notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.currencyCode] }),
  }),
);

export type BalanceRow = typeof balances.$inferSelect;
