import type { CurrencyService } from '../currency/currency.service.js';

export interface UsersRepo {
  findByTelegramId(
    telegramId: number,
  ): Promise<{
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
}

export interface UsersService {
  upsertOnAuth(args: UpsertOnAuthArgs): Promise<UpsertOnAuthResult>;
  findUserIdByTelegramId(telegramId: number): Promise<string | null>;
  markTutorialDone(userId: string): Promise<Date>;
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
  };
}
