import { z } from 'zod';

export const ContestType = z.enum(['bull', 'bear']);
export type ContestType = z.infer<typeof ContestType>;

export const ContestFormat = z.enum(['sprint', 'marathon']);
export type ContestFormat = z.infer<typeof ContestFormat>;

export const ContestStatus = z.enum(['scheduled', 'active', 'finalizing', 'finalized']);
export type ContestStatus = z.infer<typeof ContestStatus>;

export const Contest = z.object({
  id: z.string().uuid(),
  type: ContestType,
  format: ContestFormat,
  status: ContestStatus,
  entryFeeStars: z.number().int().nonnegative(),
  prizePoolStars: z.number().int().nonnegative(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});
export type Contest = z.infer<typeof Contest>;
