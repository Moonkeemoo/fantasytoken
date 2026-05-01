import { z } from 'zod';

export const LineupRow = z.object({
  symbol: z.string(),
  imageUrl: z.string().nullable(),
  alloc: z.number().int(),
  pctChange: z.number(),
  contribUsd: z.number(),
  /** Current spot price in USD. Drives the price+arrow widget on Live
   * (replaces the v1 histogram per user feedback). null when the price
   * snapshot is unavailable. Default `null` for back-compat. */
  currentPriceUsd: z.number().nullable().default(null),
});
export type LineupRow = z.infer<typeof LineupRow>;

export const LeaderboardPick = z.object({
  symbol: z.string(),
  /** Coingecko image URL for the symbol — resolved server-side so the
   * Spectator strip doesn't need a separate token-list fetch. Earlier
   * versions returned `picks: string[]` and the frontend looked images
   * up via `useTokenList(250)`, which silently dropped any symbol
   * outside the top-250 (long-tail memes/L1s rendered as letter
   * circles). Embedding the URL keeps the lookup correct for the full
   * 519-token catalog and removes a round-trip. null when the catalog
   * row has no image (rare; CoinGecko nearly always provides one). */
  imageUrl: z.string().nullable(),
});
export type LeaderboardPick = z.infer<typeof LeaderboardPick>;

export const LeaderboardEntry = z.object({
  rank: z.number().int().positive(),
  entryId: z.string().uuid(),
  isBot: z.boolean(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  scorePct: z.number(),
  isMe: z.boolean(),
  /** {symbol, imageUrl} pairs — surfaces in the Spectator leaderboard
   * as a 5-icon strip so watchers can read the room composition.
   * Allocations are intentionally omitted (privacy + the equal-split
   * rule means they're derivable from count anyway). Default `[]` for
   * backward-compat with pre-rollout API responses. */
  picks: z.array(LeaderboardPick).default([]),
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
  /** ADR-0008: paying-rank cutoff for the cash-line indicator on the
   * live leaderboard. 0 means "no cutoff data" (legacy). */
  payingRanks: z.number().int().nonnegative().default(0),
  lineup: z.array(LineupRow),
  leaderboardTop: z.array(LeaderboardEntry),
  leaderboardAll: z.array(LeaderboardEntry),
  userRow: LeaderboardEntry.nullable(),
});
export type LiveResponse = z.infer<typeof LiveResponse>;
