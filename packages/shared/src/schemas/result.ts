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

export const XpAwardBreakdownRow = z.object({
  reason: z.string(),
  amount: z.number().int(),
});
export type XpAwardBreakdownRow = z.infer<typeof XpAwardBreakdownRow>;

export const XpAwardSummary = z.object({
  total: z.number().int().nonnegative(),
  breakdown: z.array(XpAwardBreakdownRow),
});
export type XpAwardSummary = z.infer<typeof XpAwardSummary>;

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
  /** XP earned from this contest (rank-system). Null for cancelled or pre-rank-system entries. */
  xpAward: XpAwardSummary.nullable(),
});
export type ResultResponse = z.infer<typeof ResultResponse>;
