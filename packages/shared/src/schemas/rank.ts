import { z } from 'zod';

export const RankResponse = z.object({
  currentRank: z.number().int().min(1).max(30),
  tier: z.string(),
  tierRoman: z.string(),
  display: z.string(), // "Trader II"
  color: z.string(), // tier hex
  xpTotal: z.number().int().nonnegative(),
  xpSeason: z.number().int().nonnegative(),
  xpInRank: z.number().int().nonnegative(),
  xpForRank: z.number().int().nonnegative(),
  remainingToNext: z.number().int().nonnegative(),
  atMax: z.boolean(),
  careerHighestRank: z.number().int().min(1).max(30),
});
export type RankResponse = z.infer<typeof RankResponse>;

export const SeasonResponse = z.object({
  id: z.string().uuid(),
  number: z.number().int().positive(),
  name: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  daysLeft: z.number().int().nonnegative(),
});
export type SeasonResponse = z.infer<typeof SeasonResponse>;

export const NextUnlock = z.object({
  rank: z.number().int().min(1).max(30),
  name: z.string(),
  type: z.enum(['contest', 'cosmetic', 'feature']),
  description: z.string(),
});
export type NextUnlock = z.infer<typeof NextUnlock>;

export const TeaserResponse = z.object({
  nextRank: z.number().int().min(1).max(30).nullable(),
  xpToNext: z.number().int().nonnegative(),
  nextUnlock: NextUnlock.nullable(),
});
export type TeaserResponse = z.infer<typeof TeaserResponse>;
