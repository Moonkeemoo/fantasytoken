import { sql } from 'drizzle-orm';
import { bigint, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const balances = pgTable(
  'balances',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    currencyCode: varchar('currency_code', { length: 16 }).notNull(),
    // mode:'bigint' for INV-9 — CurrencyService operates on bigint end-to-end.
    // default uses sql`0` not 0n because drizzle-kit 0.28 cannot serialize BigInt literals.
    amountCents: bigint('amount_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.currencyCode] }),
  }),
);

export type BalanceRow = typeof balances.$inferSelect;
