import { describe, expect, it } from 'vitest';
import {
  createResultService,
  type ResultRepo,
  type ResultEntrySnapshot,
} from './result.service.js';

const NOW = new Date('2026-04-28T12:00:00Z');

function makeRepo(opts: {
  status?: 'finalized' | 'cancelled' | 'active';
  prizePoolCents?: number;
  entryFeeCents?: number;
  contestName?: string;
  myEntry?: ResultEntrySnapshot | null;
  allEntries?: ResultEntrySnapshot[];
  refundedEntries?: string[];
}): ResultRepo {
  return {
    async getContest() {
      return {
        id: 'c-1',
        name: opts.contestName ?? 'Sample Contest',
        status: opts.status ?? 'finalized',
        prizePoolCents: opts.prizePoolCents ?? 100_000,
        entryFeeCents: opts.entryFeeCents ?? 500,
      };
    },
    async getEntries() {
      return opts.allEntries ?? (opts.myEntry ? [opts.myEntry] : []);
    },
    async findMyEntry(_c, userId, entryId) {
      if (entryId) return opts.myEntry?.entryId === entryId ? opts.myEntry : null;
      if (!userId) return null;
      return opts.myEntry?.userId === userId ? opts.myEntry : null;
    },
    async getPriceSnapshots() {
      return new Map([
        ['BTC', { start: 100, end: 110 }],
        ['ETH', { start: 100, end: 100 }],
        ['PEPE', { start: 100, end: 100 }],
        ['WIF', { start: 100, end: 100 }],
        ['BONK', { start: 100, end: 100 }],
      ]);
    },
    async hasRefund(entryId) {
      return (opts.refundedEntries ?? []).includes(entryId);
    },
    async getImagesBySymbols() {
      return new Map();
    },
  };
}

const sampleEntry: ResultEntrySnapshot = {
  entryId: 'e1',
  userId: 'u1',
  isBot: false,
  submittedAt: NOW,
  picks: [
    { symbol: 'BTC', alloc: 40 },
    { symbol: 'ETH', alloc: 25 },
    { symbol: 'PEPE', alloc: 15 },
    { symbol: 'WIF', alloc: 10 },
    { symbol: 'BONK', alloc: 10 },
  ],
  finalScore: 0.04,
  prizeCents: 100_000,
};

describe('ResultService.get', () => {
  it('returns null when contest is still active', async () => {
    const svc = createResultService({
      repo: makeRepo({ status: 'active', myEntry: sampleEntry }),
    });
    expect(await svc.get({ contestId: 'c-1', userId: 'u1' })).toBeNull();
  });

  it('finalized + prize > 0 → outcome=won', async () => {
    const svc = createResultService({
      repo: makeRepo({ status: 'finalized', myEntry: sampleEntry, allEntries: [sampleEntry] }),
    });
    const r = await svc.get({ contestId: 'c-1', userId: 'u1' });
    expect(r).not.toBeNull();
    expect(r!.outcome).toBe('won');
    expect(r!.prizeCents).toBe(100_000);
    expect(r!.netCents).toBe(100_000 - 500);
    expect(r!.finalRank).toBe(1);
    expect(r!.lineupFinal[0]?.symbol).toBe('BTC');
    expect(r!.lineupFinal[0]?.finalPlPct).toBeCloseTo(0.1);
  });

  it('finalized + prize = 0 → outcome=no_prize', async () => {
    const losing: ResultEntrySnapshot = { ...sampleEntry, prizeCents: 0 };
    const svc = createResultService({
      repo: makeRepo({ status: 'finalized', myEntry: losing, allEntries: [losing] }),
    });
    const r = await svc.get({ contestId: 'c-1', userId: 'u1' });
    expect(r!.outcome).toBe('no_prize');
    expect(r!.netCents).toBe(-500);
  });

  it('cancelled with REFUND tx → outcome=cancelled, netCents=0', async () => {
    const svc = createResultService({
      repo: makeRepo({
        status: 'cancelled',
        myEntry: sampleEntry,
        allEntries: [sampleEntry],
        refundedEntries: ['e1'],
      }),
    });
    const r = await svc.get({ contestId: 'c-1', userId: 'u1' });
    expect(r!.outcome).toBe('cancelled');
    expect(r!.netCents).toBe(0);
  });

  it('cancelled without REFUND → outcome=cancelled, netCents=-fee', async () => {
    const svc = createResultService({
      repo: makeRepo({
        status: 'cancelled',
        myEntry: sampleEntry,
        allEntries: [sampleEntry],
        refundedEntries: [],
      }),
    });
    const r = await svc.get({ contestId: 'c-1', userId: 'u1' });
    expect(r!.outcome).toBe('cancelled');
    expect(r!.netCents).toBe(-500);
  });
});
