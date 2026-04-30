import { z } from 'zod';

/**
 * Public lineups feed for the Browse-others screen (TZ-001 §07, ADR-0003).
 *
 * Privacy contract — pre-kickoff: ONLY user handle + symbols + submittedAt.
 * No allocations, no entry fee, no PnL, no rank. Backend MUST NOT include
 * those fields even if asked. (Handoff §13 Q5 — confirmed product decision.)
 */

export const LineupSummary = z.object({
  user: z.string(),
  submittedAt: z.string().datetime(),
  picks: z.array(z.string()),
});
export type LineupSummary = z.infer<typeof LineupSummary>;

export const LineupsListResponse = z.object({
  lineups: z.array(LineupSummary),
  total: z.number().int().nonnegative(),
});
export type LineupsListResponse = z.infer<typeof LineupsListResponse>;

export const LineupsFilter = z.enum(['all', 'friends', 'recent']).default('all');
export type LineupsFilter = z.infer<typeof LineupsFilter>;
