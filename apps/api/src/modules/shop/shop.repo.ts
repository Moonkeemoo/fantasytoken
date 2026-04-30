import { and, asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { coinPackages, transactions } from '../../db/schema/index.js';
import type { ShopRepo } from './shop.service.js';

export function createShopRepo(db: Database): ShopRepo {
  return {
    async listActive() {
      return db
        .select()
        .from(coinPackages)
        .where(eq(coinPackages.isActive, true))
        .orderBy(asc(coinPackages.sortOrder));
    },

    async findById(id) {
      const [row] = await db
        .select()
        .from(coinPackages)
        .where(and(eq(coinPackages.id, id), eq(coinPackages.isActive, true)))
        .limit(1);
      return row ?? null;
    },

    async findExistingPaymentTx(paymentChargeId) {
      const [row] = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.paymentChargeId, paymentChargeId))
        .limit(1);
      return row ?? null;
    },

    async reconcileUser(userId) {
      // Compare balances row to SUM(delta) over transactions for this user.
      // INV-9 says they MUST match — drift means a non-atomic write somewhere.
      const [row] = await db.execute<{ user_id: string; cached: string; computed: string }>(sql`
        SELECT u.id AS user_id,
          COALESCE((SELECT amount_cents::text FROM balances WHERE user_id = u.id LIMIT 1), '0') AS cached,
          COALESCE((SELECT SUM(delta_cents)::text FROM transactions WHERE user_id = u.id), '0') AS computed
        FROM users u
        WHERE u.id = ${userId}
      `);
      const r = row as unknown as { cached: string; computed: string } | undefined;
      if (!r) return null;
      return { cached: BigInt(r.cached), computed: BigInt(r.computed) };
    },
  };
}
