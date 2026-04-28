import { describe, expect, it } from 'vitest';
import { createCurrencyService, type CurrencyRepo } from './currency.service.js';

function makeFakeRepo(initial: Map<string, bigint> = new Map()): CurrencyRepo & {
  balances: Map<string, bigint>;
  transactions: Array<{ userId: string; deltaCents: bigint; type: string }>;
} {
  const balances = new Map(initial);
  const transactions: Array<{ userId: string; deltaCents: bigint; type: string }> = [];

  return {
    balances,
    transactions,

    async transactAtomic(args) {
      // INV-9 simulation: simulate single transaction.
      const key = `${args.userId}:USD`;
      const current = balances.get(key) ?? 0n;
      const next = current + args.deltaCents;
      if (next < 0n) {
        throw new Error('OVERDRAFT');
      }
      transactions.push({ userId: args.userId, deltaCents: args.deltaCents, type: args.type });
      balances.set(key, next);
      return { txId: `fake-${transactions.length}`, balanceAfter: next };
    },

    async getBalance(userId) {
      return balances.get(`${userId}:USD`) ?? 0n;
    },
  };
}

describe('CurrencyService', () => {
  it('credits welcome bonus', async () => {
    const repo = makeFakeRepo();
    const svc = createCurrencyService(repo);
    const result = await svc.transact({
      userId: 'u1',
      deltaCents: 10_000n,
      type: 'WELCOME_BONUS',
    });
    expect(result.balanceAfter).toBe(10_000n);
    expect(repo.transactions).toHaveLength(1);
    expect(repo.transactions[0]?.type).toBe('WELCOME_BONUS');
  });

  it('debits entry fee from positive balance', async () => {
    const repo = makeFakeRepo(new Map([['u1:USD', 10_000n]]));
    const svc = createCurrencyService(repo);
    const result = await svc.transact({
      userId: 'u1',
      deltaCents: -500n,
      type: 'ENTRY_FEE',
      refType: 'entry',
      refId: 'e1',
    });
    expect(result.balanceAfter).toBe(9_500n);
  });

  it('refuses overdraft and rolls back (INV-9)', async () => {
    const repo = makeFakeRepo(new Map([['u1:USD', 100n]]));
    const svc = createCurrencyService(repo);
    await expect(
      svc.transact({ userId: 'u1', deltaCents: -500n, type: 'ENTRY_FEE' }),
    ).rejects.toThrow();
    // Balance unchanged after rejected debit.
    expect(await svc.getBalance('u1')).toBe(100n);
  });

  it('rejects zero-delta transactions (no-op writes muddy audit log)', async () => {
    const repo = makeFakeRepo();
    const svc = createCurrencyService(repo);
    await expect(
      svc.transact({ userId: 'u1', deltaCents: 0n, type: 'WELCOME_BONUS' }),
    ).rejects.toThrow();
  });

  it('returns 0 balance for unseen user', async () => {
    const svc = createCurrencyService(makeFakeRepo());
    expect(await svc.getBalance('unknown')).toBe(0n);
  });
});
