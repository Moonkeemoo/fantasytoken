import { z } from 'zod';

export const RankingRow = z.object({
  rank: z.number().int().positive(),
  userId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  /** Rank-system tier rank (1..30). 1 = Newbie I, 30 = Mythic V. */
  tierRank: z.number().int().min(1).max(30),
  netPnlCents: z.number().int(),
  contestsPlayed: z.number().int().nonnegative(),
  isMe: z.boolean(),
});
export type RankingRow = z.infer<typeof RankingRow>;

export const FriendsRankingResponse = z.object({
  rows: z.array(RankingRow),
});
export type FriendsRankingResponse = z.infer<typeof FriendsRankingResponse>;

export const GlobalRankingResponse = z.object({
  top: z.array(RankingRow),
  me: RankingRow.omit({ isMe: true }).nullable(),
});
export type GlobalRankingResponse = z.infer<typeof GlobalRankingResponse>;
