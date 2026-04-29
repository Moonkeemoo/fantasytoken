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
  /** Find still-locked signup bonus rows for this user (REFEREE + maybe RECRUITER). */
  findLockedSignupBonuses(userId: string): Promise<
    Array<{
      id: string;
      recipientUserId: string;
      bonusType: 'REFEREE' | 'RECRUITER';
      amountCents: bigint;
    }>
  >;
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
}

export interface ReferralsServiceDeps {
  repo: ReferralsRepo;
  currency: CurrencyService;
  log: Logger;
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
            if (r.paid) paidLevels += 1;
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
