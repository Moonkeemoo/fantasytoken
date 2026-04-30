import { eq, and, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { balances, transactions } from '../../db/schema/index.js';
import type { CurrencyRepo, TransactArgs, TransactResult } from './currency.service.js';

const USD = 'USD';

export function createCurrencyRepo(db: Database): CurrencyRepo {
  return {
    async transactAtomic(args: TransactArgs): Promise<TransactResult> {
      return db.transaction(async (tx) => {
        // 1. Insert transaction row (audit log).
        const [txRow] = await tx
          .insert(transactions)
          .values({
            userId: args.userId,
            currencyCode: USD,
            deltaCents: args.deltaCents,
            type: args.type,
            refType: args.refType ?? null,
            refId: args.refId ?? null,
            paymentChargeId: args.paymentChargeId ?? null,
          })
          .returning({ id: transactions.id });

        if (!txRow) {
          throw new Error('Failed to insert transaction row');
        }

        // 2. Upsert balance.
        const [balanceRow] = await tx
          .insert(balances)
          .values({
            userId: args.userId,
            currencyCode: USD,
            amountCents: args.deltaCents,
          })
          .onConflictDoUpdate({
            target: [balances.userId, balances.currencyCode],
            set: {
              amountCents: sql`${balances.amountCents} + ${args.deltaCents}`,
              updatedAt: sql`now()`,
            },
          })
          .returning({ amountCents: balances.amountCents });

        if (!balanceRow) {
          throw new Error('Failed to upsert balance');
        }

        // 3. INV-9 overdraft guard — rollback by throwing (drizzle's tx auto-aborts).
        if (balanceRow.amountCents < 0n) {
          throw new Error(`OVERDRAFT: user=${args.userId} would have ${balanceRow.amountCents}`);
        }

        return { txId: txRow.id, balanceAfter: balanceRow.amountCents };
      });
    },

    async getBalance(userId: string): Promise<bigint> {
      const [row] = await db
        .select({ amountCents: balances.amountCents })
        .from(balances)
        .where(and(eq(balances.userId, userId), eq(balances.currencyCode, USD)))
        .limit(1);
      return row?.amountCents ?? 0n;
    },
  };
}
