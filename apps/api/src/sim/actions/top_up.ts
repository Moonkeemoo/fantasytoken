import type { CurrencyService } from '../../modules/currency/currency.service.js';
import type { SimLogger } from '../log.js';

/**
 * Persona top-up via DEV_GRANT (Stars purchase is v2 — TZ §11).
 *
 * Caller has already decided this synth is eligible (cooldown elapsed,
 * persona has topUpBehavior). Action records the grant amount in the log
 * so we can chart "how much fake money have we minted to keep whales
 * playing?" — that's a direct economy-hole signal.
 *
 * INV-7: never throws. CurrencyService failures are logged as outcome=
 * 'error' so the tick worker keeps marching.
 */
export async function topUp(
  deps: { currency: CurrencyService; log: SimLogger },
  args: { userId: string; amountCoins: number },
): Promise<{ kind: 'success'; balanceAfter: bigint } | { kind: 'error'; message: string }> {
  try {
    const r = await deps.currency.transact({
      userId: args.userId,
      deltaCents: BigInt(args.amountCoins),
      type: 'DEV_GRANT',
    });
    await deps.log.log({
      userId: args.userId,
      action: 'top_up',
      outcome: 'success',
      payload: { amountCoins: args.amountCoins },
      balanceAfterCents: r.balanceAfter,
    });
    return { kind: 'success', balanceAfter: r.balanceAfter };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    await deps.log.log({
      userId: args.userId,
      action: 'top_up',
      outcome: 'error',
      errorCode: 'INTERNAL',
      payload: { amountCoins: args.amountCoins, message },
    });
    return { kind: 'error', message };
  }
}
