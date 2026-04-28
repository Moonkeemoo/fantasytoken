import { describe, expect, it } from 'vitest';
import { createUsersService, type UsersRepo } from './users.service.js';
import type { CurrencyService } from '../currency/currency.service.js';

function makeFakeRepo(): UsersRepo & {
  state: Map<number, { id: string; createdAt: Date }>;
} {
  const state = new Map<number, { id: string; createdAt: Date }>();
  return {
    state,
    async findByTelegramId(tgId) {
      const v = state.get(tgId);
      return v ? { id: v.id, telegramId: tgId, createdAt: v.createdAt } : null;
    },
    async create({ telegramId }) {
      const id = `u-${telegramId}`;
      const createdAt = new Date();
      state.set(telegramId, { id, createdAt });
      return { id, telegramId, createdAt };
    },
    async touchLastSeen(_id) {
      // no-op for tests
    },
    async updateProfile(_args) {
      // no-op for tests
    },
  };
}

function makeFakeCurrency(): CurrencyService & {
  txs: Array<{ userId: string; deltaCents: bigint; type: string }>;
  balance: Map<string, bigint>;
} {
  const txs: Array<{ userId: string; deltaCents: bigint; type: string }> = [];
  const balance = new Map<string, bigint>();
  return {
    txs,
    balance,
    async transact(args) {
      txs.push({ userId: args.userId, deltaCents: args.deltaCents, type: args.type });
      const cur = balance.get(args.userId) ?? 0n;
      const next = cur + args.deltaCents;
      balance.set(args.userId, next);
      return { txId: `t-${txs.length}`, balanceAfter: next };
    },
    async getBalance(userId) {
      return balance.get(userId) ?? 0n;
    },
  };
}

describe('UsersService.upsertOnAuth', () => {
  it('creates user and credits welcome bonus on first auth', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    const svc = createUsersService({ repo, currency: cur, welcomeBonusCents: 10_000n });
    const result = await svc.upsertOnAuth({ telegramId: 42, firstName: 'Alex' });
    expect(result.balanceCents).toBe(10_000n);
    expect(cur.txs).toHaveLength(1);
    expect(cur.txs[0]?.type).toBe('WELCOME_BONUS');
  });

  it('does NOT duplicate welcome bonus on subsequent auth', async () => {
    const repo = makeFakeRepo();
    const cur = makeFakeCurrency();
    const svc = createUsersService({ repo, currency: cur, welcomeBonusCents: 10_000n });
    await svc.upsertOnAuth({ telegramId: 42, firstName: 'Alex' });
    const second = await svc.upsertOnAuth({ telegramId: 42, firstName: 'Alex' });
    expect(second.balanceCents).toBe(10_000n);
    expect(cur.txs).toHaveLength(1); // only one bonus, ever
  });

  it('does not credit bonus when configured to 0', async () => {
    const svc = createUsersService({
      repo: makeFakeRepo(),
      currency: makeFakeCurrency(),
      welcomeBonusCents: 0n,
    });
    const r = await svc.upsertOnAuth({ telegramId: 7, firstName: 'No-Bonus' });
    expect(r.balanceCents).toBe(0n);
  });
});
