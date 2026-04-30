import { z } from 'zod';
import { PORTFOLIO_TOKEN_COUNT } from '../constants.js';

/**
 * TZ-003 (equal-split allocation): wire payload is now just an array of
 * symbols. Allocation is auto-computed evenly server-side. EntryPick is
 * kept for the legacy `entries.picks` JSON shape that older rows still
 * carry — new rows store `allocCents` (basis points, 10000 = 100%) which
 * is more precise than the old integer `alloc` (% multiples of 5).
 */
export const EntryPick = z.object({
  symbol: z.string().min(1).max(20),
  alloc: z.number().int().min(0).max(100),
});
export type EntryPick = z.infer<typeof EntryPick>;

/** Lineup is 1–5 unique symbols. */
const SymList = z
  .array(z.string().min(1).max(20))
  .min(1)
  .max(PORTFOLIO_TOKEN_COUNT)
  .refine((arr) => new Set(arr).size === arr.length, {
    message: 'picks must be unique by symbol',
  });

export const entrySubmissionSchema = z.object({
  picks: SymList,
});
export type EntrySubmission = z.infer<typeof entrySubmissionSchema>;

export const EntrySubmissionResult = z.object({
  entryId: z.string().uuid(),
  contestId: z.string().uuid(),
  submittedAt: z.string().datetime(),
  alreadyEntered: z.boolean(),
});
export type EntrySubmissionResult = z.infer<typeof EntrySubmissionResult>;

/**
 * Equal-split with deterministic round-off (TZ-003 §4):
 *   1 token  → [10000]
 *   2 tokens → [5000, 5000]
 *   3 tokens → [3334, 3333, 3333]   ← remainder goes to picks[0]
 *   4 tokens → [2500, 2500, 2500, 2500]
 *   5 tokens → [2000, 2000, 2000, 2000, 2000]
 *
 * "alloc cents" means basis points (1% = 100 alloc cents, 100% = 10000).
 * Stored as integer to avoid float drift in scoring math.
 */
export const ALLOC_CENTS_TOTAL = 10_000 as const;

export function evenAllocCents(symbols: readonly string[]): number[] {
  const n = symbols.length;
  if (n === 0) return [];
  const base = Math.floor(ALLOC_CENTS_TOTAL / n);
  const remainder = ALLOC_CENTS_TOTAL - base * n;
  return symbols.map((_, i) => base + (i < remainder ? 1 : 0));
}
