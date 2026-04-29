import { z } from 'zod';

// amountCents is `number` (not `bigint`) on the wire because JSON has no bigint type.
// MAX_SAFE_INTEGER (2^53 − 1) ≈ $90_000_000_000_000.00 — adequate for MVP balances.
// DB column is BIGINT (apps/api/src/db/schema/balances.ts); cast at the route boundary.
export const Balance = z.object({
  currencyCode: z.literal('USD'),
  amountCents: z.number().int().nonnegative(),
});
export type Balance = z.infer<typeof Balance>;

export const TransactionType = z.enum([
  'WELCOME_BONUS',
  'ENTRY_FEE',
  'PRIZE_PAYOUT',
  'REFUND',
  // Referral system (REFERRAL_SYSTEM.md): commission paid to referrer when their
  // referee wins a contest; mutual signup bonuses unlocked on referee's 1st game;
  // claw-back of unused welcome bonus past 7-day expiry window.
  'REFERRAL_COMMISSION',
  'REFEREE_SIGNUP_BONUS',
  'RECRUITER_SIGNUP_BONUS',
  'WELCOME_EXPIRED',
]);
export type TransactionType = z.infer<typeof TransactionType>;
