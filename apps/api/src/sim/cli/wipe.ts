/**
 * TZ-005 §6 — CLI: pnpm sim:wipe [--force] [--dry-run]
 *
 *   --dry-run  → print counts that WOULD be deleted, exit 0.
 *   --force    → skip the interactive confirmation (CI / Railway shell).
 *
 * Without `--force` the script prompts on stdin so a stray `pnpm sim:wipe`
 * can't nuke prod synthetics by accident.
 */

import { createInterface } from 'node:readline/promises';
import { loadConfig } from '../../config.js';
import { createDatabase } from '../../db/client.js';
import { createLogger } from '../../logger.js';
import { createWipeRepo } from '../wipe.repo.js';
import { createWipeService } from '../wipe.service.js';

interface CliFlags {
  force: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliFlags {
  const a = new Set(argv.slice(2));
  return { force: a.has('--force'), dryRun: a.has('--dry-run') };
}

async function confirm(promptText: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(promptText);
    return answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const { force, dryRun } = parseArgs(process.argv);
  const config = loadConfig();
  const logger = createLogger(config);
  const db = createDatabase(config);

  const wipeSvc = createWipeService({ repo: createWipeRepo(db) });

  if (dryRun) {
    const r = await wipeSvc.wipe({ dryRun: true });
    logger.info(r, 'sim.wipe: dry-run preview');
    process.exit(0);
  }

  if (!force) {
    const ok = await confirm(
      'About to DELETE all synthetic users + their entries / transactions / log rows. Type "yes" to proceed: ',
    );
    if (!ok) {
      logger.info('sim.wipe: aborted by user');
      process.exit(0);
    }
  }

  const r = await wipeSvc.wipe({ dryRun: false });
  logger.warn(r, 'sim.wipe: completed');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('sim.wipe failed:', err);
  process.exit(1);
});
