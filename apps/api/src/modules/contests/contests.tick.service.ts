import type { Logger } from '../../logger.js';
import { generateRandomPicks } from '../../lib/random-picks.js';
import { BOT_HANDLES } from '../../db/seed/bot-handles.js';

export interface ContestRow {
  id: string;
  startsAt: Date;
  endsAt: Date;
  maxCapacity: number;
  realEntries: number;
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
    botPicks: Array<{ handle: string; picks: { symbol: string; alloc: number }[] }>;
  }): Promise<void>;
  finalizeStart(args: { contestId: string }): Promise<void>;
  findContestsToFinalize2(): Promise<Array<{ id: string; prizePoolCents: bigint }>>;
  finalize(contestId: string): Promise<{ paidCount: number; totalCents: number }>;
  findStaleContests(thresholdMs: number): Promise<Array<{ id: string }>>;
  cancelContest(contestId: string): Promise<{ refundedCount: number; totalCents: number }>;
}

export interface ContestsTickServiceDeps {
  repo: ContestsTickRepo;
  log: Logger;
  botMinFiller: number;
  botRatio: number;
}

const STALE_PRICE_HOURS = 2;
/** Any contest still scheduled/active this long after startsAt is treated as stuck and refund-cancelled. PLAY_DURATION is 10min, so 1h gives massive margin. */
const STALE_CONTEST_THRESHOLD_MS = 60 * 60_000;

export interface ContestsTickService {
  tick(): Promise<void>;
}

export function createContestsTickService(deps: ContestsTickServiceDeps): ContestsTickService {
  return {
    async tick() {
      // 1. scheduled → active
      const toLock = await deps.repo.findContestsToLock();
      for (const c of toLock) {
        try {
          const tokens = await deps.repo.getTokensInPicks(c.id);
          const cutoff = Date.now() - STALE_PRICE_HOURS * 3600_000;
          const stale = tokens.filter((t) => t.lastUpdatedAt && t.lastUpdatedAt.getTime() < cutoff);
          if (stale.length > 0) {
            deps.log.warn(
              { contestId: c.id, stale: stale.map((t) => t.symbol) },
              'contests.tick lock aborted (stale prices)',
            );
            continue;
          }

          const targetBots = Math.max(deps.botMinFiller, c.realEntries * deps.botRatio);
          const cap = c.maxCapacity - c.realEntries;
          const botCount = Math.max(0, Math.min(targetBots, cap));

          const allSymbols = await deps.repo.listSymbols();
          const botPicks: Array<{ handle: string; picks: { symbol: string; alloc: number }[] }> =
            [];
          for (let i = 0; i < botCount; i++) {
            const handle = BOT_HANDLES[Math.floor(Math.random() * BOT_HANDLES.length)] ?? 'Anon';
            const picks = generateRandomPicks(allSymbols, Math.random);
            botPicks.push({ handle, picks });
          }

          await deps.repo.lockAndSpawn({ contestId: c.id, botPicks });
          deps.log.info({ contestId: c.id, bots: botCount }, 'contests.tick locked');
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
