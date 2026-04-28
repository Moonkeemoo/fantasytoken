import { z } from 'zod';

export const LineupRow = z.object({
  symbol: z.string(),
  alloc: z.number().int(),
  pctChange: z.number(),
  contribUsd: z.number(),
});
export type LineupRow = z.infer<typeof LineupRow>;

export const LeaderboardEntry = z.object({
  rank: z.number().int().positive(),
  entryId: z.string().uuid(),
  isBot: z.boolean(),
  displayName: z.string(),
  scorePct: z.number(),
  isMe: z.boolean(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntry>;

export const LiveResponse = z.object({
  contestId: z.string().uuid(),
  contestName: z.string(),
  status: z.enum(['scheduled', 'active', 'finalizing', 'finalized', 'cancelled']),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  portfolio: z.object({
    startUsd: z.number(),
    currentUsd: z.number(),
    plPct: z.number(),
  }),
  rank: z.number().int().positive().nullable(),
  totalEntries: z.number().int().nonnegative(),
  realEntries: z.number().int().nonnegative(),
  projectedPrizeCents: z.number().int().nonnegative(),
  lineup: z.array(LineupRow),
  leaderboardTop: z.array(LeaderboardEntry),
  leaderboardAll: z.array(LeaderboardEntry),
  userRow: LeaderboardEntry.nullable(),
});
export type LiveResponse = z.infer<typeof LiveResponse>;
