import { and, eq, gt, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { entries, syntheticActionsLog } from '../db/schema/index.js';

/**
 * TZ-005 §9 — observability hooks for the polish-loop agent.
 *
 * Exposes the metrics most useful for spotting cohort drift:
 *   • action distribution (what's happening)
 *   • peak-hour load (when)
 *   • referral tree shape (cascade health)
 *   • lineup diversity (anti-monoculture; per contest)
 *   • economy snapshot (balances by persona — early warning for "casuals
 *     drained to zero before earning a prize")
 *
 * All read-only. Heavy aggregations are bounded by `since`/`limit` so
 * the polish loop can poll cheaply. Indexes (sim_log_action_tick_idx,
 * sim_log_user_tick_idx, users_real_only_idx) make all of these
 * index-only scans on a healthy DB.
 */

export interface ActionRow {
  action: string;
  outcome: string;
  errorCode: string | null;
  count: number;
}

export interface HourlyLoadRow {
  hour: number; // 0..23 UTC
  count: number;
}

export interface ReferralTreeShape {
  totalSynthetics: number;
  withReferrer: number;
  rootInviters: number;
  maxDepth: number;
}

export interface LineupDiversity {
  contestId: string;
  totalEntries: number;
  uniqueSymbols: number;
  /** Shannon entropy in nats over symbol-frequency distribution. Higher
   * = more diverse; ~ln(uniqueSymbols) for uniform, 0 for monoculture. */
  entropy: number;
}

export interface EconomySnapshotRow {
  personaKind: string;
  count: number;
  zeroBalanceCount: number;
  totalCoins: number;
}

export interface SimObservability {
  getActionDistribution(opts: { since: Date }): Promise<ActionRow[]>;
  getHourlyLoad(opts: { since: Date; action?: string }): Promise<HourlyLoadRow[]>;
  getReferralTreeShape(): Promise<ReferralTreeShape>;
  getLineupDiversity(opts: { contestId: string }): Promise<LineupDiversity>;
  getEconomySnapshot(): Promise<EconomySnapshotRow[]>;
}

export function createSimObservability(db: Database): SimObservability {
  return {
    async getActionDistribution({ since }) {
      const rows = await db
        .select({
          action: syntheticActionsLog.action,
          outcome: syntheticActionsLog.outcome,
          errorCode: syntheticActionsLog.errorCode,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(syntheticActionsLog)
        .where(gt(syntheticActionsLog.tick, since))
        .groupBy(
          syntheticActionsLog.action,
          syntheticActionsLog.outcome,
          syntheticActionsLog.errorCode,
        );
      return rows.map((r) => ({
        action: r.action,
        outcome: r.outcome,
        errorCode: r.errorCode,
        count: r.count,
      }));
    },

    async getHourlyLoad({ since, action }) {
      const where = action
        ? and(gt(syntheticActionsLog.tick, since), eq(syntheticActionsLog.action, action))
        : gt(syntheticActionsLog.tick, since);
      const rows = await db
        .select({
          hour: sql<number>`EXTRACT(HOUR FROM ${syntheticActionsLog.tick})::int`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(syntheticActionsLog)
        .where(where)
        .groupBy(sql`EXTRACT(HOUR FROM ${syntheticActionsLog.tick})`);
      return rows.map((r) => ({ hour: r.hour, count: r.count }));
    },

    async getReferralTreeShape() {
      const stats = await db.execute<{
        total: string;
        with_ref: string;
        roots: string;
      }>(sql`
        SELECT
          COUNT(*)::text AS total,
          COUNT(referrer_user_id)::text AS with_ref,
          COUNT(DISTINCT referrer_user_id) FILTER (WHERE referrer_user_id IS NOT NULL)::text AS roots
        FROM users
        WHERE is_synthetic = true
      `);
      const s = (stats as unknown as Array<{ total: string; with_ref: string; roots: string }>)[0];

      // Recursive walk for max depth — capped at 10 levels because
      // depth(synth → root) blowing past that means a config bug.
      const depthRows = await db.execute<{ depth: number }>(sql`
        WITH RECURSIVE chain AS (
          SELECT id, referrer_user_id, 0 AS depth
            FROM users
           WHERE is_synthetic = true AND referrer_user_id IS NULL
          UNION ALL
          SELECT u.id, u.referrer_user_id, c.depth + 1
            FROM users u
            JOIN chain c ON u.referrer_user_id = c.id
           WHERE u.is_synthetic = true AND c.depth < 10
        )
        SELECT MAX(depth)::int AS depth FROM chain
      `);
      const dr = (depthRows as unknown as Array<{ depth: number | null }>)[0];

      return {
        totalSynthetics: Number(s?.total ?? 0),
        withReferrer: Number(s?.with_ref ?? 0),
        rootInviters: Number(s?.roots ?? 0),
        maxDepth: Number(dr?.depth ?? 0),
      };
    },

    async getLineupDiversity({ contestId }) {
      const rows = await db.execute<{ symbol: string; count: string }>(sql`
        SELECT pick.value->>'symbol' AS symbol, COUNT(*)::text AS count
          FROM ${entries}, jsonb_array_elements(${entries.picks}) AS pick
         WHERE ${entries.contestId} = ${contestId}
         GROUP BY pick.value->>'symbol'
      `);
      const arr = rows as unknown as Array<{ symbol: string; count: string }>;
      const totalPicks = arr.reduce((acc, r) => acc + Number(r.count), 0);
      const uniqueSymbols = arr.length;

      // Per-contest entry count (for the report header). Could compute
      // from totalPicks/avg-lineup-size but explicit is clearer.
      const entryRows = await db.execute<{ n: string }>(sql`
        SELECT COUNT(*)::text AS n FROM ${entries} WHERE ${entries.contestId} = ${contestId}
      `);
      const totalEntries = Number((entryRows as unknown as Array<{ n: string }>)[0]?.n ?? 0);

      // Shannon entropy in nats. 0 if monoculture, ln(N) for uniform.
      let entropy = 0;
      for (const r of arr) {
        const p = Number(r.count) / Math.max(1, totalPicks);
        if (p > 0) entropy -= p * Math.log(p);
      }

      return { contestId, totalEntries, uniqueSymbols, entropy };
    },

    async getEconomySnapshot() {
      const rows = await db.execute<{
        persona_kind: string;
        count: string;
        zero_balance: string;
        total_coins: string;
      }>(sql`
        SELECT
          u.persona_kind,
          COUNT(*)::text AS count,
          SUM(CASE WHEN COALESCE(b.amount_cents, 0) = 0 THEN 1 ELSE 0 END)::text AS zero_balance,
          COALESCE(SUM(b.amount_cents), 0)::text AS total_coins
        FROM users u
        LEFT JOIN balances b ON b.user_id = u.id AND b.currency_code = 'USD'
        WHERE u.is_synthetic = true
        GROUP BY u.persona_kind
        ORDER BY u.persona_kind
      `);
      return (
        rows as unknown as Array<{
          persona_kind: string;
          count: string;
          zero_balance: string;
          total_coins: string;
        }>
      ).map((r) => ({
        personaKind: r.persona_kind,
        count: Number(r.count),
        zeroBalanceCount: Number(r.zero_balance),
        totalCoins: Number(r.total_coins),
      }));
    },
  };
}
