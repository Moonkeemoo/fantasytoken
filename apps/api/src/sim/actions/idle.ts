import type { SimLogger } from '../log.js';

/**
 * Logs an 'idle' tick. Captured occasionally — not every tick, otherwise
 * the log table balloons (1000 synths × 1440 ticks/day = 1.4M idle rows).
 * Caller decides when to invoke (sampling rate inside tick.service).
 */
export async function idle(
  deps: { log: SimLogger },
  args: { userId: string; hour: number },
): Promise<void> {
  await deps.log.log({
    userId: args.userId,
    action: 'idle',
    outcome: 'success',
    payload: { hour: args.hour },
  });
}
