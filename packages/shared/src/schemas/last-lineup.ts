import { z } from 'zod';

/**
 * GET /me/last-lineup — caller's most recently submitted lineup, regardless
 * of contest status. Used by DraftScreen's StartFromStrip to surface a
 * "Last team" personal preset (TZ-001 §05.3).
 *
 * `lineup: null` when the user has never entered a contest.
 */

export const LastLineupPick = z.object({
  symbol: z.string(),
  alloc: z.number().int().min(0).max(100),
});
export type LastLineupPick = z.infer<typeof LastLineupPick>;

export const LastLineupResponse = z.object({
  lineup: z
    .object({
      contestId: z.string().uuid(),
      contestName: z.string(),
      submittedAt: z.string().datetime(),
      /** Latest known PnL pct on the entry. Renders as `+12.4%` on the preset card.
       * `null` if the contest hasn't started yet (no score recorded). */
      pnlPct: z.number().nullable(),
      picks: z.array(LastLineupPick),
    })
    .nullable(),
});
export type LastLineupResponse = z.infer<typeof LastLineupResponse>;
