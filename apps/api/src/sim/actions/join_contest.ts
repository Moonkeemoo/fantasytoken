import { AppError } from '../../lib/errors.js';
import type { CurrencyService } from '../../modules/currency/currency.service.js';
import type { EntriesService } from '../../modules/entries/entries.service.js';
import type { SimLogger } from '../log.js';
import type { TokenBias } from '../sim.config.js';
import { pickLineup, type PoolToken } from '../lineup_picker.js';

/**
 * sim/actions/join_contest.ts — single-synth contest entry action.
 *
 * Wraps `entriesService.submit` so:
 *   1. The synth picks a lineup from a persona-biased token pool.
 *   2. Outcome (success / rejected / error) is captured WITH the AppError
 *      code, so the polish loop can grep the log for INSUFFICIENT_COINS
 *      etc. and surface economy holes.
 *   3. Post-action balance is snapshotted into `balance_after_cents`.
 *
 * INV-7: NEVER throws. All failures degrade to log rows. The caller
 * (tick worker, wave service) keeps marching.
 */

export interface JoinContestArgs {
  syntheticUser: {
    id: string;
    syntheticSeed: number;
  };
  contest: {
    id: string;
    entryFeeCents: bigint;
  };
  pool: readonly PoolToken[];
  bias: TokenBias;
  size: number;
  /** Source of randomness for the pick. Defaults to a deterministic stream
   * derived from synthetic_seed so re-running a tick reproduces lineups. */
  rand?: () => number;
}

export type JoinContestOutcome =
  | { kind: 'success'; entryId: string; picks: string[] }
  | { kind: 'already_entered'; entryId: string }
  | { kind: 'rejected'; errorCode: string; message: string }
  | { kind: 'error'; errorCode: string; message: string };

export interface JoinContestDeps {
  entries: EntriesService;
  currency: CurrencyService;
  log: SimLogger;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function joinContest(
  deps: JoinContestDeps,
  args: JoinContestArgs,
): Promise<JoinContestOutcome> {
  // Mix the seed with millisecond clock so two ticks of the same synth
  // pick distinct lineups while a single tick replays deterministically.
  const seedMix = (args.syntheticUser.syntheticSeed ^ Date.now()) >>> 0;
  const rand = args.rand ?? mulberry32(seedMix);
  const picks = pickLineup({ pool: args.pool, bias: args.bias, size: args.size, rand });

  // Empty pool / failed pick → log skipped, don't even attempt submit.
  if (picks.length === 0) {
    await deps.log.log({
      userId: args.syntheticUser.id,
      action: 'join_contest',
      outcome: 'skipped',
      errorCode: 'EMPTY_POOL',
      payload: { contestId: args.contest.id },
    });
    return { kind: 'rejected', errorCode: 'EMPTY_POOL', message: 'token pool empty' };
  }

  try {
    const r = await deps.entries.submit({
      userId: args.syntheticUser.id,
      contestId: args.contest.id,
      picks,
    });

    const balanceAfter = await safeBalance(deps.currency, args.syntheticUser.id);

    if (r.alreadyEntered) {
      await deps.log.log({
        userId: args.syntheticUser.id,
        action: 'join_contest',
        outcome: 'skipped',
        errorCode: 'ALREADY_ENTERED',
        payload: { contestId: args.contest.id, entryId: r.entryId },
        balanceAfterCents: balanceAfter,
      });
      return { kind: 'already_entered', entryId: r.entryId };
    }

    await deps.log.log({
      userId: args.syntheticUser.id,
      action: 'join_contest',
      outcome: 'success',
      payload: {
        contestId: args.contest.id,
        entryId: r.entryId,
        picks,
        entryFeeCents: Number(args.contest.entryFeeCents),
      },
      balanceAfterCents: balanceAfter,
    });
    return { kind: 'success', entryId: r.entryId, picks };
  } catch (err) {
    const balanceAfter = await safeBalance(deps.currency, args.syntheticUser.id);
    const isApp = err instanceof AppError;
    const errorCode = isApp ? err.code : 'INTERNAL';
    const message = err instanceof Error ? err.message : 'unknown';
    await deps.log.log({
      userId: args.syntheticUser.id,
      action: 'join_contest',
      outcome: isApp ? 'rejected' : 'error',
      errorCode,
      payload: {
        contestId: args.contest.id,
        attemptedPicks: picks,
        entryFeeCents: Number(args.contest.entryFeeCents),
      },
      balanceAfterCents: balanceAfter,
    });
    return isApp ? { kind: 'rejected', errorCode, message } : { kind: 'error', errorCode, message };
  }
}

async function safeBalance(currency: CurrencyService, userId: string): Promise<bigint | null> {
  try {
    return await currency.getBalance(userId);
  } catch {
    return null;
  }
}
