import { WELCOME_BONUS_CENTS, WELCOME_EXPIRY_DAYS } from '@fantasytoken/shared';
import type { CurrencyService } from '../currency/currency.service.js';
import type { Logger } from '../../logger.js';

export interface UsersRepo {
  findByTelegramId(telegramId: number): Promise<{
    id: string;
    telegramId: number;
    createdAt: Date;
    tutorialDoneAt: Date | null;
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
  /** Stamp welcome_credited_at = NOW() so the daily expiry cron starts the
   * 7-day clock. Only runs once per user; subsequent calls are no-ops. */
  markWelcomeCredited(id: string): Promise<void>;
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
  /** Read raw welcome bonus state + finalized count for /me/welcome-status. */
  getWelcomeRaw(id: string): Promise<{
    welcomeCreditedAt: Date | null;
    welcomeExpiredAt: Date | null;
    finalizedCount: number;
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
  welcomeBonusCents: bigint;
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
   * or 'grandfathered' (pre-rollout user, untracked). */
  getWelcomeStatus(userId: string): Promise<{
    state: 'active' | 'used' | 'expired' | 'grandfathered';
    welcomeBonusCents: number;
    welcomeCreditedAt: Date | null;
    welcomeExpiresAt: Date | null;
    daysUntilExpiry: number | null;
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
        return {
          userId: existing.id,
          isNew: false,
          balanceCents: await deps.currency.getBalance(existing.id),
          tutorialDoneAt: existing.tutorialDoneAt,
        };
      }
      const created = await deps.repo.create(args);
      let balanceCents = 0n;
      if (deps.welcomeBonusCents > 0n) {
        const r = await deps.currency.transact({
          userId: created.id,
          deltaCents: deps.welcomeBonusCents,
          type: 'WELCOME_BONUS',
        });
        balanceCents = r.balanceAfter;
        // Stamp credited-at so the 7-day expiry cron has a clock to compare against.
        // Existing users (pre-migration 0011) keep welcome_credited_at = NULL and
        // are skipped by the cron — grandfathered.
        await deps.repo.markWelcomeCredited(created.id);
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
      const bonusCents = WELCOME_BONUS_CENTS;
      if (!raw || raw.welcomeCreditedAt === null) {
        // Pre-rollout user (migration 0011 left their welcome_credited_at NULL).
        return {
          state: 'grandfathered' as const,
          welcomeBonusCents: bonusCents,
          welcomeCreditedAt: null,
          welcomeExpiresAt: null,
          daysUntilExpiry: null,
        };
      }
      const expiresAt = new Date(
        raw.welcomeCreditedAt.getTime() + WELCOME_EXPIRY_DAYS * 24 * 3600 * 1000,
      );
      if (raw.welcomeExpiredAt !== null) {
        return {
          state: 'expired' as const,
          welcomeBonusCents: bonusCents,
          welcomeCreditedAt: raw.welcomeCreditedAt,
          welcomeExpiresAt: expiresAt,
          daysUntilExpiry: null,
        };
      }
      if (raw.finalizedCount > 0) {
        return {
          state: 'used' as const,
          welcomeBonusCents: bonusCents,
          welcomeCreditedAt: raw.welcomeCreditedAt,
          welcomeExpiresAt: expiresAt,
          daysUntilExpiry: null,
        };
      }
      // Active state — still in the 7-day window with no contests played.
      const msLeft = expiresAt.getTime() - Date.now();
      const daysUntilExpiry = Math.max(0, Math.floor(msLeft / (24 * 3600 * 1000)));
      return {
        state: 'active' as const,
        welcomeBonusCents: bonusCents,
        welcomeCreditedAt: raw.welcomeCreditedAt,
        welcomeExpiresAt: expiresAt,
        daysUntilExpiry,
      };
    },
    async expireUnusedWelcome() {
      // Snapshot the bonus amount in case config changes mid-cron — we want to
      // claw back exactly what we minted, not whatever the current default says.
      const debit = -BigInt(WELCOME_BONUS_CENTS);
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
