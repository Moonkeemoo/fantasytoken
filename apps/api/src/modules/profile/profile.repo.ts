import { and, eq, desc, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { contests, entries, transactions, users } from '../../db/schema/index.js';
import type { ProfileData, ProfileRepo, ProfileRecentContest } from './profile.service.js';

export function createProfileRepo(db: Database): ProfileRepo {
  return {
    async load(userId, recentLimit) {
      const [u] = await db
        .select({
          telegramId: users.telegramId,
          firstName: users.firstName,
          username: users.username,
          photoUrl: users.photoUrl,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!u) return null;

      // Balance: signed sum of all transactions for this user.
      const [bal] = await db
        .select({
          cents: sql<string>`COALESCE(SUM(${transactions.deltaCents}), 0)::text`,
        })
        .from(transactions)
        .where(eq(transactions.userId, userId));
      const balanceCents = Number(bal?.cents ?? 0);

      // Per-entry net P&L from gameplay transactions (sums ENTRY_FEE + PRIZE_PAYOUT + REFUND).
      // Drives both stats and the recent-contests list.
      // Cancelled-with-refund nets to 0 → counted as 'even', excluded from win rate.
      const perEntryRows = await db
        .select({
          entryId: entries.id,
          contestStatus: contests.status,
          netCents: sql<string>`COALESCE((
            SELECT SUM(${transactions.deltaCents})
            FROM ${transactions}
            WHERE ${transactions.refType} = 'entry'
              AND ${transactions.refId} = ${entries.id}::text
              AND ${transactions.userId} = ${entries.userId}
              AND ${transactions.type} IN ('ENTRY_FEE','PRIZE_PAYOUT','REFUND')
          ), 0)::text`,
        })
        .from(entries)
        .innerJoin(contests, eq(contests.id, entries.contestId))
        .where(eq(entries.userId, userId));

      const contestsPlayed = perEntryRows.length;
      let wonCount = 0;
      let lostCount = 0;
      let bestPnlCents: number | null = null;
      for (const row of perEntryRows) {
        if (row.contestStatus !== 'finalized' && row.contestStatus !== 'cancelled') continue;
        const net = Number(row.netCents);
        if (bestPnlCents === null || net > bestPnlCents) bestPnlCents = net;
        if (net > 0) wonCount += 1;
        else if (net < 0) lostCount += 1;
        // net === 0 → even, doesn't count toward win/loss
      }
      const decidedCount = wonCount + lostCount;
      const winRate = decidedCount > 0 ? wonCount / decidedCount : null;

      // All-time gameplay P&L (consistent with rankings module).
      const [pnl] = await db
        .select({
          cents: sql<string>`COALESCE(SUM(${transactions.deltaCents}) FILTER (WHERE ${transactions.type} IN ('ENTRY_FEE','PRIZE_PAYOUT','REFUND')), 0)::text`,
        })
        .from(transactions)
        .where(eq(transactions.userId, userId));
      const allTimePnlCents = Number(pnl?.cents ?? 0);

      // Recent contests — include both 'finalized' (played to end) and 'cancelled'
      // (auto-cancelled stale contests where the entry was refunded). Net P&L is
      // computed from the actual transactions for that entry, so cancellations with
      // a refund net to $0, while plays show prize - fee.
      const recentRows = await db
        .select({
          entryId: entries.id,
          contestId: contests.id,
          contestName: contests.name,
          contestType: contests.type,
          contestStatus: contests.status,
          finalRank: entries.finalRank,
          finishedAt: contests.endsAt,
          totalEntries: sql<string>`(SELECT COUNT(*)::text FROM ${entries} e2 WHERE e2.contest_id = ${contests.id})`,
        })
        .from(entries)
        .innerJoin(contests, eq(contests.id, entries.contestId))
        .where(
          and(eq(entries.userId, userId), inArray(contests.status, ['finalized', 'cancelled'])),
        )
        .orderBy(desc(contests.endsAt))
        .limit(recentLimit);

      // Aggregate net P&L per entry from gameplay transactions in one round-trip.
      const entryIds = recentRows.map((r) => r.entryId);
      const txByEntry = new Map<string, number>();
      if (entryIds.length > 0) {
        const txRows = await db
          .select({
            entryId: transactions.refId,
            net: sql<string>`COALESCE(SUM(${transactions.deltaCents}), 0)::text`,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.refType, 'entry'),
              inArray(transactions.refId, entryIds),
              inArray(transactions.type, ['ENTRY_FEE', 'PRIZE_PAYOUT', 'REFUND']),
            ),
          )
          .groupBy(transactions.refId);
        for (const t of txRows) {
          if (t.entryId) txByEntry.set(t.entryId, Number(t.net));
        }
      }

      const recentContests: ProfileRecentContest[] = recentRows.map((r) => ({
        contestId: r.contestId,
        contestName: r.contestName,
        contestType: r.contestType === 'bear' ? 'bear' : 'bull',
        finalRank: r.finalRank,
        totalEntries: Number(r.totalEntries),
        finishedAt: r.finishedAt,
        netPnlCents: txByEntry.get(r.entryId) ?? 0,
      }));

      const data: ProfileData = {
        user: {
          telegramId: u.telegramId,
          firstName: u.firstName ?? u.username ?? 'Player',
          username: u.username,
          photoUrl: u.photoUrl,
        },
        balanceCents,
        stats: {
          contestsPlayed,
          winRate,
          bestPnlCents,
          allTimePnlCents,
        },
        recentContests,
      };
      return data;
    },
  };
}
