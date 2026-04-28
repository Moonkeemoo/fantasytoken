import { z } from 'zod';

export const Balance = z.object({
  currencyCode: z.literal('USD'),
  amountCents: z.number().int().nonnegative(),
});
export type Balance = z.infer<typeof Balance>;

export const TransactionType = z.enum(['WELCOME_BONUS', 'ENTRY_FEE', 'PRIZE_PAYOUT', 'REFUND']);
export type TransactionType = z.infer<typeof TransactionType>;
