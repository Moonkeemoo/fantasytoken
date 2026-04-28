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
}

export interface ContestsTickServiceDeps {
  repo: ContestsTickRepo;
  log: Logger;
  botMinFiller: number;
  botRatio: number;
}

const STALE_PRICE_HOURS = 2;

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
    },
  };
}
