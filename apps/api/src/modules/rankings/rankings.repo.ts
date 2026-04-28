import { eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { transactions, users } from '../../db/schema/index.js';
import type { RankingsRepo, RankingRow } from './rankings.service.js';

const GAMEPLAY_TYPES = ['ENTRY_FEE', 'PRIZE_PAYOUT', 'REFUND'] as const;

function rowFromAggregation(r: {
  user_id: string;
  display_name: string | null;
  username: string | null;
  net_cents: string | null;
  contests_played: string | null;
}): RankingRow {
  return {
    userId: r.user_id,
    displayName: r.display_name ?? r.username ?? 'Player',
    netPnlCents: Number(r.net_cents ?? 0),
    contestsPlayed: Number(r.contests_played ?? 0),
  };
}

export function createRankingsRepo(db: Database): RankingsRepo {
  const repo: RankingsRepo = {
    async netPnlForUsers(userIds) {
      if (userIds.length === 0) return new Map();
      const rows = await db
        .select({
          userId: users.id,
          displayName: users.firstName,
          username: users.username,
          netCents: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('ENTRY_FEE','PRIZE_PAYOUT','REFUND') THEN ${transactions.deltaCents} ELSE 0 END), 0)::text`,
          contestsPlayed: sql<string>`COUNT(DISTINCT ${transactions.refId}) FILTER (WHERE ${transactions.type} = 'ENTRY_FEE')::text`,
        })
        .from(users)
        .leftJoin(transactions, eq(transactions.userId, users.id))
        .where(inArray(users.id, userIds))
        .groupBy(users.id, users.firstName, users.username);

      const map = new Map<string, RankingRow>();
      for (const r of rows) {
        map.set(
          r.userId,
          rowFromAggregation({
            user_id: r.userId,
            display_name: r.displayName,
            username: r.username,
            net_cents: r.netCents,
            contests_played: r.contestsPlayed,
          }),
        );
      }
      return map;
    },

    async topGlobal(limit) {
      const rows = await db.execute<{
        user_id: string;
        display_name: string | null;
        username: string | null;
        net_cents: string;
        contests_played: string;
      }>(sql`
        SELECT
          u.id AS user_id,
          u.first_name AS display_name,
          u.username,
          SUM(t.delta_cents)::text AS net_cents,
          COUNT(DISTINCT t.ref_id) FILTER (WHERE t.type = 'ENTRY_FEE')::text AS contests_played
        FROM users u
        JOIN transactions t ON t.user_id = u.id
        WHERE t.type IN (${sql.raw(GAMEPLAY_TYPES.map((s) => `'${s}'`).join(','))})
        GROUP BY u.id, u.first_name, u.username
        HAVING COUNT(*) FILTER (WHERE t.type = 'ENTRY_FEE') > 0
        ORDER BY SUM(t.delta_cents) DESC
        LIMIT ${sql.raw(String(Math.max(1, Math.floor(limit))))}
      `);
      return (
        rows as unknown as Array<{
          user_id: string;
          display_name: string | null;
          username: string | null;
          net_cents: string;
          contests_played: string;
        }>
      ).map(rowFromAggregation);
    },

    async netPnlForUser(userId) {
      const map = await repo.netPnlForUsers([userId]);
      return map.get(userId) ?? null;
    },

    async globalRankOf(userId) {
      const rows = await db.execute<{ rank: string }>(sql`
        WITH net AS (
          SELECT u.id, SUM(t.delta_cents) AS net_cents
          FROM users u
          JOIN transactions t ON t.user_id = u.id
          WHERE t.type IN ('ENTRY_FEE','PRIZE_PAYOUT','REFUND')
          GROUP BY u.id
          HAVING COUNT(*) FILTER (WHERE t.type = 'ENTRY_FEE') > 0
        )
        SELECT (
          SELECT COUNT(*) + 1
          FROM net n2
          WHERE n2.net_cents > n1.net_cents
        )::text AS rank
        FROM net n1
        WHERE n1.id = ${userId}
      `);
      const arr = rows as unknown as Array<{ rank: string }>;
      if (arr.length === 0) return null;
      return Number(arr[0]!.rank);
    },
  };
  return repo;
}
