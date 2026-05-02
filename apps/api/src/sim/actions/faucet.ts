import type { CurrencyService } from '../../modules/currency/currency.service.js';
import type { SimLogger } from '../log.js';

/**
 * Synth-only liveness faucet (2026-05-02).
 *
 * Background: after the welcome-grant-only economy rule (TZ-005 v2,
 * 2026-05-01) synthetics that lose their first ~10 contests on bad
 * luck end up at balance=0 with no path back into the game — they
 * pile up in `cannot_afford` indefinitely and the cohort thins out.
 * That's fine for a real player (they'd buy coins or come back next
 * day) but our cohort exists specifically to keep the leaderboard
 * lively so we can collect economic data; "drained forever" makes
 * the dataset worse.
 *
 * The faucet is a cohort-only liveness mechanism: when a synth has
 * been visibly stuck (≥3 `cannot_afford` events in the last 15 min)
 * and is genuinely empty (balance=0), top them back up to the
 * welcome floor. Limit one top-up per synth per hour so the synth
 * has to actually try to play between refills.
 *
 * Real users are never touched — INV-14 keeps synths off real-user
 * read paths, and the tick worker only iterates `is_synthetic=true`
 * rows. The DEV_GRANT type distinguishes these from real welcome
 * bonuses in audit queries.
 */

export interface FaucetArgs {
  userId: string;
  /** Coins to credit. Same as the welcome floor (20). */
  amountCoins: number;
}

export interface FaucetDeps {
  currency: CurrencyService;
  log: SimLogger;
}

export interface FaucetResult {
  kind: 'success' | 'error';
  newBalance?: bigint;
  errorCode?: string;
}

export async function applyFaucet(deps: FaucetDeps, args: FaucetArgs): Promise<FaucetResult> {
  try {
    const r = await deps.currency.transact({
      userId: args.userId,
      deltaCents: BigInt(args.amountCoins),
      type: 'DEV_GRANT',
    });
    await deps.log.log({
      userId: args.userId,
      action: 'faucet_top_up',
      outcome: 'success',
      payload: { amountCoins: args.amountCoins },
      balanceAfterCents: r.balanceAfter,
    });
    return { kind: 'success', newBalance: r.balanceAfter };
  } catch (err) {
    // INV-7: never silent. Tag a recognisable code for the polish loop.
    const code = (err as { code?: string }).code ?? 'INTERNAL';
    await deps.log.log({
      userId: args.userId,
      action: 'faucet_top_up',
      outcome: 'error',
      errorCode: code,
      payload: {
        amountCoins: args.amountCoins,
        message: err instanceof Error ? err.message : 'unknown',
      },
    });
    return { kind: 'error', errorCode: code };
  }
}
