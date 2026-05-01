import { describe, expect, it } from 'vitest';
import {
  createContestsService,
  type ContestsRepo,
  type ContestRowFromRepo,
} from './contests.service.js';

function nowPlus(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString();
}

function makeRow(overrides: Partial<ContestRowFromRepo> = {}): ContestRowFromRepo {
  return {
    id: 'c-1',
    name: 'Sample',
    type: 'bull',
    status: 'scheduled',
    entryFeeCents: 500,
    prizePoolCents: 10_000,
    maxCapacity: 100,
    spotsFilled: 0,
    startsAt: nowPlus(60),
    endsAt: nowPlus(120),
    isFeatured: false,
    minRank: 1,
    payAll: false,
    virtualBudgetCents: 10_000_000,
    userHasEntered: false,
    prizeFormat: 'gpp',
    payingRanks: 25,
    topPrize: 200,
    minCash: 10,
    ...overrides,
  };
}

function makeFakeRepo(rows: ContestRowFromRepo[]): ContestsRepo {
  return {
    async list({ filter, userId }) {
      switch (filter) {
        case 'cash':
          return rows.filter((r) => r.entryFeeCents > 0 && r.status === 'scheduled');
        case 'free':
          return rows.filter((r) => r.entryFeeCents === 0 && r.status === 'scheduled');
        case 'my':
          return userId ? rows.filter((r) => r.userHasEntered) : [];
      }
    },
    async getById(id) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async create() {
      throw new Error('not used in test');
    },
  };
}

describe('ContestsService.list', () => {
  it('cash: only scheduled, fee > 0', async () => {
    const rows = [
      makeRow({ id: 'cash-1', entryFeeCents: 500 }),
      makeRow({ id: 'free-1', entryFeeCents: 0 }),
      makeRow({ id: 'cash-active', entryFeeCents: 500, status: 'active' }),
    ];
    const svc = createContestsService(makeFakeRepo(rows));
    const out = await svc.list({ filter: 'cash', userId: 'u1' });
    expect(out.map((r) => r.id)).toEqual(['cash-1']);
  });

  it('free: only scheduled, fee = 0', async () => {
    const rows = [
      makeRow({ id: 'cash-1', entryFeeCents: 500 }),
      makeRow({ id: 'free-1', entryFeeCents: 0 }),
    ];
    const svc = createContestsService(makeFakeRepo(rows));
    const out = await svc.list({ filter: 'free', userId: 'u1' });
    expect(out.map((r) => r.id)).toEqual(['free-1']);
  });

  it('my: only contests user has entered', async () => {
    const rows = [
      makeRow({ id: 'a', userHasEntered: true }),
      makeRow({ id: 'b', userHasEntered: false }),
    ];
    const svc = createContestsService(makeFakeRepo(rows));
    const out = await svc.list({ filter: 'my', userId: 'u1' });
    expect(out.map((r) => r.id)).toEqual(['a']);
  });

  it('my: empty when no userId', async () => {
    const svc = createContestsService(makeFakeRepo([makeRow({ userHasEntered: true })]));
    const out = await svc.list({ filter: 'my' });
    expect(out).toEqual([]);
  });
});

describe('ContestsService.getById', () => {
  it('returns the contest if found', async () => {
    const svc = createContestsService(makeFakeRepo([makeRow({ id: 'x' })]));
    expect(await svc.getById('x')).not.toBeNull();
  });
  it('returns null if not found', async () => {
    const svc = createContestsService(makeFakeRepo([]));
    expect(await svc.getById('nope')).toBeNull();
  });
});
