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
    /** Contest ids whose finalize should throw — simulates the payout
     * loop crashing so the row stays in 'finalizing' for the stale cron. */
    finalizeThrowIds?: string[];
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
      const seatsLeft = Math.max(0, args.maxCapacity - (args.botPicks.length === 0 ? 0 : 0));
      // Test fake mirrors prod: respect maxCapacity when user-side hasn't pre-trimmed.
      const trimmed = args.botPicks.slice(0, seatsLeft || args.botPicks.length);
      ops.push({ kind: 'lock', contestId: args.contestId, bots: trimmed.length });
      const c = contests.find((c) => c.id === args.contestId);
      if (c) c.status = 'active';
      return { botsInserted: trimmed.length };
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
      if (opts.finalizeThrowIds?.includes(contestId)) {
        throw new Error(`forced finalize failure for ${contestId}`);
      }
      ops.push({ kind: 'finalize2', contestId });
      const c = contests.find((c) => c.id === contestId);
      if (c) c.status = 'finalized' as never;
      return { paidCount: 1, totalCents: 100_000 };
    },
    async findStaleContests(thresholdMs) {
      // Mirrors the production query: per-status time cutoffs + an abnormal-
      // duration safety net (1h) for legacy long-window contests.
      const cutoff = Date.now() - thresholdMs;
      const ABNORMAL_DURATION_MS = 60 * 60_000;
      return contests
        .filter((c) => {
          if (c.status === 'scheduled' && c.startsAt.getTime() < cutoff) return true;
          if (c.status === 'active' && c.endsAt.getTime() < cutoff) return true;
          if (c.status === 'finalizing' && c.endsAt.getTime() < cutoff) return true;
          if (
            (c.status === 'scheduled' || c.status === 'active') &&
            c.endsAt.getTime() - c.startsAt.getTime() > ABNORMAL_DURATION_MS
          )
            return true;
          return false;
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
      const svc = createContestsTickService({ repo, log: noopLog });
      await svc.tick();
      expect(ops).toHaveLength(0);
    });

    it('fills empty contest to capacity (cap=20, real=0 → 20 bots)', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'scheduled',
            startsAt: nowPlusMin(-1),
            endsAt: nowPlusMin(10),
            maxCapacity: 20,
            realEntries: 0,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog });
      await svc.tick();
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({ kind: 'lock', contestId: 'c1', bots: 20 });
    });

    it('Marathon (7d) cancels + refunds when below floor (real=10 < 250)', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'marathon',
            status: 'scheduled',
            startsAt: nowPlusMin(-1),
            endsAt: nowPlusMin(7 * 24 * 60),
            maxCapacity: 500,
            realEntries: 10,
          },
        ],
      });
      // Inject durationLane onto the row that findContestsToLock returns —
      // mimics 0020 schema. The fake rep had no field for it; we patch it
      // post-hoc since the test focuses on the service-side gate.
      const orig = repo.findContestsToLock;
      repo.findContestsToLock = async () => {
        const rows = await orig();
        return rows.map((r) => ({ ...r, durationLane: '7d' }));
      };
      const svc = createContestsTickService({ repo, log: noopLog });
      await svc.tick();
      expect(ops).toHaveLength(1);
      expect(ops[0]?.kind).toBe('cancel');
    });

    it('24h cancels when below floor (real=10 < 30)', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'daily',
            status: 'scheduled',
            startsAt: nowPlusMin(-1),
            endsAt: nowPlusMin(24 * 60),
            maxCapacity: 100,
            realEntries: 10,
          },
        ],
      });
      const orig = repo.findContestsToLock;
      repo.findContestsToLock = async () => {
        const rows = await orig();
        return rows.map((r) => ({ ...r, durationLane: '24h' }));
      };
      const svc = createContestsTickService({ repo, log: noopLog });
      await svc.tick();
      expect(ops).toHaveLength(1);
      expect(ops[0]?.kind).toBe('cancel');
    });

    it('24h locks when above floor (real=35 >= 30)', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'daily',
            status: 'scheduled',
            startsAt: nowPlusMin(-1),
            endsAt: nowPlusMin(24 * 60),
            maxCapacity: 100,
            realEntries: 35,
          },
        ],
      });
      const orig = repo.findContestsToLock;
      repo.findContestsToLock = async () => {
        const rows = await orig();
        return rows.map((r) => ({ ...r, durationLane: '24h' }));
      };
      const svc = createContestsTickService({ repo, log: noopLog });
      await svc.tick();
      expect(ops[0]?.kind).toBe('lock');
    });

    it('fills only the empty seats (cap=20, real=1 → 19 bots)', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'scheduled',
            startsAt: nowPlusMin(-1),
            endsAt: nowPlusMin(10),
            maxCapacity: 20,
            realEntries: 1,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog });
      await svc.tick();
      const op0 = ops[0];
      expect(op0?.kind === 'lock' ? op0.bots : undefined).toBe(19);
    });

    it('zero bots when contest already full', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'c1',
            status: 'scheduled',
            startsAt: nowPlusMin(-1),
            endsAt: nowPlusMin(10),
            maxCapacity: 20,
            realEntries: 20,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog });
      await svc.tick();
      const op0 = ops[0];
      expect(op0?.kind === 'lock' ? op0.bots : undefined).toBe(0);
    });

    it('locks even when some token prices are >2h stale (graceful degradation, no deadlock)', async () => {
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
      const svc = createContestsTickService({ repo, log: noopLog });
      await svc.tick();
      const op0 = ops[0];
      expect(op0?.kind).toBe('lock');
      expect(op0?.kind === 'lock' ? op0.contestId : undefined).toBe('c1');
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
      const svc = createContestsTickService({ repo, log: noopLog });
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
      const svc = createContestsTickService({ repo, log: noopLog });
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
      const svc = createContestsTickService({ repo, log: noopLog });
      await svc.tick();
      expect(ops.some((o) => o.kind === 'cancel' && o.contestId === 'long-duration')).toBe(true);
    });

    it('cancels finalizing contest stuck past endsAt + threshold (payouts crashed in retry loop)', async () => {
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'stuck-finalizing',
            status: 'finalizing',
            startsAt: nowPlusMin(-15),
            endsAt: nowPlusMin(-5), // ended 5 min ago, payouts never settled
            maxCapacity: 20,
            realEntries: 1,
          },
        ],
        finalizeThrowIds: ['stuck-finalizing'],
      });
      const svc = createContestsTickService({ repo, log: noopLog });
      await svc.tick();
      expect(ops.some((o) => o.kind === 'cancel' && o.contestId === 'stuck-finalizing')).toBe(true);
    });

    it('cancels legacy scheduled contest with abnormal endsAt (long-duration safety net)', async () => {
      // Legacy seed contests had 24h windows. The stale-cancel cron catches
      // any scheduled contest with endsAt − startsAt > threshold and refunds
      // it so the user isn't left holding an entry forever. The current
      // schedule (5min fill + 10min play) never hits this branch.
      const { repo, ops } = makeFakeRepo({
        contests: [
          {
            id: 'orphan',
            status: 'scheduled',
            startsAt: nowPlusMin(-180),
            endsAt: nowPlusMin(60 * 12),
            maxCapacity: 100,
            realEntries: 0,
          },
        ],
      });
      const svc = createContestsTickService({ repo, log: noopLog });
      await svc.tick();
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
      const svc = createContestsTickService({ repo, log: noopLog });
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
      const svc = createContestsTickService({ repo, log: noopLog });
      await svc.tick();
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatchObject({ kind: 'finalize2', contestId: 'c1' });
    });
  });
});
