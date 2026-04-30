import {
  computeCommission,
  MAX_REFERRAL_DEPTH,
  REFEREE_SIGNUP_BONUS_CENTS,
  RECRUITER_SIGNUP_BONUS_CENTS,
  REQUIRED_CONTESTS_FOR_BONUS,
  type ReferralCurrency,
} from '@fantasytoken/shared';
import type { Logger } from '../../logger.js';
import type { CurrencyService } from '../currency/currency.service.js';
import type { DmQueueService } from '../bot/queue.service.js';
import type { RealtimeHub } from '../realtime/hub.js';

export interface ReferralChainLink {
  /** 1 = direct inviter, 2 = inviter's inviter. */
  level: 1 | 2;
  userId: string;
}

export interface PreCreateSignupBonusesArgs {
  /** The newly attributed referee. */
  refereeUserId: string;
  /** The recruiter (referee's L1 inviter). */
  recruiterUserId: string;
}

export interface PayCommissionsArgs {
  /** Entry that produced the prize (winner). */
  sourceEntryId: string;
  /** The winner. */
  sourceUserId: string;
  sourceContestId: string;
  /** Winner's gross prize in source contest currency. */
  sourcePrizeCents: bigint;
  currency: ReferralCurrency;
}

export interface ReferralsRepo {
  /** Walk up the referrer chain from `userId`, return at most MAX_REFERRAL_DEPTH links. */
  getReferralChain(userId: string, depth: number): Promise<ReferralChainLink[]>;
  /** Count finalized entries for a user (used for bonus unlock threshold). */
  countFinalizedEntries(userId: string): Promise<number>;
  /** Inserts REFEREE + RECRUITER rows with unlocked_at = NULL.
   *  Idempotent via the unique partial index on (user_id, bonus_type, source_user_id). */
  preCreateSignupBonuses(args: PreCreateSignupBonusesArgs): Promise<void>;
  /** Insert one referral_payouts row + credit recipient via CurrencyService.
   *  Idempotent via unique index on (recipient_user_id, source_entry_id, level) —
   *  re-running finalize never double-pays. Returns false if already paid. */
  payOneCommission(args: {
    recipientUserId: string;
    sourceUserId: string;
    sourceContestId: string;
    sourceEntryId: string;
    level: 1 | 2;
    pctBps: number;
    sourcePrizeCents: bigint;
    payoutCents: bigint;
    currency: ReferralCurrency;
  }): Promise<{ paid: boolean }>;
  /** Find still-locked signup bonus rows for this user (REFEREE + maybe RECRUITER).
   *  `sourceUserId` is the referee whose play triggered the row (RECRUITER
   *  side); NULL for the REFEREE row (recipient IS the referee). */
  findLockedSignupBonuses(userId: string): Promise<
    Array<{
      id: string;
      recipientUserId: string;
      bonusType: 'REFEREE' | 'RECRUITER';
      amountCents: bigint;
      sourceUserId: string | null;
    }>
  >;
  /** Look up the friend's first_name for the unlock DM/toast copy. */
  lookupFirstName(userId: string): Promise<string | null>;
  /** Mark row unlocked + record triggering entry. */
  markBonusUnlocked(args: {
    bonusRowId: string;
    triggeredByEntryId: string;
    transactionId: string;
  }): Promise<void>;

  /** Aggregate stats for /me/referrals. All counts/sums in one round-trip. */
  getStats(userId: string): Promise<{
    l1Count: number;
    l2Count: number;
    l1ActiveCount: number;
    l2ActiveCount: number;
    l1EarnedCents: bigint;
    l2EarnedCents: bigint;
  }>;

  /** Two arrays for /me/referrals/tree — referees + their referees, with
   * derived per-friend stats (joined contests, contributed commission). */
  getTree(userId: string): Promise<{
    l1: Array<{
      userId: string;
      firstName: string | null;
      photoUrl: string | null;
      joinedAt: Date;
      hasPlayed: boolean;
      contestsPlayed: number;
      totalContributedCents: bigint;
    }>;
    l2: Array<{
      userId: string;
      firstName: string | null;
      photoUrl: string | null;
      joinedAt: Date;
      hasPlayed: boolean;
      contestsPlayed: number;
      totalContributedCents: bigint;
      viaUserId: string;
    }>;
  }>;

  /** Recent commission payouts for the caller, newest first. */
  getPayouts(
    userId: string,
    limit: number,
  ): Promise<
    Array<{
      id: string;
      level: 1 | 2;
      payoutCents: bigint;
      sourcePrizeCents: bigint;
      currencyCode: string;
      sourceFirstName: string | null;
      contestName: string | null;
      createdAt: Date;
    }>
  >;

  /** Single-row lookup used to enrich the commission DM payload — winner's
   * first name + contest name in one round-trip. */
  lookupCommissionDmContext(args: {
    sourceUserId: string;
    sourceContestId: string;
  }): Promise<{ sourceFirstName: string | null; contestName: string | null }>;

  /** Global / friends-scoped leaderboard of top recruiters by total earned. */
  getLeaderboard(args: {
    callerUserId: string;
    scope: 'global' | 'friends';
    friendIds: string[];
    limit: number;
  }): Promise<{
    items: Array<{
      rank: number;
      userId: string;
      firstName: string | null;
      photoUrl: string | null;
      totalEarnedCents: bigint;
      l1Count: number;
    }>;
    myRow: {
      rank: number;
      userId: string;
      firstName: string | null;
      photoUrl: string | null;
      totalEarnedCents: bigint;
      l1Count: number;
    } | null;
  }>;

  /** Drill-in: one friend's profile + per-level contribution + their recent
   * payouts (capped). Returns null if the requested friend isn't actually in
   * the caller's referral chain (anti-snoop). */
  getFriendDetail(args: {
    callerUserId: string;
    friendUserId: string;
    payoutsLimit: number;
  }): Promise<{
    userId: string;
    firstName: string | null;
    photoUrl: string | null;
    joinedAt: Date;
    contestsPlayed: number;
    totalContributedCents: bigint;
    l1ContributedCents: bigint;
    l2ContributedCents: bigint;
    recentPayouts: Array<{
      id: string;
      level: 1 | 2;
      payoutCents: bigint;
      sourcePrizeCents: bigint;
      currencyCode: string;
      sourceFirstName: string | null;
      contestName: string | null;
      createdAt: Date;
    }>;
  } | null>;
}

export interface ReferralsServiceDeps {
  repo: ReferralsRepo;
  currency: CurrencyService;
  log: Logger;
  /** Optional — when present, payCommissions enqueues a TG bot DM after each
   * successful credit. Tests pass undefined; the in-app toast still works. */
  dmQueue?: DmQueueService;
  /** Optional — when present, payCommissions also pushes a realtime event so
   * the FE in-app toast shows in <1s instead of waiting for 30s polling. */
  realtimeHub?: RealtimeHub;
  /** Mini-app deep-link base, used by signup-unlock DMs to point the user
   * back into the app. Same env var as the contest-finalized DM uses. */
  miniAppUrl?: string;
}

export interface ReferralsService {
  /** Called from upsertOnAuth when a new user lands via ref-link. Pre-creates
   * the two mutual signup bonus rows (locked). */
  preCreateSignupBonuses(args: PreCreateSignupBonusesArgs): Promise<void>;

  /** Called from contests.finalize for each prize-winning entry. Walks the
   * referrer chain (≤ MAX_REFERRAL_DEPTH) and credits each level. INV-7:
   * failures are logged but never bubble — payout to the winner already
   * happened in the outer flow and ref commissions are best-effort sidecar. */
  payCommissions(args: PayCommissionsArgs): Promise<{ paidLevels: number }>;

  /** Called from contests.finalize for each real entry (winning or not). If the
   * user has now hit REQUIRED_CONTESTS_FOR_BONUS finalized contests, unlock and
   * credit any REFEREE + RECRUITER bonuses sitting in `referral_signup_bonuses`. */
  maybeUnlockSignupBonuses(args: {
    userId: string;
    triggeredByEntryId: string;
  }): Promise<{ unlockedCount: number }>;

  /** Read methods backing /me/referrals* routes. All pass-through to repo for
   * now; live in the service so the route layer can stay zero-business-logic. */
  getStats(userId: string): ReturnType<ReferralsRepo['getStats']>;
  getTree(userId: string): ReturnType<ReferralsRepo['getTree']>;
  getPayouts(userId: string, limit: number): ReturnType<ReferralsRepo['getPayouts']>;
  getFriendDetail(args: {
    callerUserId: string;
    friendUserId: string;
    payoutsLimit: number;
  }): ReturnType<ReferralsRepo['getFriendDetail']>;
  getLeaderboard(args: {
    callerUserId: string;
    scope: 'global' | 'friends';
    friendIds: string[];
    limit: number;
  }): ReturnType<ReferralsRepo['getLeaderboard']>;
}

export function createReferralsService(deps: ReferralsServiceDeps): ReferralsService {
  return {
    async preCreateSignupBonuses(args) {
      try {
        await deps.repo.preCreateSignupBonuses(args);
      } catch (err) {
        // Idempotent insert; unique-violation on rerun is fine, log others.
        deps.log.warn(
          { err, refereeUserId: args.refereeUserId, recruiterUserId: args.recruiterUserId },
          'referrals.preCreateSignupBonuses failed (non-blocking)',
        );
      }
    },

    async payCommissions(args) {
      let paidLevels = 0;
      let dmContext: { sourceFirstName: string | null; contestName: string | null } | null = null;
      try {
        const chain = await deps.repo.getReferralChain(args.sourceUserId, MAX_REFERRAL_DEPTH);
        for (const link of chain) {
          const calc = computeCommission(
            { prizeCents: args.sourcePrizeCents, currency: args.currency },
            link.level,
          );
          if (calc.payoutCents <= 0n) continue;
          try {
            const r = await deps.repo.payOneCommission({
              recipientUserId: link.userId,
              sourceUserId: args.sourceUserId,
              sourceContestId: args.sourceContestId,
              sourceEntryId: args.sourceEntryId,
              level: link.level,
              pctBps: calc.pctBps,
              sourcePrizeCents: args.sourcePrizeCents,
              payoutCents: calc.payoutCents,
              currency: args.currency,
            });
            if (r.paid) {
              paidLevels += 1;
              if (deps.dmQueue) {
                // Lazy lookup — only when at least one level actually paid AND
                // we have a queue to enqueue into. Cached across levels.
                if (dmContext === null) {
                  dmContext = await deps.repo.lookupCommissionDmContext({
                    sourceUserId: args.sourceUserId,
                    sourceContestId: args.sourceContestId,
                  });
                }
                await deps.dmQueue.enqueueCommission({
                  recipientUserId: link.userId,
                  event: {
                    sourceFirstName: dmContext.sourceFirstName,
                    sourcePrizeCents: Number(args.sourcePrizeCents),
                    payoutCents: Number(calc.payoutCents),
                    level: link.level,
                    contestName: dmContext.contestName,
                    currency: args.currency,
                    // The DM's "Open app" button takes the user back into
                    // the mini-app — t.me deep-link by default so the
                    // referrals view loads inside Telegram.
                    appUrl: deps.miniAppUrl ?? 'https://t.me/fantasytokenbot/fantasytoken',
                  },
                });
              }
              // Realtime push for the in-app toast — best-effort, no-op if no
              // hub configured (test env) or recipient offline.
              if (deps.realtimeHub) {
                if (dmContext === null) {
                  dmContext = await deps.repo.lookupCommissionDmContext({
                    sourceUserId: args.sourceUserId,
                    sourceContestId: args.sourceContestId,
                  });
                }
                deps.realtimeHub.publish(link.userId, {
                  kind: 'commission',
                  payoutCents: Number(calc.payoutCents),
                  sourcePrizeCents: Number(args.sourcePrizeCents),
                  sourceFirstName: dmContext.sourceFirstName,
                  contestName: dmContext.contestName,
                  level: link.level,
                  currencyCode: args.currency,
                });
              }
            }
          } catch (err) {
            // INV-7: a single-level failure must not stop us paying the other level.
            deps.log.error(
              {
                err,
                recipientUserId: link.userId,
                sourceEntryId: args.sourceEntryId,
                level: link.level,
              },
              'referrals.payCommission level failed',
            );
          }
        }
      } catch (err) {
        deps.log.error(
          { err, sourceEntryId: args.sourceEntryId },
          'referrals.payCommissions chain walk failed',
        );
      }
      return { paidLevels };
    },

    async getStats(userId) {
      return deps.repo.getStats(userId);
    },
    async getTree(userId) {
      return deps.repo.getTree(userId);
    },
    async getPayouts(userId, limit) {
      return deps.repo.getPayouts(userId, limit);
    },
    async getFriendDetail(args) {
      return deps.repo.getFriendDetail(args);
    },
    async getLeaderboard(args) {
      return deps.repo.getLeaderboard(args);
    },
    async maybeUnlockSignupBonuses({ userId, triggeredByEntryId }) {
      let unlockedCount = 0;
      try {
        // The current finalized count INCLUDES the triggering entry (it was
        // finalized in the same transaction-block before this is called).
        const finalizedCount = await deps.repo.countFinalizedEntries(userId);
        if (finalizedCount < REQUIRED_CONTESTS_FOR_BONUS) return { unlockedCount };

        const locked = await deps.repo.findLockedSignupBonuses(userId);
        for (const row of locked) {
          try {
            const expectedAmount =
              row.bonusType === 'REFEREE'
                ? BigInt(REFEREE_SIGNUP_BONUS_CENTS)
                : BigInt(RECRUITER_SIGNUP_BONUS_CENTS);
            // Sanity guard: stale row with a non-canonical amount should not silently
            // mint a different number of cents — fall back to the row's stored amount.
            const credit = row.amountCents > 0n ? row.amountCents : expectedAmount;
            const tx = await deps.currency.transact({
              userId: row.recipientUserId,
              deltaCents: credit,
              type: row.bonusType === 'REFEREE' ? 'REFEREE_SIGNUP_BONUS' : 'RECRUITER_SIGNUP_BONUS',
              refType: 'entry',
              refId: triggeredByEntryId,
            });
            await deps.repo.markBonusUnlocked({
              bonusRowId: row.id,
              triggeredByEntryId,
              transactionId: tx.txId,
            });
            unlockedCount += 1;

            // Bot DM + realtime toast — best-effort, INV-7 guards inside
            // each subsystem. Failures here must NOT block the next row.
            // RECRUITER copy names the friend (sourceUserId on the row);
            // REFEREE copy congratulates the new user themselves.
            try {
              const sourceFirstName =
                row.bonusType === 'RECRUITER' && row.sourceUserId
                  ? await deps.repo.lookupFirstName(row.sourceUserId)
                  : null;
              if (deps.dmQueue && deps.miniAppUrl) {
                await deps.dmQueue.enqueueReferralUnlock({
                  recipientUserId: row.recipientUserId,
                  event: {
                    bonusType: row.bonusType,
                    amountCents: Number(credit),
                    sourceFirstName,
                    appUrl: deps.miniAppUrl,
                  },
                });
              }
              if (deps.realtimeHub) {
                deps.realtimeHub.publish(row.recipientUserId, {
                  kind: 'referral_unlock',
                  bonusType: row.bonusType,
                  amountCents: Number(credit),
                  sourceFirstName,
                });
              }
            } catch (notifyErr) {
              deps.log.warn(
                { err: notifyErr, bonusRowId: row.id },
                'referrals.maybeUnlockSignupBonuses notify failed',
              );
            }
          } catch (err) {
            deps.log.error(
              { err, bonusRowId: row.id, recipientUserId: row.recipientUserId },
              'referrals.maybeUnlockSignupBonuses single row failed',
            );
          }
        }
      } catch (err) {
        deps.log.error({ err, userId }, 'referrals.maybeUnlockSignupBonuses failed');
      }
      return { unlockedCount };
    },
  };
}
