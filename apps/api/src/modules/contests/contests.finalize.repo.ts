import { and, eq } from 'drizzle-orm';
import { computeActualPrizeCents } from '@fantasytoken/shared';
import type { Database } from '../../db/client.js';
import { contests, entries, priceSnapshots, tokens, transactions } from '../../db/schema/index.js';
import type { CurrencyService } from '../currency/currency.service.js';
import { finalizeContest, type FinalizeInputEntry } from './contests.finalize.js';

export interface ContestsFinalizeRepo {
  findContestsToFinalize2(): Promise<Array<{ id: string; prizePoolCents: bigint }>>;
  finalize(contestId: string): Promise<{ paidCount: number; totalCents: number }>;
}

export function createContestsFinalizeRepo(
  db: Database,
  currency: CurrencyService,
  rakePct: number,
): ContestsFinalizeRepo {
  return {
    async findContestsToFinalize2() {
      return db
        .select({ id: contests.id, prizePoolCents: contests.prizePoolCents })
        .from(contests)
        .where(eq(contests.status, 'finalizing'));
    },

    async finalize(contestId) {
      // 1. Load contest.
      const [contest] = await db
        .select({
          id: contests.id,
          prizePoolCents: contests.prizePoolCents,
          entryFeeCents: contests.entryFeeCents,
          type: contests.type,
        })
        .from(contests)
        .where(eq(contests.id, contestId))
        .limit(1);
      if (!contest) throw new Error(`Contest ${contestId} not found`);

      // 2. Load entries.
      const entryRows = await db
        .select({
          entryId: entries.id,
          isBot: entries.isBot,
          userId: entries.userId,
          submittedAt: entries.submittedAt,
          picks: entries.picks,
        })
        .from(entries)
        .where(eq(entries.contestId, contestId));

      const inputEntries: FinalizeInputEntry[] = entryRows.map((r) => ({
        entryId: r.entryId,
        isBot: r.isBot,
        userId: r.userId,
        submittedAt: r.submittedAt,
        picks: (r.picks as Array<{ symbol: string; alloc: number }>) ?? [],
      }));

      // 3. Load snapshots (start + end together).
      const snapRows = await db
        .select({
          symbol: tokens.symbol,
          phase: priceSnapshots.phase,
          priceUsd: priceSnapshots.priceUsd,
        })
        .from(priceSnapshots)
        .innerJoin(tokens, eq(priceSnapshots.tokenId, tokens.id))
        .where(eq(priceSnapshots.contestId, contestId));

      const prices = new Map<string, { start: number; end: number }>();
      for (const s of snapRows) {
        const cur = prices.get(s.symbol) ?? { start: 0, end: 0 };
        if (s.phase === 'start') cur.start = Number(s.priceUsd);
        if (s.phase === 'end') cur.end = Number(s.priceUsd);
        prices.set(s.symbol, cur);
      }

      // 4. Pure compute. Pool = (real + bot) × fee × (1 - rake) — bots pay entry too.
      // prize_pool_cents column still acts as guaranteed-minimum floor.
      const totalCount = inputEntries.length;
      const actualPoolCents = computeActualPrizeCents({
        totalCount,
        entryFeeCents: Number(contest.entryFeeCents),
        rakePct,
        guaranteedPoolCents: Number(contest.prizePoolCents),
      });
      const result = finalizeContest({
        entries: inputEntries,
        prices,
        prizePoolCents: actualPoolCents,
        contestType: contest.type === 'bear' ? 'bear' : 'bull',
      });

      // 5. Apply entry updates + contest status in single tx.
      await db.transaction(async (tx) => {
        for (const e of result.entries) {
          await tx
            .update(entries)
            .set({
              finalScore: String(e.finalScore),
              prizeCents: BigInt(e.prizeCents),
              status: 'finalized',
            })
            .where(eq(entries.id, e.entryId));
        }
        await tx.update(contests).set({ status: 'finalized' }).where(eq(contests.id, contestId));
      });

      // 6. Payouts (idempotent — INV-9 each via currency.transact).
      let paidCount = 0;
      let totalCents = 0;
      for (const p of result.payouts) {
        const [existing] = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.refType, 'entry'),
              eq(transactions.refId, p.entryId),
              eq(transactions.type, 'PRIZE_PAYOUT'),
            ),
          )
          .limit(1);
        if (existing) continue;

        await currency.transact({
          userId: p.userId,
          deltaCents: BigInt(p.cents),
          type: 'PRIZE_PAYOUT',
          refType: 'entry',
          refId: p.entryId,
        });
        paidCount += 1;
        totalCents += p.cents;
      }

      return { paidCount, totalCents };
    },
  };
}
