import { z } from 'zod';

export const TelegramUser = z.object({
  id: z.number().int().positive(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
});
export type TelegramUser = z.infer<typeof TelegramUser>;

export const MeResponse = z.object({
  user: TelegramUser,
  balanceCents: z.number().int().nonnegative(),
});
export type MeResponse = z.infer<typeof MeResponse>;
