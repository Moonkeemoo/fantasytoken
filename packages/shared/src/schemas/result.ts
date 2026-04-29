import { z } from 'zod';

export const ResultOutcome = z.enum(['won', 'no_prize', 'cancelled']);
export type ResultOutcome = z.infer<typeof ResultOutcome>;

export const LineupFinalRow = z.object({
  symbol: z.string(),
  imageUrl: z.string().nullable(),
  alloc: z.number().int(),
  finalPlPct: z.number(),
});
export type LineupFinalRow = z.infer<typeof LineupFinalRow>;

export const ResultResponse = z.object({
  contestId: z.string().uuid(),
  entryId: z.string().uuid(),
  contestName: z.string(),
  outcome: ResultOutcome,
  prizeCents: z.number().int().nonnegative(),
  entryFeeCents: z.number().int().nonnegative(),
  netCents: z.number().int(),
  finalPlPct: z.number(),
  finalRank: z.number().int().positive().nullable(),
  totalEntries: z.number().int().nonnegative(),
  realEntries: z.number().int().nonnegative(),
  lineupFinal: z.array(LineupFinalRow),
});
export type ResultResponse = z.infer<typeof ResultResponse>;
