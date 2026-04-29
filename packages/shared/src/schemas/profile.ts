import { z } from 'zod';
import { ContestType } from './contest.js';

export const ProfileStats = z.object({
  contestsPlayed: z.number().int().nonnegative(),
  /** 0..1 — fraction of finalized entries where prize_cents > 0. null if no finalized entries yet. */
  winRate: z.number().min(0).max(1).nullable(),
  /** Best (lowest) final_rank across finalized entries. null if none. */
  bestFinish: z.number().int().positive().nullable(),
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
