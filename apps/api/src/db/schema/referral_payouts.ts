import { bigint, index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { contests } from './contests.js';
import { entries } from './entries.js';
import { transactions } from './transactions.js';

/**
 * Immutable audit log of every commission payout. INV-14 — once written, no
 * UPDATE; corrections happen as a REVERSAL row (mirrors INV-9 transactions).
 *
 * One row per (recipient × source-entry × level), enforced via the unique
 * partial index in 0011 — re-running finalize never double-pays.
 */
export const referralPayouts = pgTable(
  'referral_payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Who got the commission credited. */
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id),
    /** Who actually won the contest (the bottom of the L1/L2 chain). */
    sourceUserId: uuid('source_user_id')
      .notNull()
      .references(() => users.id),
    sourceContestId: uuid('source_contest_id')
      .notNull()
      .references(() => contests.id),
    sourceEntryId: uuid('source_entry_id')
      .notNull()
      .references(() => entries.id),
    /** 1 = direct inviter, 2 = inviter's inviter. INV-15 caps at 2. */
    level: integer('level').notNull(),
    /** Effective rate used (basis points), captured for audit even if rates change later. */
    commissionPctBps: integer('commission_pct_bps').notNull(),
    /** Friend's gross prize, in source contest currency. */
    sourcePrizeCents: bigint('source_prize_cents', { mode: 'bigint' }).notNull(),
    /** What we actually paid out (floor of prize × pct / 10000). */
    payoutCents: bigint('payout_cents', { mode: 'bigint' }).notNull(),
    /** 'USD' | 'STARS' | 'TON' — currency of source contest = currency of payout. */
    currencyCode: varchar('currency_code', { length: 16 }).notNull(),
    /** Link to the underlying CurrencyService.transact row (INV-9). Nullable so a
     * payout failure can still leave an audit trail; reconciliation joins on this. */
    transactionId: uuid('transaction_id').references(() => transactions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    recipientCreatedIdx: index('rp_recipient_created_idx').on(t.recipientUserId, t.createdAt),
    sourceEntryIdx: index('rp_source_entry_idx').on(t.sourceEntryId),
  }),
);

export type ReferralPayoutRow = typeof referralPayouts.$inferSelect;
