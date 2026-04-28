import type { Database } from '../client.js';
import { contests, users } from '../schema/index.js';
import { eq } from 'drizzle-orm';

export interface SeedContestsArgs {
  adminTelegramId: number;
}

/**
 * Seed an admin user (if absent) and 4 contests:
 *   - 1 featured paid (Memecoin Madness)
 *   - 1 paid (Quick Match)
 *   - 1 free (Free Roll)
 *   - 1 high stakes paid
 *
 * Idempotent: if a contest with the same name already exists, update its
 * maxCapacity from the fixture (so reseeding can rebalance contest size
 * without dropping data).
 */
export async function seedContests(
  db: Database,
  args: SeedContestsArgs,
): Promise<{ admin: string; created: number }> {
  // Ensure admin user exists.
  const [existingAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.telegramId, args.adminTelegramId))
    .limit(1);

  let adminId: string;
  if (existingAdmin) {
    adminId = existingAdmin.id;
  } else {
    const [created] = await db
      .insert(users)
      .values({ telegramId: args.adminTelegramId, username: 'admin', firstName: 'Admin' })
      .returning({ id: users.id });
    if (!created) throw new Error('Failed to create admin user');
    adminId = created.id;
  }

  const now = Date.now();
  const inHours = (h: number) => new Date(now + h * 3600_000);

  const fixtures = [
    {
      name: 'Memecoin Madness',
      entryFeeCents: 500n,
      prizePoolCents: 1_000_000n,
      maxCapacity: 20,
      startsAt: inHours(4),
      endsAt: inHours(28),
      isFeatured: true,
    },
    {
      name: 'Quick Match',
      entryFeeCents: 100n,
      prizePoolCents: 20_000n,
      maxCapacity: 20,
      startsAt: inHours(1),
      endsAt: inHours(2),
      isFeatured: false,
    },
    {
      name: 'Free Roll',
      entryFeeCents: 0n,
      prizePoolCents: 5_000n,
      maxCapacity: 20,
      startsAt: inHours(2),
      endsAt: inHours(26),
      isFeatured: false,
    },
    {
      name: 'High Stakes',
      entryFeeCents: 2500n,
      prizePoolCents: 250_000n,
      maxCapacity: 20,
      startsAt: inHours(4),
      endsAt: inHours(28),
      isFeatured: false,
    },
  ];

  let created = 0;
  for (const f of fixtures) {
    const [existing] = await db
      .select({ id: contests.id })
      .from(contests)
      .where(eq(contests.name, f.name))
      .limit(1);
    if (existing) {
      await db
        .update(contests)
        .set({ maxCapacity: f.maxCapacity })
        .where(eq(contests.id, existing.id));
      continue;
    }
    await db.insert(contests).values({
      ...f,
      createdByUserId: adminId,
    });
    created += 1;
  }

  return { admin: adminId, created };
}
