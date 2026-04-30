import type { Logger } from '../../logger.js';
import { LANE_CANCEL_FLOOR, type DurationLane } from '@fantasytoken/shared';
import { generateRandomPicks } from '../../lib/random-picks.js';
import { BOT_HANDLES } from '../../db/seed/bot-handles.js';

export interface ContestRow {
  id: string;
  startsAt: Date;
  endsAt: Date;
  maxCapacity: number;
  realEntries: number;
  /** Optional for legacy callers / tests that pre-date contests-v2. */
  durationLane?: string;
}

export interface ContestsTickRepo {
  findContestsToLock(): Promise<ContestRow[]>;
  findContestsToFinalize(): Promise<ContestRow[]>;
  getTokensInPicks(
    contestId: string,
  ): Promise<Array<{ symbol: string; lastUpdatedAt: Date | null }>>;
  getRealEntryCount(contestId: string): Promise<number>;
  listSymbols(): Promise<string[]>;
  lockAndSpawn(args: {
    contestId: string;
    maxCapacity: number;
    botPicks: Array<{ handle: string; picks: { symbol: string; alloc: number }[] }>;
  }): Promise<{ botsInserted: number }>;
  finalizeStart(args: { contestId: string }): Promise<void>;
  findContestsToFinalize2(): Promise<Array<{ id: string; prizePoolCents: bigint }>>;
  finalize(contestId: string): Promise<{ paidCount: number; totalCents: number }>;
  findStaleContests(thresholdMs: number): Promise<Array<{ id: string }>>;
  cancelContest(contestId: string): Promise<{ refundedCount: number; totalCents: number }>;
}

export interface ContestsTickServiceDeps {
  repo: ContestsTickRepo;
  log: Logger;
  /** Called after each successful lock so the lobby refills immediately. */
  onContestLocked?: () => Promise<void>;
  /** Called once per tick before processing the lock list — refreshes
   * current_price_usd for picked-token coingecko_ids so the start
   * snapshot inserted by lockAndSpawn is genuinely current (not whatever
   * was sitting in the DB from the prior 30s sync). Optional: tests pass
   * undefined and the lock proceeds with whatever's already in the DB. */
  refreshPricesBeforeLock?: () => Promise<void>;
}

const STALE_PRICE_HOURS = 2;
/** Per-status grace window past the relevant lifecycle marker. Anything
 * still in scheduled/active/finalizing this long past the marker is treated
 * as stuck and refund-cancelled. Tight (3 min) because the normal lifecycle
 * is 5-min fill + 10-min play; the tick cron runs every minute, so by 3 min
 * a healthy state should have resolved. */
const STALE_CONTEST_THRESHOLD_MS = 3 * 60_000;

export interface ContestsTickService {
  tick(): Promise<void>;
}

export function createContestsTickService(deps: ContestsTickServiceDeps): ContestsTickService {
  return {
    async tick() {
      // 1. scheduled → active
      const toLock = await deps.repo.findContestsToLock();
      // Force a price refresh once per tick when there's anything to lock —
      // gives the start snapshot the freshest possible baseline regardless
      // of when the last 30s active-sync ran. Best-effort: if CG fails the
      // lock still proceeds (we already log warnings inside the syncer).
      if (toLock.length > 0 && deps.refreshPricesBeforeLock) {
        try {
          await deps.refreshPricesBeforeLock();
        } catch (err) {
          deps.log.warn({ err }, 'contests.tick refreshPricesBeforeLock failed');
        }
      }
      for (const c of toLock) {
        try {
          // Long-lane cancel-on-undersold (DESIGN.md §10): 24h needs ≥30
          // organic, 7d Marathon ≥250. Below floor → refund + skip the lock.
          // Bot-fill on short lanes always brings 10m/30m/1h to capacity, so
          // their floors are 0 and this branch is a no-op.
          const floor = LANE_CANCEL_FLOOR[c.durationLane as DurationLane] ?? 0;
          if (floor > 0 && c.realEntries < floor) {
            const r = await deps.repo.cancelContest(c.id);
            deps.log.info(
              {
                contestId: c.id,
                lane: c.durationLane,
                realEntries: c.realEntries,
                floor,
                refunded: r.refundedCount,
                refundedTotal: r.totalCents,
              },
              'contests.tick undersold-cancel',
            );
            continue;
          }

          const tokens = await deps.repo.getTokensInPicks(c.id);
          const cutoff = Date.now() - STALE_PRICE_HOURS * 3600_000;
          const stale = tokens.filter((t) => t.lastUpdatedAt && t.lastUpdatedAt.getTime() < cutoff);
          if (stale.length > 0) {
            // Stale prices used to abort the lock; that turned into a
            // deadlock whenever no other contest was active to keep the
            // active-token sync warm. We now lock anyway — the start
            // snapshot uses whatever current_price_usd is at lock time
            // (the same value the user saw when entering), preserving
            // internal fairness. Operationally this just means a contest
            // can occasionally start with a slightly stale baseline.
            deps.log.warn(
              { contestId: c.id, stale: stale.map((t) => t.symbol) },
              'contests.tick lock proceeding with stale prices',
            );
          }

          // Fill remaining seats: maxCapacity − realEntries. Pure capacity-fill, no
          // ratio/min logic — every contest reaches exactly maxCapacity at lock time.
          const botCount = Math.max(0, c.maxCapacity - c.realEntries);

          const allSymbols = await deps.repo.listSymbols();
          const botPicks: Array<{ handle: string; picks: { symbol: string; alloc: number }[] }> =
            [];
          for (let i = 0; i < botCount; i++) {
            const handle = BOT_HANDLES[Math.floor(Math.random() * BOT_HANDLES.length)] ?? 'Anon';
            const picks = generateRandomPicks(allSymbols, Math.random);
            botPicks.push({ handle, picks });
          }

          const { botsInserted } = await deps.repo.lockAndSpawn({
            contestId: c.id,
            maxCapacity: c.maxCapacity,
            botPicks,
          });
          deps.log.info({ contestId: c.id, bots: botsInserted }, 'contests.tick locked');
          if (deps.onContestLocked) {
            try {
              await deps.onContestLocked();
            } catch (err) {
              deps.log.warn({ err, contestId: c.id }, 'contests.tick onContestLocked failed');
            }
          }
        } catch (err) {
          deps.log.error({ err, contestId: c.id }, 'contests.tick lock failed');
        }
      }

      // 2. active → finalizing
      const toFinalize = await deps.repo.findContestsToFinalize();
      for (const c of toFinalize) {
        try {
          await deps.repo.finalizeStart({ contestId: c.id });
          deps.log.info({ contestId: c.id }, 'contests.tick finalize-start');
        } catch (err) {
          deps.log.error({ err, contestId: c.id }, 'contests.tick finalize failed');
        }
      }

      // 3. finalizing → finalized
      const toFinalize2 = await deps.repo.findContestsToFinalize2();
      for (const c of toFinalize2) {
        try {
          const r = await deps.repo.finalize(c.id);
          deps.log.info(
            { contestId: c.id, paidCount: r.paidCount, totalCents: r.totalCents },
            'contests.tick finalized',
          );
        } catch (err) {
          deps.log.error({ err, contestId: c.id }, 'contests.tick finalize failed');
        }
      }

      // 4. stuck scheduled/active → cancelled (with refunds). Catches legacy long-duration
      // contests and any contest whose lifecycle stalled past PLAY_DURATION × 6.
      const stale = await deps.repo.findStaleContests(STALE_CONTEST_THRESHOLD_MS);
      for (const c of stale) {
        try {
          const r = await deps.repo.cancelContest(c.id);
          deps.log.info(
            { contestId: c.id, refundedCount: r.refundedCount, totalCents: r.totalCents },
            'contests.tick stale cancelled',
          );
        } catch (err) {
          deps.log.error({ err, contestId: c.id }, 'contests.tick stale cancel failed');
        }
      }
    },
  };
}
