import { sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { RotateRepo } from './rotate.service.js';

export function createRotateRepo(db: Database): RotateRepo {
  return {
    async trimSyntheticActionsLog(retentionMs) {
      const r = await db.execute(sql`
        DELETE FROM synthetic_actions_log
        WHERE tick < now() - (${retentionMs / 1000}::int || ' seconds')::interval
      `);
      return rowCount(r);
    },

    async trimSyntheticTransactions(retentionMs) {
      // INV-9 protects REAL-user transactions as immutable audit. Synth
      // rows are cohort observability — wipe service already nukes them
      // wholesale on reseed, so a rolling delete is the same shape, just
      // continuous.
      const r = await db.execute(sql`
        DELETE FROM transactions
        WHERE user_id IN (SELECT id FROM users WHERE is_synthetic = true)
          AND created_at < now() - (${retentionMs / 1000}::int || ' seconds')::interval
      `);
      return rowCount(r);
    },

    async trimFinalizedContests(retentionMs) {
      // Cascade kills entries (synth + bot) and price_snapshots via FKs.
      // Skip any contest that has at least one real-user entry — real
      // history must outlive the cohort.
      const r = await db.execute(sql`
        DELETE FROM contests c
        WHERE c.status = 'finalized'
          AND c.ends_at < now() - (${retentionMs / 1000}::int || ' seconds')::interval
          AND NOT EXISTS (
            SELECT 1 FROM entries e
            JOIN users u ON u.id = e.user_id
            WHERE e.contest_id = c.id
              AND u.is_synthetic = false
          )
      `);
      return rowCount(r);
    },

    async vacuum(tables) {
      // VACUUM cannot run inside a transaction block; db.execute outside
      // tx is fine. Identifier is whitelisted by the caller — never
      // interpolate user input here.
      for (const t of tables) {
        if (!/^[a-z_]+$/.test(t)) {
          throw new Error(`vacuum: unsafe table name "${t}"`);
        }
        await db.execute(sql.raw(`VACUUM ${t}`));
      }
    },
  };
}

// drizzle's execute() returns a Result-like with `count` on postgres-js
// driver and `rowCount` elsewhere; normalise without leaking the type.
function rowCount(r: unknown): number {
  const obj = r as { rowCount?: number; count?: number };
  return obj.rowCount ?? obj.count ?? 0;
}
