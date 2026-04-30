import { sql } from 'drizzle-orm';
import type { RankingMode } from '@fantasytoken/shared';
import type { Database } from '../../db/client.js';
import type { RankingsRepo, RankingRow } from './rankings.service.js';

// drizzle's `.execute<T>()` constrains T to Record<string,unknown>; wrap our
// row shape with an index signature so the inferred type satisfies it without
// losing the named-field types where we read them.
type AggregationRow = Record<string, unknown> & {
  user_id: string;
  display_name: string | null;
  username: string | null;
  photo_url: string | null;
  current_rank: number | null;
  net_cents: string | null;
  bull_cents: string | null;
  bear_cents: string | null;
  contests_played: string | null;
};

function rowFromAggregation(r: AggregationRow): RankingRow {
  return {
    userId: r.user_id,
    displayName: r.display_name ?? r.username ?? 'Player',
    avatarUrl: r.photo_url ?? null,
    tierRank: r.current_rank ?? 1,
    netPnlCents: Number(r.net_cents ?? 0),
    bullPnlCents: Number(r.bull_cents ?? 0),
    bearPnlCents: Number(r.bear_cents ?? 0),
    contestsPlayed: Number(r.contests_played ?? 0),
  };
}

/** SQL fragment that picks the right SUM column for the requested sort axis.
 * Used both for ORDER BY and rank-of-single-user queries — single source of
 * truth for "PnL by mode" so the leaderboard and a player's own rank stay
 * consistent. */
function modeSumFragment(mode: RankingMode) {
  if (mode === 'bull') {
    return sql`COALESCE(SUM(t.delta_cents) FILTER (
      WHERE t.type IN ('ENTRY_FEE','PRIZE_PAYOUT','REFUND')
        AND c.type = 'bull'
    ), 0)`;
  }
  if (mode === 'bear') {
    return sql`COALESCE(SUM(t.delta_cents) FILTER (
      WHERE t.type IN ('ENTRY_FEE','PRIZE_PAYOUT','REFUND')
        AND c.type = 'bear'
    ), 0)`;
  }
  return sql`COALESCE(SUM(t.delta_cents) FILTER (
    WHERE t.type IN ('ENTRY_FEE','PRIZE_PAYOUT','REFUND')
  ), 0)`;
}

export function createRankingsRepo(db: Database): RankingsRepo {
  const repo: RankingsRepo = {
    async netPnlForUsers(userIds) {
      if (userIds.length === 0) return new Map();
      // Aggregate net PnL per user, plus per-mode breakdowns. The shape is
      // mode-agnostic — the caller (service) decides the sort axis. Joining
      // through entries→contests is required to attribute each transaction's
      // contest type without redundant per-row lookups.
      const rows = await db.execute<AggregationRow>(sql`
        SELECT
          u.id AS user_id,
          u.first_name AS display_name,
          u.username,
          u.photo_url,
          u.current_rank,
          COALESCE(SUM(t.delta_cents) FILTER (
            WHERE t.type IN ('ENTRY_FEE','PRIZE_PAYOUT','REFUND')
          ), 0)::text AS net_cents,
          COALESCE(SUM(t.delta_cents) FILTER (
            WHERE t.type IN ('ENTRY_FEE','PRIZE_PAYOUT','REFUND')
              AND c.type = 'bull'
          ), 0)::text AS bull_cents,
          COALESCE(SUM(t.delta_cents) FILTER (
            WHERE t.type IN ('ENTRY_FEE','PRIZE_PAYOUT','REFUND')
              AND c.type = 'bear'
          ), 0)::text AS bear_cents,
          COUNT(DISTINCT t.ref_id) FILTER (WHERE t.type = 'ENTRY_FEE')::text AS contests_played
        FROM users u
        LEFT JOIN transactions t ON t.user_id = u.id AND t.ref_type = 'entry'
        LEFT JOIN entries e ON e.id::text = t.ref_id
        LEFT JOIN contests c ON c.id = e.contest_id
        WHERE u.id IN (${sql.join(userIds, sql`, `)})
        GROUP BY u.id, u.first_name, u.username, u.photo_url, u.current_rank
      `);

      const map = new Map<string, RankingRow>();
      for (const r of rows as unknown as AggregationRow[]) {
        map.set(r.user_id, rowFromAggregation(r));
      }
      return map;
    },

    async topGlobal(limit, mode) {
      const orderColumn = modeSumFragment(mode);
      const rows = await db.execute<AggregationRow>(sql`
        SELECT
          u.id AS user_id,
          u.first_name AS display_name,
          u.username,
          u.photo_url,
          u.current_rank,
          COALESCE(SUM(t.delta_cents) FILTER (
            WHERE t.type IN ('ENTRY_FEE','PRIZE_PAYOUT','REFUND')
          ), 0)::text AS net_cents,
          COALESCE(SUM(t.delta_cents) FILTER (
            WHERE t.type IN ('ENTRY_FEE','PRIZE_PAYOUT','REFUND')
              AND c.type = 'bull'
          ), 0)::text AS bull_cents,
          COALESCE(SUM(t.delta_cents) FILTER (
            WHERE t.type IN ('ENTRY_FEE','PRIZE_PAYOUT','REFUND')
              AND c.type = 'bear'
          ), 0)::text AS bear_cents,
          COUNT(DISTINCT t.ref_id) FILTER (WHERE t.type = 'ENTRY_FEE')::text AS contests_played
        FROM users u
        LEFT JOIN transactions t ON t.user_id = u.id AND t.ref_type = 'entry'
        LEFT JOIN entries e ON e.id::text = t.ref_id
        LEFT JOIN contests c ON c.id = e.contest_id
        GROUP BY u.id, u.first_name, u.username, u.photo_url, u.current_rank, u.created_at
        ORDER BY ${orderColumn} DESC, u.created_at ASC
        LIMIT ${sql.raw(String(Math.max(1, Math.floor(limit))))}
      `);
      return (rows as unknown as AggregationRow[]).map(rowFromAggregation);
    },

    async netPnlForUser(userId) {
      const map = await repo.netPnlForUsers([userId]);
      return map.get(userId) ?? null;
    },

    async globalRankOf(userId, mode) {
      const orderColumn = modeSumFragment(mode);
      const rows = await db.execute<{ rank: string }>(sql`
        WITH net AS (
          SELECT u.id, u.created_at,
            (${orderColumn}) AS sort_cents
          FROM users u
          LEFT JOIN transactions t ON t.user_id = u.id AND t.ref_type = 'entry'
          LEFT JOIN entries e ON e.id::text = t.ref_id
          LEFT JOIN contests c ON c.id = e.contest_id
          GROUP BY u.id, u.created_at
        )
        SELECT (
          SELECT COUNT(*) + 1
          FROM net n2
          WHERE n2.sort_cents > n1.sort_cents
             OR (n2.sort_cents = n1.sort_cents AND n2.created_at < n1.created_at)
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
