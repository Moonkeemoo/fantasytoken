/**
 * TZ-005 §6 — CLI: pnpm sim:seed --count <N> [--seed <int>]
 *
 * Calls the same SeedService the admin endpoint uses, no HTTP layer. Useful
 * for prod ops via Railway shell or CI pipelines.
 */

import { loadConfig } from '../../config.js';
import { createDatabase } from '../../db/client.js';
import { createLogger } from '../../logger.js';
import { createCurrencyRepo } from '../../modules/currency/currency.repo.js';
import { createCurrencyService } from '../../modules/currency/currency.service.js';
import { createSeedRepo } from '../seed.repo.js';
import { createSeedService } from '../seed.service.js';

function parseArgs(argv: string[]): { count: number; batchSeed?: number } {
  const args = argv.slice(2);
  let count = 100;
  let batchSeed: number | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--count') {
      const v = args[++i];
      if (!v) throw new Error('--count requires a value');
      count = Number.parseInt(v, 10);
      if (!Number.isFinite(count) || count <= 0)
        throw new Error(`--count must be positive int, got ${v}`);
    } else if (a === '--seed') {
      const v = args[++i];
      if (!v) throw new Error('--seed requires a value');
      batchSeed = Number.parseInt(v, 10);
      if (!Number.isFinite(batchSeed) || batchSeed < 0) {
        throw new Error(`--seed must be non-negative int, got ${v}`);
      }
    }
  }
  return batchSeed === undefined ? { count } : { count, batchSeed };
}

async function main(): Promise<void> {
  const { count, batchSeed } = parseArgs(process.argv);
  const config = loadConfig();
  const logger = createLogger(config);
  const db = createDatabase(config);

  const currency = createCurrencyService(createCurrencyRepo(db));
  const seedSvc = createSeedService({ repo: createSeedRepo(db), currency });

  logger.info({ count, batchSeed }, 'sim.seed: starting');
  const result = await seedSvc.seed(batchSeed === undefined ? { count } : { count, batchSeed });
  logger.info(
    { createdCount: result.createdCount, byPersona: result.byPersona, batchSeed: result.batchSeed },
    'sim.seed: done',
  );
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('sim.seed failed:', err);
  process.exit(1);
});
