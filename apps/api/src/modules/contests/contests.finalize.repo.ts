import { and, eq, sql } from 'drizzle-orm';
import { awardXp, computeActualPrizeCents, rankFromXp } from '@fantasytoken/shared';
import type { Database } from '../../db/client.js';
import {
  contests,
  entries,
  priceSnapshots,
  seasons,
  tokens,
  transactions,
  users,
  xpEvents,
} from '../../db/schema/index.js';
import type { CurrencyService } from '../currency/currency.service.js';
import type { Logger } from '../../logger.js';
import type { ReferralsService } from '../referrals/referrals.service.js';
import type { DmQueueService } from '../bot/queue.service.js';
import { finalizeContest, type FinalizeInputEntry } from './contests.finalize.js';

export interface ContestsFinalizeRepo {
  findContestsToFinalize2(): Promise<Array<{ id: string; prizePoolCents: bigint }>>;
  finalize(contestId: string): Promise<{ paidCount: number; totalCents: number }>;
}

export interface ContestsFinalizeRepoOptions {
  /** Optional bot DM queue. When provided, every real entry gets a
   * "your contest finished" DM enqueued with a 5-min grace window
   * (skipped on send if the user opens the result themselves first). */
  dmQueue?: DmQueueService;
  /** Mini-app deep-link base, e.g. `https://t.me/fantasytokenbot/fantasytoken`.
   * Combined with `?startapp=result_<contestId>` to point the DM at the
   * specific result page. Optional — without it the DM is not enqueued. */
  miniAppUrl?: string;
}

export function createContestsFinalizeRepo(
  db: Database,
  currency: CurrencyService,
  rakePct: number,
  log: Logger,
  referrals: ReferralsService,
  options: ContestsFinalizeRepoOptions = {},
): ContestsFinalizeRepo {
  const { dmQueue, miniAppUrl } = options;
  return {
    async findContestsToFinalize2() {
      return db
        .select({ id: contests.id, prizePoolCents: contests.prizePoolCents })
        .from(contests)
        .where(eq(contests.status, 'finalizing'));
    },

    async finalize(contestId) {
      // 1. Load contest (incl. xp_multiplier for the rank-system XP awards).
      const [contest] = await db
        .select({
          id: contests.id,
          name: contests.name,
          prizePoolCents: contests.prizePoolCents,
          entryFeeCents: contests.entryFeeCents,
          type: contests.type,
          xpMultiplier: contests.xpMultiplier,
          payAll: contests.payAll,
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
        payAll: contest.payAll,
      });

      // 5. Apply entry updates. We deliberately do NOT flip contests.status
      // to 'finalized' here — that's deferred until step 7's payout loop
      // succeeds (see step 7a). If finalize crashes between here and step 7,
      // the next tick's findContestsToFinalize2 will pick the row up again
      // (status still 'finalizing'); the entry update + payout loop are
      // both idempotent so the retry settles cleanly.
      await db.transaction(async (tx) => {
        for (const e of result.entries) {
          await tx
            .update(entries)
            .set({
              finalScore: String(e.finalScore),
              finalRank: e.finalRank,
              prizeCents: BigInt(e.prizeCents),
              status: 'finalized',
            })
            .where(eq(entries.id, e.entryId));
        }
      });

      // 6. XP awards (rank-system) — only for real users in payable AND non-payable
      // ranks alike (everyone gets at least Participation = +10). Skipped for bots
      // (no userId). Idempotent: skip if any xp_events already exist for this contest.
      const [existingXp] = await db
        .select({ id: xpEvents.id })
        .from(xpEvents)
        .where(eq(xpEvents.contestId, contestId))
        .limit(1);
      if (!existingXp) {
        const [activeSeason] = await db
          .select({ id: seasons.id })
          .from(seasons)
          .where(eq(seasons.status, 'active'))
          .limit(1);
        const seasonId = activeSeason?.id;
        const xpMultiplier = Number(contest.xpMultiplier);
        // Award XP using overall finalRank against the full room (incl. bots) — the
        // result UI shows "rank #N of M" with bots counted, and giving "1st place
        // bonus" to the only real player in a bot-filled room because they're
        // technically 1st-of-1 reals does not match user expectation.
        const realFinalized = result.entries
          .filter((e) => !e.isBot && e.userId)
          .sort((a, b) => a.finalRank - b.finalRank);
        const totalEntries = result.entries.length;

        for (const e of realFinalized) {
          const award = awardXp({
            position: e.finalRank,
            totalEntries,
            contestMultiplier: xpMultiplier,
            contestType: contest.type === 'bear' ? 'bear' : 'bull',
          });
          try {
            await db.transaction(async (tx) => {
              await tx.insert(xpEvents).values({
                userId: e.userId!,
                contestId,
                ...(seasonId !== undefined && { seasonId }),
                deltaXp: award.total,
                reason: 'contest_finalized',
                breakdown: award.breakdown as unknown as Record<string, unknown>,
              });
              const [u] = await tx
                .select({ xpTotal: users.xpTotal, currentRank: users.currentRank })
                .from(users)
                .where(eq(users.id, e.userId!))
                .limit(1);
              const newXpTotal = (u?.xpTotal ?? 0) + award.total;
              const newRank = rankFromXp(newXpTotal).rank;
              await tx
                .update(users)
                .set({
                  xpTotal: sql`${users.xpTotal} + ${award.total}`,
                  xpSeason: sql`${users.xpSeason} + ${award.total}`,
                  currentRank: sql`GREATEST(${users.currentRank}, ${newRank})`,
                  careerHighestRank: sql`GREATEST(${users.careerHighestRank}, ${newRank})`,
                })
                .where(eq(users.id, e.userId!));
            });
          } catch (err) {
            // INV-7: never let an XP failure block prize payouts.
            log.error({ err, userId: e.userId, contestId }, 'xp award failed');
          }
        }
      }

      // 7. Payouts (idempotent — INV-9 each via currency.transact).
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

      // 7a. All payouts settled — now safe to mark the contest finalized.
      // Deferred from step 5 so a payout crash leaves the contest in
      // 'finalizing' for the next tick to retry. Idempotent UPDATE.
      await db.update(contests).set({ status: 'finalized' }).where(eq(contests.id, contestId));

      // 8. Referrals — sidecar to prize distribution. INV-7: each call has its
      // own try/catch inside the service; failures here never bubble. Two passes:
      //   a) For every real entry: maybeUnlockSignupBonuses (REFEREE+RECRUITER)
      //      now that the user has at least one finalized contest under them.
      //   b) For every prize-winning real entry: payCommissions to the L1/L2
      //      chain walking up `users.referrer_user_id`.
      // V1 is USD-only so the currency code is hard-coded; the schema and
      // pure functions accept STARS/TON for when those rails land.
      const realFinalized = result.entries.filter((e) => !e.isBot && e.userId);
      for (const e of realFinalized) {
        await referrals.maybeUnlockSignupBonuses({
          userId: e.userId!,
          triggeredByEntryId: e.entryId,
        });
      }
      for (const e of realFinalized) {
        if (e.prizeCents <= 0) continue;
        await referrals.payCommissions({
          sourceUserId: e.userId!,
          sourceEntryId: e.entryId,
          sourceContestId: contestId,
          sourcePrizeCents: BigInt(e.prizeCents),
          currency: 'USD',
        });
      }

      // 9. Bot DM nudge — "your contest finished, here's the result".
      // Enqueued with a 5-min grace floor; the queue's drain skips any row
      // whose entries.result_viewed_at was set during the wait (i.e. user
      // came back on their own). Only real users; needs both a configured
      // bot dmQueue AND a miniAppUrl so the link points somewhere useful.
      if (dmQueue && miniAppUrl) {
        const totalEntries = result.entries.length;
        const url = `${miniAppUrl}?startapp=result_${contestId}`;
        for (const e of realFinalized) {
          await dmQueue.enqueueContestFinalized({
            recipientUserId: e.userId!,
            event: {
              entryId: e.entryId,
              contestId,
              contestName: contest.name,
              finalRank: e.finalRank,
              totalEntries,
              prizeCents: e.prizeCents,
              resultUrl: url,
            },
          });
        }
      }

      return { paidCount, totalCents };
    },
  };
}
