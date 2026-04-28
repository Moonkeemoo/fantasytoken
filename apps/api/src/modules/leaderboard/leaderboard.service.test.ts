import { describe, expect, it } from 'vitest';
import {
  createLeaderboardService,
  type LeaderboardRepo,
  type EntrySnapshot,
} from './leaderboard.service.js';

const NOW = new Date('2026-04-28T12:00:00Z');

function entry(
  opts: Partial<EntrySnapshot> & { id: string; submittedAt?: Date; isBot?: boolean },
): EntrySnapshot {
  return {
    entryId: opts.id,
    isBot: opts.isBot ?? false,
    userId: opts.isBot ? null : `user-${opts.id}`,
    botHandle: opts.isBot ? `bot_${opts.id}` : null,
    submittedAt: opts.submittedAt ?? NOW,
    picks: opts.picks ?? [
      { symbol: 'BTC', alloc: 40 },
      { symbol: 'ETH', alloc: 25 },
      { symbol: 'PEPE', alloc: 15 },
      { symbol: 'WIF', alloc: 10 },
      { symbol: 'BONK', alloc: 10 },
    ],
  };
}

function makeRepo(opts: {
  status?: 'scheduled' | 'active' | 'finalizing' | 'finalized' | 'cancelled';
  prizePoolCents?: number;
  entryFeeCents?: number;
  entries: EntrySnapshot[];
  startPrices?: Record<string, number>;
  currentPrices?: Record<string, number>;
  myEntryId?: string;
  displayName?: string;
}): LeaderboardRepo {
  const startPrices = opts.startPrices ?? { BTC: 100, ETH: 100, PEPE: 100, WIF: 100, BONK: 100 };
  const currentPrices = opts.currentPrices ?? {
    BTC: 110,
    ETH: 100,
    PEPE: 100,
    WIF: 100,
    BONK: 100,
  };

  return {
    async getContest() {
      return {
        id: 'c-1',
        name: 'Test Contest',
        status: opts.status ?? 'active',
        startsAt: new Date('2026-04-28T11:00:00Z'),
        endsAt: new Date('2026-04-28T13:00:00Z'),
        prizePoolCents: opts.prizePoolCents ?? 100_000,
        entryFeeCents: opts.entryFeeCents ?? 0,
      };
    },
    async getEntries() {
      return opts.entries;
    },
    async getPriceSnapshots(_contestId, phase) {
      return phase === 'start' ? new Map(Object.entries(startPrices)) : new Map();
    },
    async getCurrentPrices() {
      return new Map(Object.entries(currentPrices));
    },
    async getMyEntry(_c, userId) {
      const e = opts.entries.find((e) => e.userId === userId);
      return e ?? null;
    },
    async getDisplayNameForUser() {
      return opts.displayName ?? 'You';
    },
  };
}

describe('LeaderboardService.getLive', () => {
  it('returns null when contest not found', async () => {
    const repo = makeRepo({ entries: [] });
    repo.getContest = async () => null;
    const svc = createLeaderboardService({ repo, rakePct: 10 });
    const r = await svc.getLive({ contestId: 'missing' });
    expect(r).toBeNull();
  });

  it('single real entry, BTC up 10% with 40% alloc → portfolio +4%', async () => {
    const e = entry({ id: 'e1' });
    const svc = createLeaderboardService({
      repo: makeRepo({ entries: [e], myEntryId: 'e1' }),
      rakePct: 10,
    });
    const r = await svc.getLive({ contestId: 'c-1', userId: 'user-e1' });
    expect(r).not.toBeNull();
    expect(r!.portfolio.plPct).toBeCloseTo(0.04);
    expect(r!.portfolio.currentUsd).toBeCloseTo(104);
    expect(r!.rank).toBe(1);
    expect(r!.totalEntries).toBe(1);
    expect(r!.realEntries).toBe(1);
  });

  it('mixed real + bot — leaderboard includes both ordered by score DESC', async () => {
    const real = entry({ id: 'real-1', submittedAt: new Date(NOW.getTime() - 1000) });
    const botBeats = entry({
      id: 'bot-1',
      isBot: true,
      // BTC 80% (max) + good current price below
      picks: [
        { symbol: 'BTC', alloc: 80 },
        { symbol: 'ETH', alloc: 5 },
        { symbol: 'PEPE', alloc: 5 },
        { symbol: 'WIF', alloc: 5 },
        { symbol: 'BONK', alloc: 5 },
      ],
    });
    const svc = createLeaderboardService({
      repo: makeRepo({ entries: [real, botBeats] }),
      rakePct: 10,
    });
    const r = await svc.getLive({ contestId: 'c-1' });
    expect(r).not.toBeNull();
    expect(r!.totalEntries).toBe(2);
    expect(r!.realEntries).toBe(1);
    // Bot has higher BTC alloc → higher score, should rank #1
    expect(r!.leaderboardTop[0]?.entryId).toBe('bot-1');
    expect(r!.leaderboardTop[0]?.isBot).toBe(true);
  });

  it('tie-break by submittedAt ASC', async () => {
    const earlier = entry({ id: 'earlier', submittedAt: new Date(NOW.getTime() - 2000) });
    const later = entry({ id: 'later', submittedAt: NOW });
    // Same picks, same prices → identical score
    const svc = createLeaderboardService({
      repo: makeRepo({ entries: [later, earlier] }),
      rakePct: 10,
    });
    const r = await svc.getLive({ contestId: 'c-1' });
    expect(r!.leaderboardTop[0]?.entryId).toBe('earlier');
    expect(r!.leaderboardTop[1]?.entryId).toBe('later');
  });

  it('projectedPrize uses dynamic pool (entries × fee × (1-rake)) not hardcoded prizePoolCents', async () => {
    // 10 real × $1 × 0.9 = $9.00 = 900c. Curve top 30% = top 3.
    // 1st gets ~50% = 450c (regardless of guaranteed=0).
    const reals = Array.from({ length: 10 }).map((_, i) =>
      entry({ id: `real-${i}`, submittedAt: new Date(NOW.getTime() - i * 1000) }),
    );
    const svc = createLeaderboardService({
      repo: makeRepo({ entries: reals, prizePoolCents: 0, entryFeeCents: 100 }),
      rakePct: 10,
    });
    // user-real-9 has earliest submission → wins tie-break → rank 1
    const r = await svc.getLive({ contestId: 'c-1', userId: 'user-real-9' });
    expect(r!.projectedPrizeCents).toBeGreaterThan(0);
    expect(r!.projectedPrizeCents).toBeLessThan(900); // not the full pool, just top-1 share
    // Pool sum across top 3 = 900
    // (We can't directly inspect pool but bounds are tight: 1st should be ~450c.)
  });

  it('projectedPrize: top 30% of REAL entries gets payout', async () => {
    // 10 real entries → top 3 pay (30% of 10).
    // Curve: 1st: ~50%, 2nd: ~30%, 3rd: ~20% of pool (after renorm).
    const reals = Array.from({ length: 10 }).map((_, i) =>
      entry({ id: `real-${i}`, submittedAt: new Date(NOW.getTime() - i * 1000) }),
    );
    const svc = createLeaderboardService({
      repo: makeRepo({ entries: reals, prizePoolCents: 100_000 }),
      rakePct: 10,
    });
    const r = await svc.getLive({ contestId: 'c-1', userId: 'user-real-9' }); // submittedAt = NOW − 9000 → earliest
    // user-real-9 has earliest submission → wins tie-break → rank 1 → top 3 pays → gets prize
    expect(r!.projectedPrizeCents).toBeGreaterThan(0);
  });
});
