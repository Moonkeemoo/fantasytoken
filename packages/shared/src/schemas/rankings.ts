import { z } from 'zod';

/** Sort axis for leaderboards. `total` is the legacy combined PnL ranking. */
export const RankingMode = z.enum(['total', 'bull', 'bear']);
export type RankingMode = z.infer<typeof RankingMode>;

export const RankingRow = z.object({
  rank: z.number().int().positive(),
  userId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  /** Rank-system tier rank (1..30). Optional for backward-compat with api versions
   * deployed before the rank system; defaults to 1 (Newbie I). */
  tierRank: z.number().int().min(1).max(30).default(1),
  /** Combined PnL across both modes — drives `mode=total` ranking. */
  netPnlCents: z.number().int(),
  /** Bull-contests only PnL (defaults to 0 on legacy clients). */
  bullPnlCents: z.number().int().default(0),
  /** Bear-contests only PnL (defaults to 0 on legacy clients). */
  bearPnlCents: z.number().int().default(0),
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
