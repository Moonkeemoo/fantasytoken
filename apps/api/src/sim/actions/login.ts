import type { SimLogger } from '../log.js';

/**
 * Logs a 'login' tick. No external side effects — login is a pure
 * "is this synth active right now?" decision; downstream actions read
 * the log to detect login bursts (e.g. spotting peak-hours coincidence).
 */
export async function login(
  deps: { log: SimLogger },
  args: { userId: string; hour: number },
): Promise<void> {
  await deps.log.log({
    userId: args.userId,
    action: 'login',
    outcome: 'success',
    payload: { hour: args.hour },
  });
}
