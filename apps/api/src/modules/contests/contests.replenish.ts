import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { contests, users } from '../../db/schema/index.js';
import type { Logger } from '../../logger.js';

// prize_pool_cents = guaranteed minimum (overlay floor). Actual pool is derived
// from real entries × fee × (1 - rake). Set to 0 → pure pari-mutuel; non-zero
// becomes house-funded floor.
// min_rank gates content; xp_multiplier feeds awardXp on finalize. Bear contest is
// 1.5x to incentivize the differentiator (RANK_SYSTEM.md §2.3). Welcome Match is
// always available so a Rank-1 user can play immediately and earn XP into Rank 2+.
export const REPLENISH_TEMPLATES = [
  {
    // Free safety-net contest. House-funded $5 pool so a player who burned
    // through their soft balance can keep playing. 10 seats, max win $2.50,
    // small distribution down to ~$0.50 for 3rd place via the prize curve.
    name: 'Practice',
    type: 'bull' as const,
    entryFeeCents: 0n,
    prizePoolCents: 5n,
    maxCapacity: 10,
    isFeatured: false,
    minRank: 1,
    xpMultiplier: '1.00',
    payAll: true,
  },
  {
    // First paid contest — opens at Rank 2 so a fresh user does Practice
    // (R1, free) for one cycle, earns XP, then graduates into cash.
    name: 'Quick Match',
    type: 'bull' as const,
    entryFeeCents: 1n,
    prizePoolCents: 0n,
    maxCapacity: 20,
    isFeatured: false,
    minRank: 2,
    xpMultiplier: '1.00',
  },
  {
    name: 'Bear Trap',
    type: 'bear' as const,
    entryFeeCents: 1n,
    prizePoolCents: 0n,
    maxCapacity: 20,
    isFeatured: false,
    minRank: 3,
    xpMultiplier: '1.50',
  },
  {
    name: 'Memecoin Madness',
    type: 'bull' as const,
    entryFeeCents: 5n,
    prizePoolCents: 0n,
    maxCapacity: 20,
    isFeatured: false,
    minRank: 5,
    xpMultiplier: '1.00',
  },
  // High-rank contests below: entry fees are placeholder USD-cents until the TON
  // payment rail lands. Names mirror RANK_UNLOCKS (packages/shared/src/ranks/unlocks.ts)
  // so the lobby teaser ("Reach Rank N to unlock X") matches a real contest.
  {
    name: 'High-Stakes Quick Match',
    type: 'bull' as const,
    entryFeeCents: 10n,
    prizePoolCents: 0n,
    maxCapacity: 20,
    isFeatured: false,
    minRank: 7,
    xpMultiplier: '1.00',
  },
  {
    name: 'Trader Cup',
    type: 'bull' as const,
    entryFeeCents: 20n,
    prizePoolCents: 0n,
    maxCapacity: 20,
    isFeatured: false,
    minRank: 10,
    xpMultiplier: '1.00',
  },
  {
    name: 'Bear Apocalypse',
    type: 'bear' as const,
    entryFeeCents: 25n,
    prizePoolCents: 0n,
    maxCapacity: 20,
    isFeatured: false,
    minRank: 12,
    xpMultiplier: '1.50',
  },
  {
    name: 'Degen Arena',
    type: 'bull' as const,
    entryFeeCents: 50n,
    prizePoolCents: 0n,
    maxCapacity: 20,
    isFeatured: false,
    minRank: 15,
    xpMultiplier: '1.00',
  },
  {
    name: 'Whale Vault',
    type: 'bull' as const,
    entryFeeCents: 100n,
    prizePoolCents: 0n,
    maxCapacity: 20,
    isFeatured: false,
    minRank: 18,
    xpMultiplier: '1.00',
  },
  {
    name: 'Legend League',
    type: 'bull' as const,
    entryFeeCents: 250n,
    prizePoolCents: 0n,
    maxCapacity: 20,
    isFeatured: false,
    minRank: 23,
    xpMultiplier: '1.00',
  },
  {
    name: 'Mythic Cup',
    type: 'bull' as const,
    entryFeeCents: 500n,
    prizePoolCents: 0n,
    maxCapacity: 20,
    isFeatured: false,
    minRank: 30,
    xpMultiplier: '1.00',
  },
] as const;

export const FILL_DURATION_MS = 5 * 60_000;
export const PLAY_DURATION_MS = 10 * 60_000;

export interface ReplenishServiceDeps {
  db: Database;
  log: Logger;
  /** TG ID of an admin user; will be created if absent and used as createdByUserId. */
  adminTelegramId: number;
}

export interface ReplenishService {
  replenish(): Promise<{ created: number }>;
}

export function createReplenishService(deps: ReplenishServiceDeps): ReplenishService {
  return {
    async replenish() {
      // Ensure admin user.
      const [existingAdmin] = await deps.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.telegramId, deps.adminTelegramId))
        .limit(1);

      let adminId: string;
      if (existingAdmin) {
        adminId = existingAdmin.id;
      } else {
        const [created] = await deps.db
          .insert(users)
          .values({
            telegramId: deps.adminTelegramId,
            username: 'admin',
            firstName: 'Admin',
          })
          .returning({ id: users.id });
        if (!created) throw new Error('Failed to create admin user');
        adminId = created.id;
      }

      let created = 0;
      for (const t of REPLENISH_TEMPLATES) {
        const [existing] = await deps.db
          .select({ id: contests.id })
          .from(contests)
          .where(and(eq(contests.name, t.name), eq(contests.status, 'scheduled')))
          .limit(1);
        if (existing) continue;

        const now = Date.now();
        const startsAt = new Date(now + FILL_DURATION_MS);
        const endsAt = new Date(now + FILL_DURATION_MS + PLAY_DURATION_MS);

        await deps.db.insert(contests).values({
          name: t.name,
          type: t.type,
          entryFeeCents: t.entryFeeCents,
          prizePoolCents: t.prizePoolCents,
          maxCapacity: t.maxCapacity,
          isFeatured: t.isFeatured,
          minRank: t.minRank,
          xpMultiplier: t.xpMultiplier,
          payAll: 'payAll' in t ? t.payAll : false,
          startsAt,
          endsAt,
          createdByUserId: adminId,
        });
        created += 1;
      }

      if (created > 0) {
        deps.log.info({ created }, 'contests.replenish');
      }
      return { created };
    },
  };
}
