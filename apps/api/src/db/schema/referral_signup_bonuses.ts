import { bigint, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { entries } from './entries.js';
import { transactions } from './transactions.js';

/**
 * Per-side row for the mutual referee/recruiter signup bonus.
 *
 * Pre-created with `unlocked_at = NULL` at attribution time (when the new user
 * lands via ref-link); flipped to non-null when the referee's first finalized
 * entry trips the unlock. The unique index on (user_id, bonus_type, source_user_id)
 * prevents double-payouts even if the unlock hook fires twice.
 *
 * Bonus is always soft USD per REFERRAL_SYSTEM.md §3 — never real currency.
 */
export const referralSignupBonuses = pgTable('referral_signup_bonuses', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Who receives the credit. */
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  /** For RECRUITER bonus: the referee whose first game triggered it.
   *  For REFEREE bonus: NULL (the recipient is the referee themselves). */
  sourceUserId: uuid('source_user_id').references(() => users.id),
  /** 'REFEREE' = $25 to the new user. 'RECRUITER' = $25 to their inviter. */
  bonusType: varchar('bonus_type', { length: 16 }).notNull(),
  amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
  /** Soft USD only in V1; column stays for forward compatibility. */
  currencyCode: varchar('currency_code', { length: 16 }).notNull().default('USD'),
  /** NULL until the referee finalizes their REQUIRED_CONTESTS_FOR_BONUS-th entry. */
  unlockedAt: timestamp('unlocked_at', { withTimezone: true }),
  /** The referee entry that tripped the unlock — for audit. */
  triggeredByEntryId: uuid('triggered_by_entry_id').references(() => entries.id),
  /** Link to CurrencyService.transact row when paid out (INV-9). */
  transactionId: uuid('transaction_id').references(() => transactions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ReferralSignupBonusRow = typeof referralSignupBonuses.$inferSelect;
