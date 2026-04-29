import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { loadConfig } from '../../config.js';
import { createDatabase, type Database } from '../../db/client.js';
import { users, transactions } from '../../db/schema/index.js';
import { createCurrencyRepo } from './currency.repo.js';
import { createCurrencyService } from './currency.service.js';

// Integration tests require a live Postgres. Skipped by default; run with
// RUN_INTEGRATION=1 (set automatically when DATABASE_URL points at localhost).
const RUN =
  process.env.RUN_INTEGRATION === '1' || (process.env.DATABASE_URL?.includes('localhost') ?? false);
const d = RUN ? describe : describe.skip;

let db: Database;
let userId: string;

d('CurrencyService integration (real Postgres)', () => {
  beforeAll(() => {
    db = createDatabase(loadConfig());
  });

  beforeEach(async () => {
    // Wipe in dependency order.
    await db.execute(sql`TRUNCATE TABLE transactions, balances, users RESTART IDENTITY CASCADE`);
    const [u] = await db
      .insert(users)
      .values({ telegramId: 999_001, username: 'test' })
      .returning({ id: users.id });
    if (!u) throw new Error('Failed to seed user');
    userId = u.id;
  });

  afterAll(async () => {
    // No explicit close — drizzle/pg pool is short-lived in test. CI runner exits.
  });

  it('credits welcome bonus and persists', async () => {
    const repo = createCurrencyRepo(db);
    const svc = createCurrencyService(repo);
    await svc.transact({ userId, deltaCents: 10_000n, type: 'WELCOME_BONUS' });
    expect(await svc.getBalance(userId)).toBe(10_000n);

    const txCount = await db.select().from(transactions);
    expect(txCount).toHaveLength(1);
  });

  it('overdraft rolls back atomically — no transaction row, no balance change', async () => {
    const repo = createCurrencyRepo(db);
    const svc = createCurrencyService(repo);
    await svc.transact({ userId, deltaCents: 100n, type: 'WELCOME_BONUS' });

    await expect(svc.transact({ userId, deltaCents: -500n, type: 'ENTRY_FEE' })).rejects.toThrow(
      /OVERDRAFT/,
    );

    expect(await svc.getBalance(userId)).toBe(100n);
    const txRows = await db.select().from(transactions);
    expect(txRows).toHaveLength(1); // тільки WELCOME_BONUS, ENTRY_FEE roll back
  });

  it('balance equals sum of deltas (audit invariant)', async () => {
    const repo = createCurrencyRepo(db);
    const svc = createCurrencyService(repo);
    await svc.transact({ userId, deltaCents: 10_000n, type: 'WELCOME_BONUS' });
    await svc.transact({
      userId,
      deltaCents: -500n,
      type: 'ENTRY_FEE',
      refType: 'entry',
      refId: 'e1',
    });
    await svc.transact({
      userId,
      deltaCents: 200n,
      type: 'PRIZE_PAYOUT',
      refType: 'entry',
      refId: 'e1',
    });

    expect(await svc.getBalance(userId)).toBe(9_700n);

    const sum = await db
      .select({ s: sql<string>`SUM(${transactions.deltaCents})` })
      .from(transactions);
    expect(BigInt(sum[0]?.s ?? '0')).toBe(9_700n);
  });
});
