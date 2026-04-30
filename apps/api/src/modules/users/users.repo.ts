import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { users } from '../../db/schema/index.js';
import type { UsersRepo } from './users.service.js';

export function createUsersRepo(db: Database): UsersRepo {
  return {
    async findByTelegramId(telegramId) {
      const [row] = await db
        .select({
          id: users.id,
          telegramId: users.telegramId,
          createdAt: users.createdAt,
          tutorialDoneAt: users.tutorialDoneAt,
          welcomeCreditedAt: users.welcomeCreditedAt,
        })
        .from(users)
        .where(eq(users.telegramId, telegramId))
        .limit(1);
      return row ?? null;
    },

    async create({ telegramId, firstName, username, photoUrl }) {
      const [row] = await db
        .insert(users)
        .values({
          telegramId,
          firstName: firstName ?? null,
          username: username ?? null,
          photoUrl: photoUrl ?? null,
        })
        .returning({ id: users.id, telegramId: users.telegramId, createdAt: users.createdAt });
      if (!row) throw new Error('Failed to insert user');
      return row;
    },

    async touchLastSeen(id) {
      await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, id));
    },

    async updateProfile({ id, firstName, username, photoUrl }) {
      const patch: Record<string, string | null> = {};
      if (firstName !== undefined) patch.firstName = firstName;
      if (username !== undefined) patch.username = username;
      if (photoUrl !== undefined) patch.photoUrl = photoUrl;
      if (Object.keys(patch).length === 0) return;
      await db.update(users).set(patch).where(eq(users.id, id));
    },

    async markTutorialDone(id) {
      // COALESCE so an already-done user keeps their original timestamp.
      const [row] = await db
        .update(users)
        .set({ tutorialDoneAt: sql`COALESCE(${users.tutorialDoneAt}, NOW())` })
        .where(eq(users.id, id))
        .returning({ tutorialDoneAt: users.tutorialDoneAt });
      if (!row?.tutorialDoneAt) throw new Error('user not found or update failed');
      return row.tutorialDoneAt;
    },

    async markWelcomeCredited(id) {
      // Atomic-test-and-set: only stamps when welcome_credited_at IS NULL,
      // returning the row id only on the WINNING update. Service layer reads
      // the boolean to decide whether THIS request should mint the bonus.
      // Closes a race where 3 concurrent /me hits all observed null and
      // all credited 20 🪙 → user ended up with 60 instead of 20.
      const r = await db
        .update(users)
        .set({ welcomeCreditedAt: sql`NOW()` })
        .where(and(eq(users.id, id), sql`${users.welcomeCreditedAt} IS NULL`))
        .returning({ id: users.id });
      return r.length > 0;
    },

    async findUsersWithExpiredWelcome({ expiryDays }) {
      // Filter:
      //   welcome_credited_at IS NOT NULL  → grandfathered users skipped
      //   welcome_expired_at  IS NULL      → not already clawed back
      //   credited > expiryDays ago        → past the grace window
      //   no finalized entries             → never used the bonus
      const result = await db.execute<{ id: string }>(sql`
        SELECT u.id
        FROM ${users} u
        WHERE u.welcome_credited_at IS NOT NULL
          AND u.welcome_expired_at  IS NULL
          AND u.welcome_credited_at < NOW() - (${expiryDays}::int * INTERVAL '1 day')
          AND NOT EXISTS (
            SELECT 1 FROM entries e
            WHERE e.user_id = u.id AND e.status = 'finalized'
          )
      `);
      return result as unknown as Array<{ id: string }>;
    },

    async markWelcomeExpired(id) {
      await db
        .update(users)
        .set({ welcomeExpiredAt: sql`NOW()` })
        .where(eq(users.id, id));
    },

    async getWelcomeRaw(id) {
      const rows = await db.execute<{
        welcome_credited_at: Date | null;
        welcome_expired_at: Date | null;
        finalized_count: number;
        recruiter_first_name: string | null;
        recruiter_photo_url: string | null;
        referrer_user_id: string | null;
      }>(sql`
        SELECT
          u.welcome_credited_at,
          u.welcome_expired_at,
          u.referrer_user_id,
          (SELECT COUNT(*)::int FROM entries e
            WHERE e.user_id = u.id AND e.status = 'finalized') AS finalized_count,
          r.first_name AS recruiter_first_name,
          r.photo_url  AS recruiter_photo_url
        FROM ${users} u
        LEFT JOIN ${users} r ON r.id = u.referrer_user_id
        WHERE u.id = ${id}
        LIMIT 1
      `);
      const r = (
        rows as unknown as Array<{
          welcome_credited_at: Date | null;
          welcome_expired_at: Date | null;
          finalized_count: number;
          recruiter_first_name: string | null;
          recruiter_photo_url: string | null;
          referrer_user_id: string | null;
        }>
      )[0];
      if (!r) return null;
      return {
        welcomeCreditedAt: r.welcome_credited_at,
        welcomeExpiredAt: r.welcome_expired_at,
        finalizedCount: r.finalized_count,
        recruiter:
          r.referrer_user_id === null
            ? null
            : {
                firstName: r.recruiter_first_name,
                photoUrl: r.recruiter_photo_url,
              },
      };
    },

    async setReferrerIfEligible({ userId, inviterUserId }) {
      // INV-13 immutability + 60s window from signup + 0 finalized entries.
      // All three guards live in the WHERE so no race can sneak past — a
      // concurrent submitEntry race that finalizes between SELECT and UPDATE
      // would still be caught by the NOT EXISTS subquery.
      const result = await db.execute<{ id: string }>(sql`
        UPDATE ${users} SET referrer_user_id = ${inviterUserId}
        WHERE ${users.id} = ${userId}
          AND ${users.referrerUserId} IS NULL
          AND ${users.createdAt} > NOW() - INTERVAL '60 seconds'
          AND NOT EXISTS (
            SELECT 1 FROM entries e
            WHERE e.user_id = ${users.id} AND e.status = 'finalized'
          )
        RETURNING ${users.id}
      `);
      const rows = result as unknown as Array<{ id: string }>;
      return rows.length > 0;
    },
  };
}
