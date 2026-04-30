import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { contests, entries, transactions } from '../../db/schema/index.js';
import type { CurrencyService } from '../currency/currency.service.js';
import { errors } from '../../lib/errors.js';
import type { Logger } from '../../logger.js';
import type { DmQueueService } from '../bot/queue.service.js';

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
  /** Optional bot DM queue. When provided, every refunded entry gets a
   * "your contest was cancelled" DM enqueued so the user knows their
   * balance bumped back up — useful for offline/idle users. */
  dmQueue?: DmQueueService;
  /** Mini-app deep-link base used to point the DM at the result page
   * (which renders the cancelled-state UI). Skipped if absent. */
  miniAppUrl?: string;
}

export function createCancelContest(deps: CancelContestDeps) {
  return async (args: CancelContestArgs): Promise<CancelContestResult> => {
    const [contest] = await deps.db
      .select({
        id: contests.id,
        name: contests.name,
        status: contests.status,
        entryFeeCents: contests.entryFeeCents,
      })
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

      // Don't refund entries that already received PRIZE_PAYOUT (contest was correctly
      // finalized earlier; cancel would double-pay). Guards against desync where
      // contest.status stays 'active' while entries are 'finalized'.
      const [prizeTx] = await deps.db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.refType, 'entry'),
            eq(transactions.refId, e.id),
            eq(transactions.type, 'PRIZE_PAYOUT'),
          ),
        )
        .limit(1);
      if (prizeTx) continue;

      await deps.currency.transact({
        userId: e.userId,
        deltaCents: BigInt(entryFee),
        type: 'REFUND',
        refType: 'entry',
        refId: e.id,
      });
      refundedCount += 1;
      totalCents += entryFee;

      // DM the user about the cancellation + refund. INV-7: any failure
      // here is logged inside enqueue and never blocks the refund itself.
      if (deps.dmQueue && deps.miniAppUrl) {
        await deps.dmQueue.enqueueContestCancelled({
          recipientUserId: e.userId,
          event: {
            entryId: e.id,
            contestId: args.contestId,
            contestName: contest.name,
            refundCents: entryFee,
            resultUrl: `${deps.miniAppUrl}?startapp=result_${args.contestId}`,
          },
        });
      }
    }

    deps.log.info(
      { contestId: args.contestId, refundedCount, totalCents },
      'admin cancel — refunds processed',
    );
    return { refundedCount, totalCents };
  };
}
