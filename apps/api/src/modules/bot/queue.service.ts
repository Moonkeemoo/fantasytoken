import type { Logger } from '../../logger.js';
import type { BotInstance } from './bot.js';
import {
  formatCommissionDM,
  formatContestFinalizedDM,
  type CommissionEvent,
  type ContestFinalizedEvent,
} from './notifications.js';

/** Discriminated union of payloads stored on bot_dm_queue.payload (jsonb). */
export type DmPayload =
  | { kind: 'commission'; event: CommissionEvent }
  | { kind: 'contest_finalized'; event: ContestFinalizedEvent };

export interface DmQueueRepo {
  /** Insert a row with `scheduled_at = max(now + floorSeconds, lastDmSent + 1h)`.
   * `floorSeconds` is the immediate-grouping window (commissions: 60s; contest
   * finalized: 300s, giving the user time to come back on their own). */
  enqueue(args: {
    recipientUserId: string;
    payload: DmPayload;
    floorSeconds: number;
  }): Promise<{ id: string }>;
  /** Fetch ready rows grouped by recipient. Returns at most `cap` recipients
   * per call so a backlog doesn't starve other crons. */
  fetchReady(cap: number): Promise<
    Array<{
      recipientUserId: string;
      recipientTelegramId: number;
      rows: Array<{ id: string; payload: DmPayload; attempts: number }>;
    }>
  >;
  /** Returns the subset of `entryIds` that already have entries.result_viewed_at
   * set — those rows should be marked sent without actually delivering a DM. */
  findViewedEntryIds(entryIds: string[]): Promise<Set<string>>;
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
  enqueueContestFinalized(args: {
    recipientUserId: string;
    event: ContestFinalizedEvent;
  }): Promise<void>;
  /** Cron entry-point. Called from server.ts every minute. */
  drain(): Promise<{ sentCount: number; failedCount: number; skippedCount: number }>;
}

/** Floor for commission rows — small grouping window. */
const COMMISSION_FLOOR_SECONDS = 60;
/** Floor for contest-finalized rows — 5 min grace window for the user to open
 * the app on their own. If they view the result during this window, the drain
 * skips the DM (covered by findViewedEntryIds). */
const CONTEST_FINALIZED_FLOOR_SECONDS = 5 * 60;

export function createDmQueueService(deps: DmQueueServiceDeps): DmQueueService {
  const maxAttempts = deps.maxAttempts ?? 3;
  const perTickCap = deps.perTickCap ?? 50;
  return {
    async enqueueCommission({ recipientUserId, event }) {
      try {
        await deps.repo.enqueue({
          recipientUserId,
          payload: { kind: 'commission', event },
          floorSeconds: COMMISSION_FLOOR_SECONDS,
        });
      } catch (err) {
        // INV-7: log and swallow — DM enqueue failure must not bubble into
        // the prize-payout flow.
        deps.log.warn({ err, recipientUserId }, 'dm.enqueueCommission failed');
      }
    },
    async enqueueContestFinalized({ recipientUserId, event }) {
      try {
        await deps.repo.enqueue({
          recipientUserId,
          payload: { kind: 'contest_finalized', event },
          floorSeconds: CONTEST_FINALIZED_FLOOR_SECONDS,
        });
      } catch (err) {
        deps.log.warn(
          { err, recipientUserId, contestId: event.contestId },
          'dm.enqueueContestFinalized failed',
        );
      }
    },
    async drain() {
      let sentCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      const ready = await deps.repo.fetchReady(perTickCap);

      // Skip-if-viewed: collapse all contest_finalized rows across all groups
      // into one bulk lookup so we don't fan out N queries for a queue burst.
      const finalizedEntryIds = ready.flatMap((g) =>
        g.rows
          .filter((r) => r.payload.kind === 'contest_finalized')
          .map((r) => (r.payload as { event: ContestFinalizedEvent }).event.entryId),
      );
      const viewedEntryIds =
        finalizedEntryIds.length > 0
          ? await deps.repo.findViewedEntryIds(finalizedEntryIds)
          : new Set<string>();

      for (const group of ready) {
        // Partition into kinds; skip any contest_finalized row whose entry was
        // already viewed (user came back on their own — DM would be redundant).
        const commissionEvents: CommissionEvent[] = [];
        const finalizedEvents: ContestFinalizedEvent[] = [];
        const skipIds: string[] = [];
        const sendIds: string[] = [];
        for (const r of group.rows) {
          if (r.payload.kind === 'commission') {
            commissionEvents.push(r.payload.event);
            sendIds.push(r.id);
          } else {
            const ev = r.payload.event;
            if (viewedEntryIds.has(ev.entryId)) {
              skipIds.push(r.id);
            } else {
              finalizedEvents.push(ev);
              sendIds.push(r.id);
            }
          }
        }

        if (skipIds.length > 0) {
          await deps.repo.markSent(skipIds, 'skipped: result already viewed');
          skippedCount += skipIds.length;
        }
        if (sendIds.length === 0) continue;

        try {
          // Two separate sends so each kind can use its own copy. Per the
          // per-recipient debounce both fire in the same drain tick only if
          // last_dm_sent_at allows; in practice this happens only when both
          // kinds got enqueued in the same window for a user who hadn't
          // received a DM in the prior hour.
          if (commissionEvents.length > 0) {
            const text = formatCommissionDM(commissionEvents);
            await deps.bot.api.sendMessage(group.recipientTelegramId, text, {
              parse_mode: 'MarkdownV2',
            });
          }
          if (finalizedEvents.length > 0) {
            const text = formatContestFinalizedDM(finalizedEvents);
            await deps.bot.api.sendMessage(group.recipientTelegramId, text, {
              parse_mode: 'MarkdownV2',
            });
          }
          await deps.repo.markSent(sendIds, null);
          await deps.repo.touchLastDmSent(group.recipientUserId);
          sentCount += sendIds.length;
        } catch (err) {
          // grammY HTTP error from TG — could be transient (rate-limit) or
          // terminal (chat not found, bot blocked). Past maxAttempts we mark
          // sent with error_message so a permanently-blocked user doesn't
          // poison the queue forever.
          const message = err instanceof Error ? err.message : String(err);
          const wouldHitMax = group.rows.some((r) => r.attempts + 1 >= maxAttempts);
          if (wouldHitMax) {
            await deps.repo.markSent(sendIds, message);
            failedCount += sendIds.length;
            deps.log.warn(
              { err, recipientUserId: group.recipientUserId, ids: sendIds },
              'dm.drain terminal failure',
            );
          } else {
            await deps.repo.bumpAttempts(sendIds, message);
            failedCount += sendIds.length;
            deps.log.warn(
              { err, recipientUserId: group.recipientUserId, ids: sendIds },
              'dm.drain transient failure (will retry)',
            );
          }
        }
      }
      return { sentCount, failedCount, skippedCount };
    },
  };
}
