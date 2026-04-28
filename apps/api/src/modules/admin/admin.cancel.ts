import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { contests, entries, transactions } from '../../db/schema/index.js';
import type { CurrencyService } from '../currency/currency.service.js';
import { errors } from '../../lib/errors.js';
import type { Logger } from '../../logger.js';

export interface CancelContestArgs {
  contestId: string;
}

export interface CancelContestResult {
  refundedCount: number;
  totalCents: number;
}

export interface CancelContestDeps {
  db: Database;
  currency: CurrencyService;
  log: Logger;
}

export function createCancelContest(deps: CancelContestDeps) {
  return async (args: CancelContestArgs): Promise<CancelContestResult> => {
    const [contest] = await deps.db
      .select({ id: contests.id, status: contests.status, entryFeeCents: contests.entryFeeCents })
      .from(contests)
      .where(eq(contests.id, args.contestId))
      .limit(1);
    if (!contest) throw errors.notFound('contest');
    if (contest.status === 'cancelled' || contest.status === 'finalized') {
      // Idempotent: still attempt refunds (in case prior cancel partially failed).
      // Just don't transition status further.
    } else {
      await deps.db
        .update(contests)
        .set({ status: 'cancelled' })
        .where(eq(contests.id, args.contestId));
    }

    // Find entries with non-null userId.
    const entryRows = await deps.db
      .select({ id: entries.id, userId: entries.userId })
      .from(entries)
      .where(eq(entries.contestId, args.contestId));

    const entryFee = Number(contest.entryFeeCents);
    if (entryFee === 0) {
      // Free contest — nothing to refund.
      return { refundedCount: 0, totalCents: 0 };
    }

    let refundedCount = 0;
    let totalCents = 0;

    for (const e of entryRows) {
      if (!e.userId) continue; // bot

      // Confirm ENTRY_FEE exists for this entry.
      const [feeTx] = await deps.db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.refType, 'entry'),
            eq(transactions.refId, e.id),
            eq(transactions.type, 'ENTRY_FEE'),
          ),
        )
        .limit(1);
      if (!feeTx) continue; // shouldn't happen, but be defensive

      // Idempotency: skip if REFUND already exists.
      const [refundTx] = await deps.db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.refType, 'entry'),
            eq(transactions.refId, e.id),
            eq(transactions.type, 'REFUND'),
          ),
        )
        .limit(1);
      if (refundTx) continue;

      await deps.currency.transact({
        userId: e.userId,
        deltaCents: BigInt(entryFee),
        type: 'REFUND',
        refType: 'entry',
        refId: e.id,
      });
      refundedCount += 1;
      totalCents += entryFee;
    }

    deps.log.info(
      { contestId: args.contestId, refundedCount, totalCents },
      'admin cancel — refunds processed',
    );
    return { refundedCount, totalCents };
  };
}
