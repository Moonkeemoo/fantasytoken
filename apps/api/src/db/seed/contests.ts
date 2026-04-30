import type { Database } from '../client.js';
import type { Logger } from '../../logger.js';
import { createSchedulerService } from '../../modules/contests/contests.scheduler.js';

export interface SeedContestsArgs {
  adminTelegramId: number;
}

/**
 * Seed contests by delegating to the matrix scheduler — every cell from
 * MATRIX_CELLS that doesn't have a live instance gets one created. Idempotent
 * via INV-13 unique-cell index.
 */
export async function seedContests(
  db: Database,
  args: SeedContestsArgs,
  log: Logger,
): Promise<{ created: number }> {
  const svc = createSchedulerService({ db, log, adminTelegramId: args.adminTelegramId });
  return svc.schedule();
}
