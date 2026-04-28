import { z } from 'zod';

// MVP: single currency USD in cents. INV-4 frozen — `type` field deferred,
// keep for forward-compat but defaults to bull on read.
export const ContestType = z.enum(['bull', 'bear']);
export type ContestType = z.infer<typeof ContestType>;

export const ContestStatus = z.enum([
  'scheduled',
  'active',
  'finalizing',
  'finalized',
  'cancelled',
]);
export type ContestStatus = z.infer<typeof ContestStatus>;

export const Contest = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  type: ContestType.default('bull'),
  status: ContestStatus,
  entryFeeCents: z.number().int().nonnegative(),
  prizePoolCents: z.number().int().nonnegative(),
  maxCapacity: z.number().int().positive(),
  spotsFilled: z.number().int().nonnegative(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isFeatured: z.boolean(),
});
export type Contest = z.infer<typeof Contest>;
