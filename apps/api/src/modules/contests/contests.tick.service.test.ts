import { describe, expect, it } from 'vitest';
import { createContestsTickService, type ContestsTickRepo } from './contests.tick.service.js';

function nowPlusMin(min: number) {
  return new Date(Date.now() + min * 60_000);
}

interface FakeContest {
  id: string;
  status: 'scheduled' | 'active' | 'finalizing' | 'finalized';
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
    | { kind: 'finalize'; contestId: string }
    | { kind: 'finalize2'; contestId: string }
    | { kind: 'cancel'; contestId: string };
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
    async findContestsToFinalize2() {
      return contests
        .filter((c) => c.status === 'finalizing')
        .map((c) => ({ id: c.id, prizePoolCents: 100_000n }));
    },
    async finalize(contestId) {
      ops.push({ kind: 'finalize2', contestId });
      const c = contests.find((c) => c.id === contestId);
      if (c) c.status = 'finalized' as never;
      return { paidCount: 1, totalCents: 100_000 };
    },
    async findStaleContests(thresholdMs) {
      const cutoff = Date.now() - thresholdMs;
      return contests
        .filter((c) => {
          if (c.status !== 'active' && c.status !== 'scheduled') return false;
          const stuckByTime = c.startsAt.getTime() < cutoff;
          const stuckByDuration = c.endsAt.getTime() - c.startsAt.getTime() > thresholdMs;
          return stuckByTime || stuckByDuration;
        })
        .map((c) => ({ id: c.id }));
    },
    async cancelContest(contestId) {
      ops.push({ kind: 'cancel', contestId });
      const c = contests.find((c) => c.id === contestId);
      if (c) c.status = 'finalized' as never;
      return { refundedCount: 0, totalCents: 0 };
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
            endsAt: nowPlusMin(10),
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
            endsAt: nowPlusMin(10),
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
            endsAt: nowPlusMin(10),
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
            endsAt: nowPlusMin(10),
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
      // step 2 transitions active→finalizing; step 3 immediately picks it up in the same tick
      expect(ops).toHaveLength(2);
      expect(ops[0]).toMatchObject({ kind: 'finalize', contestId: 'c1' });
      expect(ops[1]).toMatchObject({ kind: 'finalize2', contestId: 'c1' });
    });
  });

  describe('auto-cancel stale contests', () => {
    it('cancels active contest where startsAt > 1h ago (stuck-live legacy)', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'stuck',
            status: 'active',
            startsAt: nowPlusMin(-90), // 1.5h ago
            endsAt: nowPlusMin(60 * 22), // far in future (legacy 24h schedule)
            maxCapacity: 100,
            realEntries: 1,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      expect(ops.some((o) => o.kind === 'cancel' && o.contestId === 'stuck')).toBe(true);
    });

    it('cancels active contest with abnormal duration (endsAt − startsAt > 1h) even if just-started', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'long-duration',
            status: 'active',
            startsAt: nowPlusMin(-5), // started 5 min ago (NOT stuck by time)
            endsAt: nowPlusMin(60 * 23 + 43), // 24h-ish duration (legacy)
            maxCapacity: 100,
            realEntries: 1,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      expect(ops.some((o) => o.kind === 'cancel' && o.contestId === 'long-duration')).toBe(true);
    });

    it('cancels scheduled contest stuck because prices were stale at lock time', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'orphan',
            status: 'scheduled',
            startsAt: nowPlusMin(-180),
            endsAt: nowPlusMin(60 * 12), // legacy long endsAt
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
      expect(ops.some((o) => o.kind === 'lock')).toBe(false); // lock aborted by stale prices
      expect(ops.some((o) => o.kind === 'cancel' && o.contestId === 'orphan')).toBe(true);
    });

    it('does NOT cancel fresh active contest (startsAt < threshold)', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'fresh',
            status: 'active',
            startsAt: nowPlusMin(-5),
            endsAt: nowPlusMin(5),
            maxCapacity: 100,
            realEntries: 1,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      expect(ops.some((o) => o.kind === 'cancel')).toBe(false);
    });
  });

  describe('finalize2 (finalizing → finalized)', () => {
    it('calls finalize on contests in finalizing status', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'finalizing',
            startsAt: nowPlusMin(-120),
            endsAt: nowPlusMin(-30),
            maxCapacity: 100,
            realEntries: 5,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog, botMinFiller: 20, botRatio: 3 });
      await svc.tick();
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({ kind: 'finalize2', contestId: 'c1' });
    });
  });
});
