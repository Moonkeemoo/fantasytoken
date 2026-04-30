import type { Logger } from '../../logger.js';
import type { BotInstance } from './bot.js';
import {
  formatCommissionDM,
  formatContestCancelledDM,
  formatContestFinalizedDM,
  formatReferralUnlockDM,
  type CommissionEvent,
  type ContestCancelledEvent,
  type ContestFinalizedEvent,
  type ReferralUnlockEvent,
} from './notifications.js';

/** Discriminated union of payloads stored on bot_dm_queue.payload (jsonb). */
export type DmPayload =
  | { kind: 'commission'; event: CommissionEvent }
  | { kind: 'contest_finalized'; event: ContestFinalizedEvent }
  | { kind: 'contest_cancelled'; event: ContestCancelledEvent }
  | { kind: 'referral_unlock'; event: ReferralUnlockEvent };

export interface DmQueueRepo {
  /** Insert a row with `scheduled_at = max(now + floorSeconds, [hourly cap])`.
   * `floorSeconds` is the immediate-grouping window. The hourly per-recipient
   * cap (last_dm_sent_at + 1h) is applied ONLY when `respectHourlyDebounce`
   * is true — used by commissions where 50 friends winning would otherwise
   * spam the user. Per-action events (contest_finalized / cancelled /
   * referral_unlock) skip the cap so a +\$0.09 commission DM doesn't delay
   * the unrelated "your contest finished" DM by 60 minutes. */
  enqueue(args: {
    recipientUserId: string;
    payload: DmPayload;
    floorSeconds: number;
    respectHourlyDebounce: boolean;
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
  enqueueContestCancelled(args: {
    recipientUserId: string;
    event: ContestCancelledEvent;
  }): Promise<void>;
  enqueueReferralUnlock(args: {
    recipientUserId: string;
    event: ReferralUnlockEvent;
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
/** Floor for cancellation rows — short. Refund already landed in their
 * balance, the DM is just informational; no benefit to delaying it. */
const CONTEST_CANCELLED_FLOOR_SECONDS = 60;
/** Floor for referral-unlock rows — short. Bonus already landed; we just
 * tell the user *why* they got the +$25 so it doesn't look mystery. */
const REFERRAL_UNLOCK_FLOOR_SECONDS = 60;

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
          // Anti-spam: 50 friends winning in a row collapses to one DM/hour.
          respectHourlyDebounce: true,
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
          // Naturally rate-limited (one per contest the user entered).
          respectHourlyDebounce: false,
        });
      } catch (err) {
        deps.log.warn(
          { err, recipientUserId, contestId: event.contestId },
          'dm.enqueueContestFinalized failed',
        );
      }
    },
    async enqueueContestCancelled({ recipientUserId, event }) {
      try {
        await deps.repo.enqueue({
          recipientUserId,
          payload: { kind: 'contest_cancelled', event },
          floorSeconds: CONTEST_CANCELLED_FLOOR_SECONDS,
          respectHourlyDebounce: false,
        });
      } catch (err) {
        deps.log.warn(
          { err, recipientUserId, contestId: event.contestId },
          'dm.enqueueContestCancelled failed',
        );
      }
    },
    async enqueueReferralUnlock({ recipientUserId, event }) {
      try {
        await deps.repo.enqueue({
          recipientUserId,
          payload: { kind: 'referral_unlock', event },
          floorSeconds: REFERRAL_UNLOCK_FLOOR_SECONDS,
          // One-per-friend-first-game; the +\$25 needs an explanation
          // even if a commission DM landed within the same hour.
          respectHourlyDebounce: false,
        });
      } catch (err) {
        deps.log.warn(
          { err, recipientUserId, bonusType: event.bonusType },
          'dm.enqueueReferralUnlock failed',
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
      // Best-effort lookup: if findViewedEntryIds errors (e.g. the
      // result_viewed_at column doesn't exist yet on a half-deployed
      // env), default to "nothing viewed" so DMs still go out — better
      // a redundant DM than a silent black hole that drops every
      // contest_finalized notification.
      let viewedEntryIds = new Set<string>();
      if (finalizedEntryIds.length > 0) {
        try {
          viewedEntryIds = await deps.repo.findViewedEntryIds(finalizedEntryIds);
        } catch (err) {
          deps.log.warn(
            { err, count: finalizedEntryIds.length },
            'dm.drain findViewedEntryIds failed — sending all queued contest_finalized rows',
          );
        }
      }

      for (const group of ready) {
        // Partition into kinds; skip any contest_finalized row whose entry was
        // already viewed (user came back on their own — DM would be redundant).
        // Other kinds are NOT skip-on-viewed: cancellation + unlock are pure
        // balance-change explainers and the user benefits from explicit
        // confirmation regardless of whether they opened the app.
        const commissionEvents: CommissionEvent[] = [];
        const finalizedEvents: ContestFinalizedEvent[] = [];
        const cancelledEvents: ContestCancelledEvent[] = [];
        const unlockEvents: ReferralUnlockEvent[] = [];
        const skipIds: string[] = [];
        const sendIds: string[] = [];
        for (const r of group.rows) {
          if (r.payload.kind === 'commission') {
            commissionEvents.push(r.payload.event);
            sendIds.push(r.id);
          } else if (r.payload.kind === 'contest_finalized') {
            const ev = r.payload.event;
            if (viewedEntryIds.has(ev.entryId)) {
              skipIds.push(r.id);
            } else {
              finalizedEvents.push(ev);
              sendIds.push(r.id);
            }
          } else if (r.payload.kind === 'contest_cancelled') {
            cancelledEvents.push(r.payload.event);
            sendIds.push(r.id);
          } else {
            // referral_unlock
            unlockEvents.push(r.payload.event);
            sendIds.push(r.id);
          }
        }

        if (skipIds.length > 0) {
          await deps.repo.markSent(skipIds, 'skipped: result already viewed');
          skippedCount += skipIds.length;
        }
        if (sendIds.length === 0) continue;

        try {
          // Separate sends per kind so each can use its own copy. Per the
          // per-recipient debounce all fire in the same drain tick only if
          // last_dm_sent_at allows; in practice this happens only when
          // multiple kinds got enqueued in the same window for a user who
          // hadn't received a DM in the prior hour.
          // Each format function returns { text, replyMarkup } — the
          // inline keyboard ensures the user sees a tappable "Open app"
          // CTA below every notification, not just an in-text link.
          if (commissionEvents.length > 0) {
            const msg = formatCommissionDM(commissionEvents);
            await deps.bot.api.sendMessage(group.recipientTelegramId, msg.text, {
              parse_mode: 'MarkdownV2',
              reply_markup: msg.replyMarkup,
            });
          }
          if (finalizedEvents.length > 0) {
            const msg = formatContestFinalizedDM(finalizedEvents);
            await deps.bot.api.sendMessage(group.recipientTelegramId, msg.text, {
              parse_mode: 'MarkdownV2',
              reply_markup: msg.replyMarkup,
            });
          }
          if (cancelledEvents.length > 0) {
            const msg = formatContestCancelledDM(cancelledEvents);
            await deps.bot.api.sendMessage(group.recipientTelegramId, msg.text, {
              parse_mode: 'MarkdownV2',
              reply_markup: msg.replyMarkup,
            });
          }
          if (unlockEvents.length > 0) {
            const msg = formatReferralUnlockDM(unlockEvents);
            await deps.bot.api.sendMessage(group.recipientTelegramId, msg.text, {
              parse_mode: 'MarkdownV2',
              reply_markup: msg.replyMarkup,
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
