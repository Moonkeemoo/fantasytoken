import type { Logger } from '../../logger.js';
import type { BotInstance } from './bot.js';
import { formatCommissionDM, type CommissionEvent } from './notifications.js';

/** What producer-side enqueueCommission writes into the payload jsonb. */
export interface CommissionDmPayload {
  kind: 'commission';
  event: CommissionEvent;
}

export interface DmQueueRepo {
  /** Pre-compute the next allowed scheduled_at for this recipient (max of
   * now+1min and lastDmSent+1h) and insert. Returns the row id. */
  enqueueCommission(args: {
    recipientUserId: string;
    payload: CommissionDmPayload;
  }): Promise<{ id: string }>;
  /** Fetch ready rows grouped by recipient. Returns at most `cap` recipients
   * per call so a backlog doesn't starve other crons. */
  fetchReady(cap: number): Promise<
    Array<{
      recipientUserId: string;
      recipientTelegramId: number;
      rows: Array<{ id: string; payload: CommissionDmPayload; attempts: number }>;
    }>
  >;
  /** Mark rows as terminally processed (sent or permanently failed). */
  markSent(rowIds: string[], errorMessage: string | null): Promise<void>;
  /** On send failure: bump attempts; cron retries on next tick. */
  bumpAttempts(rowIds: string[], errorMessage: string): Promise<void>;
  /** Update users.last_dm_sent_at for the per-recipient cap. */
  touchLastDmSent(userId: string): Promise<void>;
}

export interface DmQueueServiceDeps {
  repo: DmQueueRepo;
  bot: BotInstance;
  log: Logger;
  /** Soft cap on attempts — past this we mark sent with an error_message so a
   * permanently-blocked user (never /start-ed the bot) doesn't poison the queue. */
  maxAttempts?: number;
  /** How many recipients to drain per tick. Generous default; tune if it ever
   * shows up in profiling. */
  perTickCap?: number;
}

export interface DmQueueService {
  enqueueCommission(args: { recipientUserId: string; event: CommissionEvent }): Promise<void>;
  /** Cron entry-point. Called from server.ts every minute. */
  drain(): Promise<{ sentCount: number; failedCount: number }>;
}

export function createDmQueueService(deps: DmQueueServiceDeps): DmQueueService {
  const maxAttempts = deps.maxAttempts ?? 3;
  const perTickCap = deps.perTickCap ?? 50;
  return {
    async enqueueCommission({ recipientUserId, event }) {
      try {
        await deps.repo.enqueueCommission({
          recipientUserId,
          payload: { kind: 'commission', event },
        });
      } catch (err) {
        // INV-7: log and swallow — DM enqueue failure must not bubble into
        // the prize-payout flow.
        deps.log.warn({ err, recipientUserId }, 'dm.enqueueCommission failed');
      }
    },
    async drain() {
      let sentCount = 0;
      let failedCount = 0;
      const ready = await deps.repo.fetchReady(perTickCap);
      for (const group of ready) {
        const events = group.rows.map((r) => r.payload.event);
        const ids = group.rows.map((r) => r.id);
        try {
          const text = formatCommissionDM(events);
          await deps.bot.api.sendMessage(group.recipientTelegramId, text, {
            parse_mode: 'MarkdownV2',
          });
          await deps.repo.markSent(ids, null);
          await deps.repo.touchLastDmSent(group.recipientUserId);
          sentCount += group.rows.length;
        } catch (err) {
          // grammY HTTP error from TG — could be transient (rate-limit) or
          // terminal (chat not found, bot blocked). Past maxAttempts we mark
          // sent with error_message so a permanently-blocked user doesn't
          // poison the queue forever. Losing ≤maxAttempts worth of notifications
          // for them is acceptable.
          const message = err instanceof Error ? err.message : String(err);
          const wouldHitMax = group.rows.some((r) => r.attempts + 1 >= maxAttempts);
          if (wouldHitMax) {
            await deps.repo.markSent(ids, message);
            failedCount += group.rows.length;
            deps.log.warn(
              { err, recipientUserId: group.recipientUserId, ids },
              'dm.drain terminal failure',
            );
          } else {
            await deps.repo.bumpAttempts(ids, message);
            failedCount += group.rows.length;
            deps.log.warn(
              { err, recipientUserId: group.recipientUserId, ids },
              'dm.drain transient failure (will retry)',
            );
          }
        }
      }
      return { sentCount, failedCount };
    },
  };
}
