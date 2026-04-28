import { z } from 'zod';

// Wire shape (catalog + search responses).
export const Token = z.object({
  symbol: z.string(),
  name: z.string(),
  // Numeric strings on the wire — DB stores numeric(30,9). Caller decides whether
  // to parseFloat for display. Keep precision through the boundary.
  currentPriceUsd: z.string().nullable(),
  pctChange24h: z.string().nullable(),
  marketCapUsd: z.string().nullable(),
});
export type Token = z.infer<typeof Token>;

export const TokenList = z.object({
  items: z.array(Token),
  page: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type TokenList = z.infer<typeof TokenList>;
