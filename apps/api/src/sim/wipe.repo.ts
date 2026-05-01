import { sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { WipeRepo, WipeResult } from './wipe.service.js';

/**
 * TZ-005 §6 — wipe repo.
 *
 * Order is the dependency graph: every table that holds a synthetic FK
 * is purged before users themselves. `synthetic_actions_log` cascades
 * automatically (CASCADE in 0021), but we still surface its count for
 * dry-run / verification. M2 will extend this with `xp_events` /
 * `referral_*` once those start populating.
 */
export function createWipeRepo(db: Database): WipeRepo {
  return {
    async countSynthetic() {
      const r = await db.execute<{
        users: string;
        transactions: string;
        entries: string;
        log_rows: string;
      }>(sql`
        SELECT
          (SELECT COUNT(*) FROM users WHERE is_synthetic = true)::text AS users,
          (SELECT COUNT(*) FROM transactions t
            JOIN users u ON u.id = t.user_id WHERE u.is_synthetic = true)::text AS transactions,
          (SELECT COUNT(*) FROM entries e
            JOIN users u ON u.id = e.user_id WHERE u.is_synthetic = true)::text AS entries,
          (SELECT COUNT(*) FROM synthetic_actions_log sl
            JOIN users u ON u.id = sl.user_id WHERE u.is_synthetic = true)::text AS log_rows
      `);
      const row = (
        r as unknown as Array<{
          users: string;
          transactions: string;
          entries: string;
          log_rows: string;
        }>
      )[0];
      return {
        users: Number(row?.users ?? 0),
        transactions: Number(row?.transactions ?? 0),
        entries: Number(row?.entries ?? 0),
        logRows: Number(row?.log_rows ?? 0),
      };
    },

    async wipe(): Promise<WipeResult> {
      return db.transaction(async (tx) => {
        // Capture counts BEFORE deletion so the result reflects what was
        // actually purged (post-delete COUNT(*)=0 is uninformative).
        const before = await tx.execute<{
          users: string;
          transactions: string;
          entries: string;
          log_rows: string;
        }>(sql`
          SELECT
            (SELECT COUNT(*) FROM users WHERE is_synthetic = true)::text AS users,
            (SELECT COUNT(*) FROM transactions t
              JOIN users u ON u.id = t.user_id WHERE u.is_synthetic = true)::text AS transactions,
            (SELECT COUNT(*) FROM entries e
              JOIN users u ON u.id = e.user_id WHERE u.is_synthetic = true)::text AS entries,
            (SELECT COUNT(*) FROM synthetic_actions_log sl
              JOIN users u ON u.id = sl.user_id WHERE u.is_synthetic = true)::text AS log_rows
        `);
        const counts = (
          before as unknown as Array<{
            users: string;
            transactions: string;
            entries: string;
            log_rows: string;
          }>
        )[0];

        // Dependency order: tables with FK → users come first.
        // synthetic_actions_log CASCADEs from users, but we delete it
        // explicitly so the count is deterministic regardless of trigger
        // ordering and the FK behaviour can change without breaking us.
        await tx.execute(sql`
          DELETE FROM synthetic_actions_log
          WHERE user_id IN (SELECT id FROM users WHERE is_synthetic = true);
        `);
        await tx.execute(sql`
          DELETE FROM bot_dm_queue
          WHERE user_id IN (SELECT id FROM users WHERE is_synthetic = true);
        `);
        await tx.execute(sql`
          DELETE FROM friendships
          WHERE user_a_id IN (SELECT id FROM users WHERE is_synthetic = true)
             OR user_b_id IN (SELECT id FROM users WHERE is_synthetic = true);
        `);
        await tx.execute(sql`
          DELETE FROM xp_events
          WHERE user_id IN (SELECT id FROM users WHERE is_synthetic = true);
        `);
        await tx.execute(sql`
          DELETE FROM referral_payouts
          WHERE recruiter_user_id IN (SELECT id FROM users WHERE is_synthetic = true)
             OR recruit_user_id   IN (SELECT id FROM users WHERE is_synthetic = true)
             OR created_by_user_id IN (SELECT id FROM users WHERE is_synthetic = true);
        `);
        await tx.execute(sql`
          DELETE FROM referral_signup_bonuses
          WHERE user_id        IN (SELECT id FROM users WHERE is_synthetic = true)
             OR source_user_id IN (SELECT id FROM users WHERE is_synthetic = true);
        `);
        // entries.user_id is ON DELETE SET NULL — but synthetic entries
        // themselves should disappear, otherwise leaderboard counts stay
        // inflated. Delete by JOIN.
        await tx.execute(sql`
          DELETE FROM entries
          WHERE user_id IN (SELECT id FROM users WHERE is_synthetic = true);
        `);
        await tx.execute(sql`
          DELETE FROM transactions
          WHERE user_id IN (SELECT id FROM users WHERE is_synthetic = true);
        `);
        await tx.execute(sql`
          DELETE FROM balances
          WHERE user_id IN (SELECT id FROM users WHERE is_synthetic = true);
        `);
        // contests.created_by_user_id is ON DELETE SET NULL — Postgres
        // handles it automatically when the user goes.
        await tx.execute(sql`DELETE FROM users WHERE is_synthetic = true;`);

        // Post-condition: count must be exactly zero. If it isn't, the
        // outer transaction will roll back and the operator sees the
        // assertion error.
        const after = await tx.execute<{ n: string }>(sql`
          SELECT COUNT(*)::text AS n FROM users WHERE is_synthetic = true
        `);
        const remaining = Number((after as unknown as Array<{ n: string }>)[0]?.n ?? 0);
        if (remaining !== 0) {
          throw new Error(`wipe: ${remaining} synthetic users remain after delete`);
        }

        return {
          deletedUsers: Number(counts?.users ?? 0),
          deletedTransactions: Number(counts?.transactions ?? 0),
          deletedEntries: Number(counts?.entries ?? 0),
          deletedLogRows: Number(counts?.log_rows ?? 0),
          dryRun: false,
        };
      });
    },
  };
}
