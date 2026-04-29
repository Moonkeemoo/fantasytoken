import { and, eq, desc, sql } from 'drizzle-orm';
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

      // Stats:
      // - contestsPlayed: number of entries belonging to the user
      // - bestFinish: min final_rank across finalized entries (null if none)
      // - winRate: fraction of finalized entries that earned prize_cents > 0
      const [stats] = await db
        .select({
          totalEntries: sql<string>`COUNT(*)::text`,
          finalizedCount: sql<string>`COUNT(*) FILTER (WHERE ${entries.status} = 'finalized')::text`,
          winCount: sql<string>`COUNT(*) FILTER (WHERE ${entries.status} = 'finalized' AND ${entries.prizeCents} > 0)::text`,
          bestRank: sql<
            number | null
          >`MIN(${entries.finalRank}) FILTER (WHERE ${entries.status} = 'finalized')`,
        })
        .from(entries)
        .where(eq(entries.userId, userId));

      const contestsPlayed = Number(stats?.totalEntries ?? 0);
      const finalizedCount = Number(stats?.finalizedCount ?? 0);
      const winCount = Number(stats?.winCount ?? 0);
      const winRate = finalizedCount > 0 ? winCount / finalizedCount : null;
      const bestFinish = stats?.bestRank ?? null;

      // All-time gameplay P&L (consistent with rankings module).
      const [pnl] = await db
        .select({
          cents: sql<string>`COALESCE(SUM(${transactions.deltaCents}) FILTER (WHERE ${transactions.type} IN ('ENTRY_FEE','PRIZE_PAYOUT','REFUND')), 0)::text`,
        })
        .from(transactions)
        .where(eq(transactions.userId, userId));
      const allTimePnlCents = Number(pnl?.cents ?? 0);

      // Recent finalized contests with per-contest net P&L.
      const recentRows = await db
        .select({
          contestId: contests.id,
          contestName: contests.name,
          contestType: contests.type,
          finalRank: entries.finalRank,
          finishedAt: contests.endsAt,
          prizeCents: entries.prizeCents,
          entryFeeCents: contests.entryFeeCents,
          totalEntries: sql<string>`(SELECT COUNT(*)::text FROM ${entries} e2 WHERE e2.contest_id = ${contests.id})`,
        })
        .from(entries)
        .innerJoin(contests, eq(contests.id, entries.contestId))
        .where(and(eq(entries.userId, userId), eq(entries.status, 'finalized')))
        .orderBy(desc(contests.endsAt))
        .limit(recentLimit);

      const recentContests: ProfileRecentContest[] = recentRows.map((r) => ({
        contestId: r.contestId,
        contestName: r.contestName,
        contestType: r.contestType === 'bear' ? 'bear' : 'bull',
        finalRank: r.finalRank,
        totalEntries: Number(r.totalEntries),
        finishedAt: r.finishedAt,
        netPnlCents: Number(r.prizeCents) - Number(r.entryFeeCents),
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
          bestFinish,
          allTimePnlCents,
        },
        recentContests,
      };
      return data;
    },
  };
}
