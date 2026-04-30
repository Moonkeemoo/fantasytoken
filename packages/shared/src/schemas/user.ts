import { z } from 'zod';

export const TelegramUser = z.object({
  id: z.number().int().positive(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  language_code: z.string().optional(),
});
export type TelegramUser = z.infer<typeof TelegramUser>;

export const MeResponse = z.object({
  user: TelegramUser,
  balanceCents: z.number().int().nonnegative(),
  /** Server-side onboarding flag — false → frontend routes to /tutorial.
   * Survives wipes and crosses devices, unlike the localStorage cache. */
  tutorialDone: z.boolean(),
  /** Number of finalized contest entries the user has, ever. Drives the
   * onboarding R1→R3 action-gated unlocks (DESIGN.md §8): the lobby hides
   * paid cells until first Practice complete, etc. Default 0 for backward-
   * compat with pre-rollout responses. */
  finalizedContests: z.number().int().nonnegative().default(0),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const TutorialDoneResponse = z.object({
  tutorialDone: z.literal(true),
});
export type TutorialDoneResponse = z.infer<typeof TutorialDoneResponse>;
