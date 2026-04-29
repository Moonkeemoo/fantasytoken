import { eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { botDmQueue, users } from '../../db/schema/index.js';
import type { CommissionDmPayload, DmQueueRepo } from './queue.service.js';

/** Per-recipient cap from REFERRAL_SYSTEM.md §11.2: 1 DM per hour. */
const PER_RECIPIENT_DEBOUNCE = sql`'1 hour'::interval`;
/** Smallest debounce so a burst of commissions still groups within one tick. */
const MIN_DEBOUNCE = sql`'1 minute'::interval`;

export function createDmQueueRepo(db: Database): DmQueueRepo {
  return {
    async enqueueCommission({ recipientUserId, payload }) {
      // scheduled_at = max(NOW() + 1min, last_dm_sent_at + 1h). The 1-min floor
      // gives the queue a chance to coalesce a burst of commissions for the
      // same recipient into a single aggregated DM on the next cron tick.
      const result = await db.execute<{ id: string }>(sql`
        INSERT INTO ${botDmQueue} (recipient_user_id, payload, scheduled_at)
        SELECT
          ${recipientUserId},
          ${sql.raw(`'${JSON.stringify(payload).replace(/'/g, "''")}'::jsonb`)},
          GREATEST(
            NOW() + ${MIN_DEBOUNCE},
            COALESCE(u.last_dm_sent_at, NOW()) + ${PER_RECIPIENT_DEBOUNCE}
          )
        FROM ${users} u WHERE u.id = ${recipientUserId}
        RETURNING id
      `);
      const rows = result as unknown as Array<{ id: string }>;
      if (rows.length === 0) throw new Error('enqueueCommission: recipient not found');
      return { id: rows[0]!.id };
    },

    async fetchReady(cap) {
      // Pull rows ready to send and join recipient's TG id in a single round-
      // trip. Order by scheduled_at so older items go first.
      const rows = await db.execute<{
        id: string;
        recipient_user_id: string;
        recipient_telegram_id: string; // bigint comes back as string from postgres-js
        payload: CommissionDmPayload;
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
          rows: Array<{ id: string; payload: CommissionDmPayload; attempts: number }>;
        }
      >();
      const list = rows as unknown as Array<{
        id: string;
        recipient_user_id: string;
        recipient_telegram_id: string;
        payload: CommissionDmPayload;
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
