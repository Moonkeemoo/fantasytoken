import { z } from 'zod';

// TZ-005 — synthetic users contract.
//
// Why these enums live in shared:
//   The persona kind is stored on `users.persona_kind` (text + CHECK), and
//   admin endpoints accept it as a parameter. Same enum on both ends keeps
//   the CHECK constraint and HTTP validation in sync.

export const PERSONA_KINDS = [
  'whale',
  'casual',
  'meme_chaser',
  'newbie',
  'streaker',
  'inviter',
  'lurker',
] as const;

export const PersonaKind = z.enum(PERSONA_KINDS);
export type PersonaKind = z.infer<typeof PersonaKind>;

export const SyntheticAction = z.enum([
  'login',
  'idle',
  'join_contest',
  'submit_lineup',
  'invite_friend',
  'top_up',
  'view_result',
  // TZ-005 amended 2026-05-01 — emitted by tick.service when a synth wants
  // to play but every open contest is above their balance. Lets us spot
  // the drained moment (and conditions: balance, cheapest fee, persona).
  'cannot_afford',
]);
export type SyntheticAction = z.infer<typeof SyntheticAction>;

export const ActionOutcome = z.enum(['success', 'rejected', 'skipped', 'error']);
export type ActionOutcome = z.infer<typeof ActionOutcome>;

// Distribution sums to 1.0; partial maps allowed (caller normalises).
export const PersonaDistribution = z.record(PersonaKind, z.number().nonnegative());
export type PersonaDistribution = z.infer<typeof PersonaDistribution>;

// --- Admin endpoints ----------------------------------------------------

export const SimSeedBody = z.object({
  count: z.number().int().positive().max(10_000),
  /** Override default mix from sim.config.ts. Missing kinds use 0%. */
  distribution: PersonaDistribution.optional(),
  /** Deterministic seed for the whole batch. Same seed + count + distribution
   * → same set of synthetic users. Defaults to a random 32-bit int. */
  batchSeed: z.number().int().nonnegative().optional(),
});
export type SimSeedBody = z.infer<typeof SimSeedBody>;

export const SimSeedResult = z.object({
  createdCount: z.number().int().nonnegative(),
  byPersona: z.record(PersonaKind, z.number().int().nonnegative()),
  batchSeed: z.number().int().nonnegative(),
});
export type SimSeedResult = z.infer<typeof SimSeedResult>;

export const SimGrantCoinsBody = z.object({
  userId: z.string().uuid(),
  amountCoins: z.number().int().positive().max(1_000_000),
});
export type SimGrantCoinsBody = z.infer<typeof SimGrantCoinsBody>;

export const SimWipeBody = z.object({
  /** When true, return what would be deleted without committing. */
  dryRun: z.boolean().default(false),
});
export type SimWipeBody = z.infer<typeof SimWipeBody>;

export const SimWipeResult = z.object({
  deletedUsers: z.number().int().nonnegative(),
  deletedTransactions: z.number().int().nonnegative(),
  deletedEntries: z.number().int().nonnegative(),
  deletedLogRows: z.number().int().nonnegative(),
  dryRun: z.boolean(),
});
export type SimWipeResult = z.infer<typeof SimWipeResult>;
