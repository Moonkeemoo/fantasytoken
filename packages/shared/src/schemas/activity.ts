import { z } from 'zod';

/**
 * Locked-room activity feed (TZ-001 §06.2 / handoff §13 Q4).
 * `user` is intentionally a first-name-only handle (or anonymized fallback)
 * so the rotating "@neonbat just locked in" line doesn't leak username +
 * stake patterns to onlookers.
 */

export const ActivityItem = z.object({
  user: z.string(),
  /** Action key — frontend maps to a localized string. v1: 'locked-in' only. */
  action: z.literal('locked-in'),
  submittedAt: z.string().datetime(),
});
export type ActivityItem = z.infer<typeof ActivityItem>;

export const ActivityResponse = z.object({
  items: z.array(ActivityItem),
});
export type ActivityResponse = z.infer<typeof ActivityResponse>;
