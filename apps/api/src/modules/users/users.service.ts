import { WELCOME_BONUS_COINS, WELCOME_EXPIRY_DAYS } from '@fantasytoken/shared';
import type { CurrencyService } from '../currency/currency.service.js';
import type { Logger } from '../../logger.js';

export interface UsersRepo {
  findByTelegramId(telegramId: number): Promise<{
    id: string;
    telegramId: number;
    createdAt: Date;
    tutorialDoneAt: Date | null;
    /** Set by markWelcomeCredited; null = welcome bonus has never been credited
     * (either pre-rollout grandfathered user or a mid-signup crash). */
    welcomeCreditedAt: Date | null;
  } | null>;
  create(args: {
    telegramId: number;
    firstName?: string;
    username?: string;
    photoUrl?: string;
  }): Promise<{ id: string; telegramId: number; createdAt: Date }>;
  touchLastSeen(id: string): Promise<void>;
  updateProfile(args: {
    id: string;
    firstName?: string;
    username?: string;
    photoUrl?: string;
  }): Promise<void>;
  /** Idempotent — only sets tutorial_done_at if currently NULL. Returns the
   * effective timestamp (existing one if already set). */
  markTutorialDone(id: string): Promise<Date>;
  /** Atomic test-and-set: stamps welcome_credited_at = NOW() and returns
   * `true` only if THIS call was the one that flipped NULL → NOW. Other
   * concurrent racers receive `false` and must NOT mint a duplicate bonus. */
  markWelcomeCredited(id: string): Promise<boolean>;
  /** Attribute a referrer with the INV-13 guard (referrer immutable + 60s
   * window from signup + 0 finalized entries). Returns true if the row was
   * actually updated, false if any guard failed (anti-abuse silent no-op). */
  setReferrerIfEligible(args: { userId: string; inviterUserId: string }): Promise<boolean>;
  /** Find users whose welcome bonus expired: credited > N days ago, never
   * expired, and zero finalized entries. NULL welcome_credited_at users are
   * grandfathered and never returned. */
  findUsersWithExpiredWelcome(args: { expiryDays: number }): Promise<Array<{ id: string }>>;
  /** Stamp welcome_expired_at = NOW() so we don't double-claw. */
  markWelcomeExpired(id: string): Promise<void>;
  /** Read raw welcome bonus state + finalized count + recruiter (joined via
   * referrer_user_id) for /me/welcome-status. */
  getWelcomeRaw(id: string): Promise<{
    welcomeCreditedAt: Date | null;
    welcomeExpiredAt: Date | null;
    finalizedCount: number;
    recruiter: { firstName: string | null; photoUrl: string | null } | null;
  } | null>;
}

export interface UpsertOnAuthArgs {
  telegramId: number;
  firstName?: string;
  username?: string;
  photoUrl?: string;
}

export interface UpsertOnAuthResult {
  userId: string;
  isNew: boolean;
  balanceCents: bigint;
  /** null = onboarding not yet completed; FE routes to /tutorial. */
  tutorialDoneAt: Date | null;
}

export interface UsersServiceDeps {
  repo: UsersRepo;
  currency: CurrencyService;
  welcomeBonusCoins: bigint;
  /** Optional — only used by expireUnusedWelcome. Tests pass a no-op logger. */
  log?: Logger;
}

export interface UsersService {
  upsertOnAuth(args: UpsertOnAuthArgs): Promise<UpsertOnAuthResult>;
  findUserIdByTelegramId(telegramId: number): Promise<string | null>;
  markTutorialDone(userId: string): Promise<Date>;
  /** Try to attribute referrer for a brand-new user. Self-referral, missed
   * 60s window, or already-set referrer all return false silently — INV-13
   * immutability + anti-abuse stay enforced at the SQL layer. */
  attributeReferrer(args: { userId: string; inviterUserId: string }): Promise<boolean>;
  /** Daily-cron entry point: claw back welcome bonus from users who never
   * played within the 7-day expiry window. Skips grandfathered users
   * (welcome_credited_at IS NULL). Returns the count debited. */
  expireUnusedWelcome(): Promise<{ expiredCount: number }>;
  /** Derive welcome bonus status for /me/welcome-status: 'active' (still
   * counting down), 'used' (already played), 'expired' (cron clawed back),
   * or 'grandfathered' (pre-rollout user, untracked). Includes the recruiter
   * profile when the caller landed via a ref-link — drives the Welcome screen. */
  getWelcomeStatus(userId: string): Promise<{
    state: 'active' | 'used' | 'expired' | 'grandfathered';
    welcomeBonusCoins: number;
    welcomeCreditedAt: Date | null;
    welcomeExpiresAt: Date | null;
    daysUntilExpiry: number | null;
    recruiter: { firstName: string | null; photoUrl: string | null } | null;
  }>;
}

export function createUsersService(deps: UsersServiceDeps): UsersService {
  return {
    async upsertOnAuth(args) {
      const existing = await deps.repo.findByTelegramId(args.telegramId);
      if (existing) {
        await deps.repo.touchLastSeen(existing.id);
        // Refresh mutable profile fields each auth so they stay current with TG.
        await deps.repo.updateProfile({
          id: existing.id,
          ...(args.firstName !== undefined && { firstName: args.firstName }),
          ...(args.username !== undefined && { username: args.username }),
          ...(args.photoUrl !== undefined && { photoUrl: args.photoUrl }),
        });
        // Recovery path: a previous signup may have created the user row but
        // crashed mid-flow before currency.transact ran (FE retries auth →
        // we land here as `existing` and the user is permanently $0). If
        // welcome_credited_at is NULL AND there's no WELCOME_BONUS transaction
        // on record, retro-credit now. The transaction-existence check is
        // belt-and-braces for the case where someone manually patched
        // welcome_credited_at without a transaction (or vice versa).
        let balanceCents = await deps.currency.getBalance(existing.id);
        if (existing.welcomeCreditedAt === null && deps.welcomeBonusCoins > 0n) {
          // Atomic-acquire BEFORE transact (was the other way around — that
          // produced a race where 3 concurrent /me requests all observed
          // null, all credited 20 🪙, and the user ended up with 60). Only
          // the winning racer flips NULL → NOW and proceeds to mint.
          const wonRace = await deps.repo.markWelcomeCredited(existing.id);
          if (wonRace) {
            try {
              const r = await deps.currency.transact({
                userId: existing.id,
                deltaCents: deps.welcomeBonusCoins,
                type: 'WELCOME_BONUS',
              });
              balanceCents = r.balanceAfter;
              deps.log?.info(
                { userId: existing.id, deltaCents: deps.welcomeBonusCoins.toString() },
                'welcome bonus retro-credited (recovery)',
              );
            } catch (err) {
              deps.log?.warn({ err, userId: existing.id }, 'welcome retro-credit failed');
            }
          }
        }
        return {
          userId: existing.id,
          isNew: false,
          balanceCents,
          tutorialDoneAt: existing.tutorialDoneAt,
        };
      }
      const created = await deps.repo.create(args);
      let balanceCents = 0n;
      if (deps.welcomeBonusCoins > 0n) {
        // Same atomic-acquire-first pattern as the existing-user branch —
        // create() always succeeds with welcome_credited_at NULL, but a
        // following concurrent /me hit could otherwise enter the existing
        // branch and double-mint before this transact returns.
        const wonRace = await deps.repo.markWelcomeCredited(created.id);
        if (wonRace) {
          const r = await deps.currency.transact({
            userId: created.id,
            deltaCents: deps.welcomeBonusCoins,
            type: 'WELCOME_BONUS',
          });
          balanceCents = r.balanceAfter;
        }
      }
      // Brand-new user: tutorial not yet done — FE routes to /tutorial.
      return { userId: created.id, isNew: true, balanceCents, tutorialDoneAt: null };
    },
    async findUserIdByTelegramId(telegramId) {
      const r = await deps.repo.findByTelegramId(telegramId);
      return r?.id ?? null;
    },
    async markTutorialDone(userId) {
      return deps.repo.markTutorialDone(userId);
    },
    async attributeReferrer({ userId, inviterUserId }) {
      if (userId === inviterUserId) return false; // self-ref blocked at the service layer too
      return deps.repo.setReferrerIfEligible({ userId, inviterUserId });
    },
    async getWelcomeStatus(userId) {
      const raw = await deps.repo.getWelcomeRaw(userId);
      const bonusCoins = WELCOME_BONUS_COINS;
      const recruiter = raw?.recruiter ?? null;
      if (!raw || raw.welcomeCreditedAt === null) {
        // Pre-rollout user (migration 0011 left their welcome_credited_at NULL).
        return {
          state: 'grandfathered' as const,
          welcomeBonusCoins: bonusCoins,
          welcomeCreditedAt: null,
          welcomeExpiresAt: null,
          daysUntilExpiry: null,
          recruiter,
        };
      }
      const expiresAt = new Date(
        raw.welcomeCreditedAt.getTime() + WELCOME_EXPIRY_DAYS * 24 * 3600 * 1000,
      );
      if (raw.welcomeExpiredAt !== null) {
        return {
          state: 'expired' as const,
          welcomeBonusCoins: bonusCoins,
          welcomeCreditedAt: raw.welcomeCreditedAt,
          welcomeExpiresAt: expiresAt,
          daysUntilExpiry: null,
          recruiter,
        };
      }
      if (raw.finalizedCount > 0) {
        return {
          state: 'used' as const,
          welcomeBonusCoins: bonusCoins,
          welcomeCreditedAt: raw.welcomeCreditedAt,
          welcomeExpiresAt: expiresAt,
          daysUntilExpiry: null,
          recruiter,
        };
      }
      // Active state — still in the 7-day window with no contests played.
      const msLeft = expiresAt.getTime() - Date.now();
      const daysUntilExpiry = Math.max(0, Math.floor(msLeft / (24 * 3600 * 1000)));
      return {
        state: 'active' as const,
        welcomeBonusCoins: bonusCoins,
        welcomeCreditedAt: raw.welcomeCreditedAt,
        welcomeExpiresAt: expiresAt,
        daysUntilExpiry,
        recruiter,
      };
    },
    async expireUnusedWelcome() {
      // Snapshot the bonus amount in case config changes mid-cron — we want to
      // claw back exactly what we minted, not whatever the current default says.
      const debit = -BigInt(WELCOME_BONUS_COINS);
      const candidates = await deps.repo.findUsersWithExpiredWelcome({
        expiryDays: WELCOME_EXPIRY_DAYS,
      });
      let expiredCount = 0;
      for (const u of candidates) {
        try {
          await deps.currency.transact({
            userId: u.id,
            deltaCents: debit,
            type: 'WELCOME_EXPIRED',
          });
          await deps.repo.markWelcomeExpired(u.id);
          expiredCount += 1;
        } catch (err) {
          // INV-7: log + continue. A user already at $0 (e.g., debited via some
          // other flow) would trip the overdraft guard — leaving them flagged
          // as expired would be wrong, so we just skip.
          deps.log?.warn({ err, userId: u.id }, 'expireUnusedWelcome: claw-back skipped');
        }
      }
      return { expiredCount };
    },
  };
}
