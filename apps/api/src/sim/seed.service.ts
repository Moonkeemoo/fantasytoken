import type { PersonaKind } from '@fantasytoken/shared';
import { PERSONA_KINDS } from '@fantasytoken/shared';
import { SIM_CONFIG } from './sim.config.js';
import { generateIdentity } from './naming.js';
import type { CurrencyService } from '../modules/currency/currency.service.js';

export interface SeedSyntheticUserInput {
  personaKind: PersonaKind;
  syntheticSeed: number;
  handle: string;
  firstName: string;
  /** Set on insert when this synthetic is being created via a referral
   * cascade (M4). For batch seeds this stays unset. The 60s/0-entries
   * guards in users.setReferrerIfEligible are intentionally bypassed —
   * synthetics control their own birth ordering. */
  referrerUserId?: string;
}

export interface SeedSyntheticUserResult {
  id: string;
  telegramId: number;
}

export interface SeedRepo {
  /**
   * Insert one synthetic user, claiming a fresh negative telegram_id from
   * the `synthetic_telegram_id_seq` sequence. Marks tutorial as done so
   * synthetics skip the onboarding screens. Caller resolves seed→handle
   * collisions by retrying with a different seed.
   */
  createSynthetic(input: SeedSyntheticUserInput): Promise<SeedSyntheticUserResult>;
}

export interface SeedServiceDeps {
  repo: SeedRepo;
  currency: CurrencyService;
  /** Override SIM_CONFIG (testing). Defaults to the production config. */
  config?: typeof SIM_CONFIG;
  /** Random source. Defaults to Math.random. Tests pass a seeded PRNG. */
  random?: () => number;
}

export interface SeedArgs {
  count: number;
  distribution?: Partial<Record<PersonaKind, number>>;
  /** Deterministic seed for the whole batch (per-user seeds derived from it). */
  batchSeed?: number;
}

export interface SeedResult {
  createdCount: number;
  byPersona: Record<PersonaKind, number>;
  batchSeed: number;
  /** IDs in insert order. Useful for downstream verification / linking. */
  userIds: string[];
}

export interface SeedService {
  seed(args: SeedArgs): Promise<SeedResult>;
}

/**
 * Compute integer per-persona counts that sum exactly to `count`.
 * Largest-remainder method: floor each fractional share, distribute the
 * remainder to the personas with the largest fractional parts. Stable
 * ordering on PERSONA_KINDS so the same input yields the same allocation.
 */
export function allocatePersonaCounts(
  count: number,
  distribution: Record<PersonaKind, number>,
): Record<PersonaKind, number> {
  const total = PERSONA_KINDS.reduce((acc, k) => acc + (distribution[k] ?? 0), 0);
  if (total <= 0) {
    throw new Error('seed: distribution sums to zero');
  }
  const raw: Record<PersonaKind, number> = {} as Record<PersonaKind, number>;
  const floors: Record<PersonaKind, number> = {} as Record<PersonaKind, number>;
  let assigned = 0;
  for (const k of PERSONA_KINDS) {
    const r = ((distribution[k] ?? 0) / total) * count;
    raw[k] = r;
    floors[k] = Math.floor(r);
    assigned += floors[k];
  }
  let remainder = count - assigned;
  // Largest fractional part wins the leftover.
  const ranked = [...PERSONA_KINDS].sort((a, b) => raw[b] - floors[b] - (raw[a] - floors[a]));
  for (const k of ranked) {
    if (remainder <= 0) break;
    floors[k] += 1;
    remainder -= 1;
  }
  return floors;
}

export function createSeedService(deps: SeedServiceDeps): SeedService {
  const config = deps.config ?? SIM_CONFIG;
  const random = deps.random ?? Math.random;

  return {
    async seed({ count, distribution, batchSeed }) {
      // Per shared/sim.ts: a caller-provided distribution is treated as a
      // FULL spec — missing kinds default to 0%. Otherwise the SIM_CONFIG
      // defaults apply. Mixing the two would obscure intent ("did the
      // operator mean to zero this kind, or just forget it?").
      const effective: Record<PersonaKind, number> = distribution
        ? (Object.fromEntries(PERSONA_KINDS.map((k) => [k, distribution[k] ?? 0])) as Record<
            PersonaKind,
            number
          >)
        : { ...config.distribution };
      const counts = allocatePersonaCounts(count, effective);
      const resolvedBatchSeed = batchSeed ?? Math.floor(random() * 0xffffffff);

      const userIds: string[] = [];
      const byPersona: Record<PersonaKind, number> = Object.fromEntries(
        PERSONA_KINDS.map((k) => [k, 0]),
      ) as Record<PersonaKind, number>;

      // Per-user seeds derived from batchSeed + a counter, so the whole
      // batch is reproducible from one number.
      let seedCounter = 0;

      for (const persona of PERSONA_KINDS) {
        const wanted = counts[persona];
        const startingCoins = config.personas[persona].startingCoins;
        for (let i = 0; i < wanted; i++) {
          const userSeed = ((resolvedBatchSeed + seedCounter * 0x9e3779b9) >>> 0) | 1; // odd, non-zero
          seedCounter++;
          const id = generateIdentity(userSeed);
          const created = await deps.repo.createSynthetic({
            personaKind: persona,
            syntheticSeed: userSeed,
            handle: id.handle,
            firstName: id.firstName,
          });
          userIds.push(created.id);
          byPersona[persona] += 1;

          if (startingCoins > 0) {
            await deps.currency.transact({
              userId: created.id,
              deltaCents: BigInt(startingCoins),
              type: 'DEV_GRANT',
            });
          }
        }
      }

      return {
        createdCount: userIds.length,
        byPersona,
        batchSeed: resolvedBatchSeed,
        userIds,
      };
    },
  };
}
