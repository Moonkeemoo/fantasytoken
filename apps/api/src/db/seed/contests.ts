import type { Database } from '../client.js';
import type { Logger } from '../../logger.js';
import { createReplenishService } from '../../modules/contests/contests.replenish.js';

export interface SeedContestsArgs {
  adminTelegramId: number;
}

/**
 * Seed contests by delegating to the replenish service.
 * Maintains 3 scheduled contests (Quick Match, Memecoin Madness, High Stakes)
 * with startsAt = now+5min and endsAt = startsAt+10min. Idempotent by name+status.
 */
export async function seedContests(
  db: Database,
  args: SeedContestsArgs,
  log: Logger,
): Promise<{ created: number }> {
  const svc = createReplenishService({ db, log, adminTelegramId: args.adminTelegramId });
  return svc.replenish();
}
