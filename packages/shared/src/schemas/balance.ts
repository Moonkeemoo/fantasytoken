import { z } from 'zod';

// amountCents is `number` (not `bigint`) on the wire because JSON has no bigint type.
// TZ-002: post-coin-economy migration the field stores WHOLE COINS even though
// the column name is `amount_cents`. Single int comfortably covers any
// realistic balance (a Whale package only credits 65,000 coins).
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
  // TZ-002: Stars → Coins purchase via Telegram payment.
  'COINS_PURCHASE',
  // Referral system (REFERRAL_SYSTEM.md): commission paid to referrer when their
  // referee wins a contest; mutual signup bonuses unlocked on referee's 1st game;
  // claw-back of unused welcome bonus past 7-day expiry window.
  'REFERRAL_COMMISSION',
  'REFEREE_SIGNUP_BONUS',
  'RECRUITER_SIGNUP_BONUS',
  'WELCOME_EXPIRED',
]);
export type TransactionType = z.infer<typeof TransactionType>;
