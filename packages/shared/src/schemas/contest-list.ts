import { z } from 'zod';
import { ContestStatus, ContestType } from './contest.js';
import { PRIZE_FORMATS } from '../prize-curve/index.js';

export const ContestFilter = z.enum(['cash', 'free', 'my']);
export type ContestFilter = z.infer<typeof ContestFilter>;

// Lobby-row projection (subset of full Contest + spotsFilled aggregation).
export const ContestListItem = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: ContestType,
  status: ContestStatus,
  entryFeeCents: z.number().int().nonnegative(),
  prizePoolCents: z.number().int().nonnegative(),
  maxCapacity: z.number().int().positive(),
  spotsFilled: z.number().int().nonnegative(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isFeatured: z.boolean(),
  /** Min rank required to enter (rank-system gate). 1 = open to everyone.
   * Optional for backward-compat: api responses from before the rank-system
   * deploy default to 1, so the frontend doesn't crash on old data. */
  minRank: z.number().int().min(1).max(30).default(1),
  /** When true, every entry receives a (decaying) prize share — used by
   * Practice. Defaults false for backward-compat with pre-deploy responses. */
  payAll: z.boolean().default(false),
  /** ADR-0008: prize structure. 'gpp' default for legacy/unknown rows. */
  prizeFormat: z.enum(PRIZE_FORMATS).default('gpp'),
  /** Cutoff rank: ranks ≤ payingRanks receive a prize, > payingRanks get 0.
   * Pre-computed server-side from `prizeFormat` + `maxCapacity` so the
   * lobby card can render "Top X paid" without re-doing the math. */
  payingRanks: z.number().int().nonnegative().default(0),
  /** Top-1 payout in coins, derived from `prizeFormat` over the room's
   * projected pool. Drives "Win up to" copy on the lobby card. */
  topPrize: z.number().int().nonnegative().default(0),
  /** Lowest paying rank's payout in coins. Drives "min cash" copy. */
  minCash: z.number().int().nonnegative().default(0),
  /** ADR-0003: $-first UX. Virtual budget in cents per contest (display-only;
   * backend score / payout still runs in % space). Default 10_000_000 = $100K
   * matches the legacy fixed-budget concept. Optional for backward-compat
   * with pre-0017 API responses. */
  virtualBudgetCents: z.number().int().nonnegative().default(10_000_000),
  // True if the requesting user has an entry in this contest.
  userHasEntered: z.boolean(),
});
export type ContestListItem = z.infer<typeof ContestListItem>;

export const ContestListResponse = z.object({
  items: z.array(ContestListItem),
});
export type ContestListResponse = z.infer<typeof ContestListResponse>;

// Admin create body.
export const CreateContestBody = z.object({
  name: z.string().min(1).max(80),
  entryFeeCents: z.number().int().nonnegative(),
  prizePoolCents: z.number().int().nonnegative(),
  maxCapacity: z.number().int().positive().max(100_000),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isFeatured: z.boolean().default(false),
});
export type CreateContestBody = z.infer<typeof CreateContestBody>;
