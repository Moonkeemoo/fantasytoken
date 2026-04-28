import { describe, expect, it } from 'vitest';
import { createContestsTickService, type ContestsTickRepo } from './contests.tick.service.js';

function nowPlusMin(min: number) {
  return new Date(Date.now() + min * 60_000);
}

interface FakeContest {
  id: string;
  status: 'scheduled' | 'active' | 'finalizing';
  startsAt: Date;
  endsAt: Date;
  maxCapacity: number;
  realEntries: number;
}

interface FakeToken {
  symbol: string;
  lastUpdatedAt: Date;
}

function makeFakeRepo(
  opts: {
    contests?: FakeContest[];
    tokens?: FakeToken[];
  } = {},
) {
  const contests = opts.contests ?? [];
  const tokens = opts.tokens ?? [
    { symbol: 'BTC', lastUpdatedAt: new Date() },
    { symbol: 'ETH', lastUpdatedAt: new Date() },
    { symbol: 'PEPE', lastUpdatedAt: new Date() },
    { symbol: 'WIF', lastUpdatedAt: new Date() },
    { symbol: 'BONK', lastUpdatedAt: new Date() },
    { symbol: 'SOL', lastUpdatedAt: new Date() },
    { symbol: 'DOGE', lastUpdatedAt: new Date() },
  ];

  type Op =
    | { kind: 'lock'; contestId: string; bots: number }
    | { kind: 'finalize'; contestId: string };
  const ops: Op[] = [];

  const repo: ContestsTickRepo = {
    async findContestsToLock() {
      const now = new Date();
      return contests
        .filter((c) => c.status === 'scheduled' && c.startsAt <= now)
        .map((c) => ({
          id: c.id,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
          maxCapacity: c.maxCapacity,
          realEntries: c.realEntries,
        }));
    },
    async findContestsToFinalize() {
      const now = new Date();
      return contests
        .filter((c) => c.status === 'active' && c.endsAt <= now)
        .map((c) => ({
          id: c.id,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
          maxCapacity: c.maxCapacity,
          realEntries: c.realEntries,
        }));
    },
    async getTokensInPicks() {
      return tokens.map((t) => ({ symbol: t.symbol, lastUpdatedAt: t.lastUpdatedAt }));
    },
    async getRealEntryCount(contestId) {
      const c = contests.find((c) => c.id === contestId);
      return c?.realEntries ?? 0;
    },
    async listSymbols() {
      return tokens.map((t) => t.symbol);
    },
    async lockAndSpawn(args) {
      ops.push({ kind: 'lock', contestId: args.contestId, bots: args.botPicks.length });
      const c = contests.find((c) => c.id === args.contestId);
      if (c) c.status = 'active';
    },
    async finalizeStart(args) {
      ops.push({ kind: 'finalize', contestId: args.contestId });
      const c = contests.find((c) => c.id === args.contestId);
      if (c) c.status = 'finalizing';
    },
  };
  return { repo, ops };
}

const noopLog = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} } as never;

describe('ContestsTickService', () => {
  describe('lock (scheduled → active)', () => {
    it('does nothing when no contest reached startsAt', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'scheduled',
            startsAt: nowPlusMin(60),
            endsAt: nowPlusMin(120),
            maxCapacity: 100,
            realEntries: 0,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      expect(ops).toHaveLength(0);
    });

    it('spawns BOT_MIN_FILLER bots when zero real entries', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'scheduled',
            startsAt: nowPlusMin(-1),
            endsAt: nowPlusMin(60),
            maxCapacity: 100,
            realEntries: 0,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({ kind: 'lock', contestId: 'c1', bots: 20 });
    });

    it('uses real_count × BOT_RATIO when greater than min', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'scheduled',
            startsAt: nowPlusMin(-1),
            endsAt: nowPlusMin(60),
            maxCapacity: 1000,
            realEntries: 50,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      const op0 = ops[0];
      expect(op0?.kind === 'lock' ? op0.bots : undefined).toBe(150);
    });

    it('caps bot count at max_capacity − real_entries', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'scheduled',
            startsAt: nowPlusMin(-1),
            endsAt: nowPlusMin(60),
            maxCapacity: 100,
            realEntries: 50,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      // want 150 (50*3), cap = 100-50 = 50
      const op0 = ops[0];
      expect(op0?.kind === 'lock' ? op0.bots : undefined).toBe(50);
    });

    it('aborts lock if any token price stale (>2h)', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'scheduled',
            startsAt: nowPlusMin(-1),
            endsAt: nowPlusMin(60),
            maxCapacity: 100,
            realEntries: 0,
          },
        ],
        tokens: [
          { symbol: 'BTC', lastUpdatedAt: new Date(Date.now() - 3 * 3600_000) },
          { symbol: 'ETH', lastUpdatedAt: new Date() },
          { symbol: 'PEPE', lastUpdatedAt: new Date() },
          { symbol: 'WIF', lastUpdatedAt: new Date() },
          { symbol: 'BONK', lastUpdatedAt: new Date() },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      expect(ops).toHaveLength(0);
    });
  });

  describe('finalize (active → finalizing)', () => {
    it('snapshots end prices and updates status', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'active',
            startsAt: nowPlusMin(-60),
            endsAt: nowPlusMin(-1),
            maxCapacity: 100,
            realEntries: 5,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({ kind: 'finalize', contestId: 'c1' });
    });
  });
});
