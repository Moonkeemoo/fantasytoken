import type { CurrencyService } from '../currency/currency.service.js';

export interface UsersRepo {
  findByTelegramId(
    telegramId: number,
  ): Promise<{ id: string; telegramId: number; createdAt: Date } | null>;
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
}

export interface UsersServiceDeps {
  repo: UsersRepo;
  currency: CurrencyService;
  welcomeBonusCents: bigint;
}

export interface UsersService {
  upsertOnAuth(args: UpsertOnAuthArgs): Promise<UpsertOnAuthResult>;
  findUserIdByTelegramId(telegramId: number): Promise<string | null>;
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
      return { userId: created.id, isNew: true, balanceCents };
    },
    async findUserIdByTelegramId(telegramId) {
      const r = await deps.repo.findByTelegramId(telegramId);
      return r?.id ?? null;
    },
  };
}
