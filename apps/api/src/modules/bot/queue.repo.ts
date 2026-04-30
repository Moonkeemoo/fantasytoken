import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { botDmQueue, entries, users } from '../../db/schema/index.js';
import type { DmPayload, DmQueueRepo } from './queue.service.js';

/** Per-recipient cap from REFERRAL_SYSTEM.md §11.2: 1 DM per hour. */
const PER_RECIPIENT_DEBOUNCE = sql`'1 hour'::interval`;

export function createDmQueueRepo(db: Database): DmQueueRepo {
  return {
    async enqueue({ recipientUserId, payload, floorSeconds, respectHourlyDebounce }) {
      // scheduled_at = NOW + floorSeconds, optionally clamped to
      // last_dm_sent_at + 1h. Commissions opt into the hourly cap to
      // collapse a burst of 50 friend-wins into one summary DM. Per-
      // user-action events (contest_finalized / cancelled / referral
      // unlock) skip the cap so an unrelated commission DM doesn't
      // delay the contest-result DM by an hour.
      const debouncedSql = respectHourlyDebounce
        ? sql`GREATEST(
            NOW() + (${floorSeconds} || ' seconds')::interval,
            COALESCE(u.last_dm_sent_at, NOW()) + ${PER_RECIPIENT_DEBOUNCE}
          )`
        : sql`NOW() + (${floorSeconds} || ' seconds')::interval`;
      const result = await db.execute<{ id: string }>(sql`
        INSERT INTO ${botDmQueue} (recipient_user_id, payload, scheduled_at)
        SELECT
          ${recipientUserId},
          ${sql.raw(`'${JSON.stringify(payload).replace(/'/g, "''")}'::jsonb`)},
          ${debouncedSql}
        FROM ${users} u WHERE u.id = ${recipientUserId}
        RETURNING id
      `);
      const rows = result as unknown as Array<{ id: string }>;
      if (rows.length === 0) throw new Error('dmQueue.enqueue: recipient not found');
      return { id: rows[0]!.id };
    },

    async fetchReady(cap) {
      // Pull rows ready to send and join recipient's TG id in a single round-
      // trip. Order by scheduled_at so older items go first.
      const rows = await db.execute<{
        id: string;
        recipient_user_id: string;
        recipient_telegram_id: string; // bigint comes back as string from postgres-js
        payload: DmPayload;
        attempts: number;
      }>(sql`
        SELECT
          q.id, q.recipient_user_id, q.payload, q.attempts,
          u.telegram_id::text AS recipient_telegram_id
        FROM ${botDmQueue} q
        JOIN ${users} u ON u.id = q.recipient_user_id
        WHERE q.sent_at IS NULL AND q.scheduled_at <= NOW()
        ORDER BY q.scheduled_at ASC
        LIMIT ${cap * 10}
      `);

      // Group by recipient. We pulled cap*10 rows so a single recipient with a
      // backlog still gets all their pending events aggregated; we then trim
      // back to `cap` recipients so a flood doesn't starve other crons.
      const groups = new Map<
        string,
        {
          recipientUserId: string;
          recipientTelegramId: number;
          rows: Array<{ id: string; payload: DmPayload; attempts: number }>;
        }
      >();
      const list = rows as unknown as Array<{
        id: string;
        recipient_user_id: string;
        recipient_telegram_id: string;
        payload: DmPayload;
        attempts: number;
      }>;
      for (const r of list) {
        let g = groups.get(r.recipient_user_id);
        if (!g) {
          if (groups.size >= cap) continue;
          g = {
            recipientUserId: r.recipient_user_id,
            recipientTelegramId: Number(r.recipient_telegram_id),
            rows: [],
          };
          groups.set(r.recipient_user_id, g);
        }
        g.rows.push({ id: r.id, payload: r.payload, attempts: r.attempts });
      }
      return [...groups.values()];
    },

    async findViewedEntryIds(entryIds) {
      if (entryIds.length === 0) return new Set();
      const rows = await db
        .select({ id: entries.id })
        .from(entries)
        .where(and(inArray(entries.id, entryIds), isNotNull(entries.resultViewedAt)));
      return new Set(rows.map((r) => r.id));
    },

    async markSent(rowIds, errorMessage) {
      if (rowIds.length === 0) return;
      await db
        .update(botDmQueue)
        .set({ sentAt: sql`NOW()`, errorMessage })
        .where(inArray(botDmQueue.id, rowIds));
    },

    async bumpAttempts(rowIds, errorMessage) {
      if (rowIds.length === 0) return;
      // Push scheduled_at by 1 minute on each retry so a transient failure
      // doesn't busy-loop the cron.
      await db
        .update(botDmQueue)
        .set({
          attempts: sql`${botDmQueue.attempts} + 1`,
          scheduledAt: sql`NOW() + INTERVAL '1 minute'`,
          errorMessage,
        })
        .where(inArray(botDmQueue.id, rowIds));
    },

    async touchLastDmSent(userId) {
      await db
        .update(users)
        .set({ lastDmSentAt: sql`NOW()` })
        .where(eq(users.id, userId));
    },
  };
}
