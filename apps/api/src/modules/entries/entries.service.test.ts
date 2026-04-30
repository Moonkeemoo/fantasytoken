import { describe, expect, it } from 'vitest';
import { createEntriesService, type EntriesRepo } from './entries.service.js';
import type { CurrencyService } from '../currency/currency.service.js';

function makeFakeRepo(
  opts: {
    existing?: { entryId: string };
    contestOpen?: boolean;
    knownSymbols?: string[];
  } = {},
) {
  let createdEntry: { id: string; userId: string; picks: unknown } | null = null;

  const repo: EntriesRepo & {
    createdEntry: { id: string; userId: string; picks: unknown } | null;
  } = {
    get createdEntry() {
      return createdEntry;
    },
    async findExisting() {
      return opts.existing ?? null;
    },
    async getOpenContest(id) {
      if (opts.contestOpen === false) return null;
      return { id, entryFeeCents: 500n, startsAt: new Date(Date.now() + 60_000) };
    },
    async unknownSymbols(symbols) {
      const known = opts.knownSymbols ?? ['BTC', 'ETH', 'PEPE', 'WIF', 'BONK'];
      return symbols.filter((s) => !known.includes(s));
    },
    async create(args) {
      createdEntry = { id: `entry-${Date.now()}`, userId: args.userId, picks: args.picks };
      return { id: createdEntry.id, submittedAt: new Date() };
    },
    async listPublicLineups({ limit }) {
      // Two fake lineups, sorted oldest-first for filter='all'.
      const all = [
        {
          user: 'alice',
          submittedAt: new Date('2026-04-29T10:00:00Z').toISOString(),
          picks: ['BTC', 'ETH', 'PEPE', 'WIF', 'BONK'],
        },
        {
          user: 'bob',
          submittedAt: new Date('2026-04-29T11:00:00Z').toISOString(),
          picks: ['SOL', 'DOGE', 'SHIB', 'ADA', 'XRP'],
        },
      ];
      const sliced = all.slice(0, limit);
      return { lineups: sliced, total: sliced.length };
    },
  };

  return repo;
}

function makeFakeCurrency(opts: { balance?: bigint } = {}): CurrencyService {
  let balance = opts.balance ?? 10_000n;
  return {
    async transact(args) {
      const next = balance + args.deltaCents;
      if (next < 0n) throw new Error('OVERDRAFT');
      balance = next;
      return { txId: 'tx-1', balanceAfter: balance };
    },
    async getBalance() {
      return balance;
    },
  };
}

const VALID_PICKS = [
  { symbol: 'BTC', alloc: 40 },
  { symbol: 'ETH', alloc: 25 },
  { symbol: 'PEPE', alloc: 15 },
  { symbol: 'WIF', alloc: 10 },
  { symbol: 'BONK', alloc: 10 },
];

describe('EntriesService.submit', () => {
  it('creates entry + debits ENTRY_FEE on first submit', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency({ balance: 10_000n });
    const svc = createEntriesService({ repo, currency: cur });
    const r = await svc.submit({ userId: 'u1', contestId: 'c1', picks: VALID_PICKS });
    expect(r.alreadyEntered).toBe(false);
    expect(r.entryId).toMatch(/^entry-/);
    expect(await cur.getBalance('u1')).toBe(9_500n);
  });

  it('returns idempotent on already-entered (no second debit)', async () => {
    const repo = makeFakeRepo({ existing: { entryId: 'old-entry' } });
    const cur = makeFakeCurrency({ balance: 10_000n });
    const svc = createEntriesService({ repo, currency: cur });
    const r = await svc.submit({ userId: 'u1', contestId: 'c1', picks: VALID_PICKS });
    expect(r.alreadyEntered).toBe(true);
    expect(r.entryId).toBe('old-entry');
    expect(await cur.getBalance('u1')).toBe(10_000n);
  });

  it('throws CONTEST_CLOSED when contest not in scheduled status', async () => {
    const repo = makeFakeRepo({ contestOpen: false });
    const cur = makeFakeCurrency();
    const svc = createEntriesService({ repo, currency: cur });
    await expect(
      svc.submit({ userId: 'u1', contestId: 'c1', picks: VALID_PICKS }),
    ).rejects.toMatchObject({ code: 'CONTEST_CLOSED' });
  });

  it('throws INSUFFICIENT_BALANCE when balance < entryFee', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency({ balance: 100n });
    const svc = createEntriesService({ repo, currency: cur });
    await expect(
      svc.submit({ userId: 'u1', contestId: 'c1', picks: VALID_PICKS }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    expect(repo.createdEntry).toBeNull();
  });

  it('throws INVALID_LINEUP when picks reference unknown symbol', async () => {
    const repo = makeFakeRepo({ knownSymbols: ['BTC', 'ETH', 'PEPE', 'WIF'] });
    const cur = makeFakeCurrency();
    const svc = createEntriesService({ repo, currency: cur });
    await expect(
      svc.submit({ userId: 'u1', contestId: 'c1', picks: VALID_PICKS }),
    ).rejects.toMatchObject({ code: 'INVALID_LINEUP' });
  });
});

describe('EntriesService.listPublicLineups', () => {
  it('returns lineups with privacy contract — symbols only, no allocations', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    const svc = createEntriesService({ repo, currency: cur });
    const result = await svc.listPublicLineups({
      contestId: 'c1',
      filter: 'all',
      limit: 50,
    });
    expect(result.lineups).toHaveLength(2);
    for (const l of result.lineups) {
      expect(l).toHaveProperty('user');
      expect(l).toHaveProperty('picks');
      expect(l).toHaveProperty('submittedAt');
      expect(l).not.toHaveProperty('alloc');
      expect(l).not.toHaveProperty('entryFee');
      expect(l).not.toHaveProperty('pnl');
    }
  });

  it('clamps limit to [1, 200]', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    const svc = createEntriesService({ repo, currency: cur });
    const r1 = await svc.listPublicLineups({ contestId: 'c1', filter: 'all', limit: 0 });
    expect(r1.lineups.length).toBeGreaterThan(0);
    const r2 = await svc.listPublicLineups({ contestId: 'c1', filter: 'all', limit: 9999 });
    expect(r2.lineups.length).toBeLessThanOrEqual(200);
  });
});
