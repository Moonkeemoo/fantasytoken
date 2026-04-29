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
    name: 'Welcome Match',
    type: 'bull' as const,
    entryFeeCents: 0n,
    prizePoolCents: 0n,
    maxCapacity: 20,
    isFeatured: false,
    minRank: 1,
    xpMultiplier: '1.00',
  },
  {
    name: 'Quick Match',
    type: 'bull' as const,
    entryFeeCents: 100n,
    prizePoolCents: 0n,
    maxCapacity: 20,
    isFeatured: false,
    minRank: 2,
    xpMultiplier: '1.00',
  },
  {
    name: 'Memecoin Madness',
    type: 'bull' as const,
    entryFeeCents: 500n,
    prizePoolCents: 0n,
    maxCapacity: 20,
    isFeatured: true,
    minRank: 3,
    xpMultiplier: '1.00',
  },
  {
    name: 'Bear Trap',
    type: 'bear' as const,
    entryFeeCents: 100n,
    prizePoolCents: 0n,
    maxCapacity: 20,
    isFeatured: false,
    minRank: 5,
    xpMultiplier: '1.50',
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
