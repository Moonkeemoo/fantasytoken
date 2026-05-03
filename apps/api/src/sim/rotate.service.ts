/**
 * qa008 — synth-cohort data rotation. Caps unbounded growth from the
 * tick worker so a 500MB Postgres volume can't fill again. Deletes only
 * cohort data: real-user transactions stay (INV-9), real-user entries
 * stay (history must survive).
 *
 * Three rotations, each with its own retention window:
 *  - synthetic_actions_log:   2h   (faucet looks back 15min; 8x margin)
 *  - synthetic transactions:  24h  (cohort observability, not audit trail)
 *  - finalized contests:      24h after endsAt, IFF zero real-user entries
 *    (cascades remove synth + bot entries and price_snapshots)
 *
 * Synth USERS themselves stay — sim.config keeps a stable cohort.
 */

const HOUR_MS = 60 * 60 * 1000;

export const ROTATE_DEFAULTS = {
  logRetentionMs: 2 * HOUR_MS,
  txRetentionMs: 24 * HOUR_MS,
  contestRetentionMs: 24 * HOUR_MS,
} as const;

export interface RotateResult {
  deletedLogRows: number;
  deletedTransactions: number;
  deletedContests: number;
}

export interface RotateRepo {
  trimSyntheticActionsLog(retentionMs: number): Promise<number>;
  trimSyntheticTransactions(retentionMs: number): Promise<number>;
  trimFinalizedContests(retentionMs: number): Promise<number>;
  vacuum(tables: readonly string[]): Promise<void>;
}

export interface RotateService {
  runOnce(args?: Partial<typeof ROTATE_DEFAULTS>): Promise<RotateResult>;
}

export function createRotateService(deps: { repo: RotateRepo }): RotateService {
  return {
    async runOnce(args) {
      const cfg = { ...ROTATE_DEFAULTS, ...args };
      const deletedLogRows = await deps.repo.trimSyntheticActionsLog(cfg.logRetentionMs);
      const deletedTransactions = await deps.repo.trimSyntheticTransactions(cfg.txRetentionMs);
      const deletedContests = await deps.repo.trimFinalizedContests(cfg.contestRetentionMs);
      // VACUUM only the tables we actually touched. Plain VACUUM (not FULL)
      // marks dead tuples reusable so subsequent INSERTs land in-place
      // instead of growing the heap. FULL would shrink to disk but takes
      // an exclusive lock — too disruptive for a 10min cron.
      if (deletedLogRows + deletedTransactions + deletedContests > 0) {
        await deps.repo.vacuum([
          'synthetic_actions_log',
          'transactions',
          'entries',
          'price_snapshots',
          'contests',
        ]);
      }
      return { deletedLogRows, deletedTransactions, deletedContests };
    },
  };
}
