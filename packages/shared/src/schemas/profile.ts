import { z } from 'zod';
import { ContestType } from './contest.js';

export const ProfileStats = z.object({
  contestsPlayed: z.number().int().nonnegative(),
  /** 0..1 — wonContests / (wonContests + lostContests). Even (cancelled with refund) excluded.
   * null if user has no decided contests yet. */
  winRate: z.number().min(0).max(1).nullable(),
  /** Best single-contest P&L cents in a Bull contest. null if user hasn't played any.
   * Split by mode so the player sees "best Bull" and "best Bear" as separate
   * achievements — PnL math is mode-neutral (INV-4) but the emotional metric
   * "where I crushed it" reads better when the comparison is within mode. */
  bestBullPnlCents: z.number().int().nullable(),
  bestBearPnlCents: z.number().int().nullable(),
  /** Legacy single-best across all modes — kept for back-compat with older clients
   * that haven't picked up the bull/bear split yet. Equals max(bestBull, bestBear). */
  bestPnlCents: z.number().int().nullable(),
  allTimePnlCents: z.number().int(),
});
export type ProfileStats = z.infer<typeof ProfileStats>;

export const ProfileRecentContest = z.object({
  contestId: z.string().uuid(),
  contestName: z.string(),
  contestType: ContestType,
  finalRank: z.number().int().positive().nullable(),
  totalEntries: z.number().int().nonnegative(),
  finishedAt: z.string().datetime(),
  netPnlCents: z.number().int(),
});
export type ProfileRecentContest = z.infer<typeof ProfileRecentContest>;

export const ProfileResponse = z.object({
  user: z.object({
    telegramId: z.number().int().positive(),
    firstName: z.string(),
    username: z.string().nullable(),
    photoUrl: z.string().nullable(),
  }),
  balanceCents: z.number().int().nonnegative(),
  stats: ProfileStats,
  recentContests: z.array(ProfileRecentContest),
});
export type ProfileResponse = z.infer<typeof ProfileResponse>;
