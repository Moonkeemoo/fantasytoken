import { bigint, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.js';

// INV-9: immutable audit log. Source of truth for balances.
// TZ-002: amounts here are now WHOLE COINS (column name kept for migration
// minimality; the unit semantic is what changed, not the storage shape).
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    currencyCode: varchar('currency_code', { length: 16 }).notNull(),
    deltaCents: bigint('delta_cents', { mode: 'bigint' }).notNull(),
    type: varchar('type', { length: 32 }).notNull(), // COINS_PURCHASE|WELCOME_BONUS|ENTRY_FEE|PRIZE_PAYOUT|REFUND
    refType: varchar('ref_type', { length: 16 }), // 'contest' | 'entry' | 'package' | null
    refId: text('ref_id'),
    /** TG `telegram_payment_charge_id` for COINS_PURCHASE rows. UNIQUE WHERE NOT NULL —
     * defends against TG webhook retries triggering double credits. */
    paymentChargeId: text('payment_charge_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byUser: index('tx_by_user_idx').on(t.userId, t.createdAt),
    byRef: index('tx_by_ref_idx').on(t.refType, t.refId),
  }),
);

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
