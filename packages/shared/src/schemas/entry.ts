import { z } from 'zod';
import {
  ALLOCATION_MAX_PCT,
  ALLOCATION_MIN_PCT,
  ALLOCATION_STEP_PCT,
  PORTFOLIO_PCT_TOTAL,
  PORTFOLIO_TOKEN_COUNT,
} from '../constants.js';

export const EntryPick = z.object({
  symbol: z.string().min(1).max(20),
  alloc: z
    .number()
    .int()
    .min(ALLOCATION_MIN_PCT)
    .max(ALLOCATION_MAX_PCT)
    .refine((n) => n % ALLOCATION_STEP_PCT === 0, {
      message: `alloc must be a multiple of ${ALLOCATION_STEP_PCT}`,
    }),
});
export type EntryPick = z.infer<typeof EntryPick>;

export const entrySubmissionSchema = z
  .object({
    picks: z.array(EntryPick).length(PORTFOLIO_TOKEN_COUNT),
  })
  .refine((v) => v.picks.reduce((sum, p) => sum + p.alloc, 0) === PORTFOLIO_PCT_TOTAL, {
    message: `picks alloc must sum to ${PORTFOLIO_PCT_TOTAL}`,
    path: ['picks'],
  })
  .refine((v) => new Set(v.picks.map((p) => p.symbol)).size === v.picks.length, {
    message: 'picks must be unique by symbol',
    path: ['picks'],
  });

export type EntrySubmission = z.infer<typeof entrySubmissionSchema>;

export const EntrySubmissionResult = z.object({
  entryId: z.string().uuid(),
  contestId: z.string().uuid(),
  submittedAt: z.string().datetime(),
  alreadyEntered: z.boolean(),
});
export type EntrySubmissionResult = z.infer<typeof EntrySubmissionResult>;
