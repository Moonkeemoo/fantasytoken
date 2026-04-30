import { z } from 'zod';

export const LineupRow = z.object({
  symbol: z.string(),
  imageUrl: z.string().nullable(),
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
  avatarUrl: z.string().nullable(),
  scorePct: z.number(),
  isMe: z.boolean(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntry>;

export const LiveResponse = z.object({
  contestId: z.string().uuid(),
  contestName: z.string(),
  /** ADR-0003: surface contest mode so the Live screen can colour helping/
   * hurting borders without a name-based heuristic. */
  type: z.enum(['bull', 'bear']).default('bull'),
  /** ADR-0003: $-first UX layer (display-only). */
  virtualBudgetCents: z.number().int().nonnegative().default(10_000_000),
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
  /** Prize for 1st place at the current pool. Used pre-start where ranks are
   * arbitrary tie-break order — show what's at the top of the mountain. */
  topPrizeCents: z.number().int().nonnegative(),
  /** Pay-curve flag mirrored from the contest. Drives the Scoreboard subtitle
   * ("top 50% pays" vs "all positions paid"). */
  payAll: z.boolean().default(false),
  lineup: z.array(LineupRow),
  leaderboardTop: z.array(LeaderboardEntry),
  leaderboardAll: z.array(LeaderboardEntry),
  userRow: LeaderboardEntry.nullable(),
});
export type LiveResponse = z.infer<typeof LiveResponse>;
