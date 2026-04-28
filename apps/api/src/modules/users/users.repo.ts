import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { users } from '../../db/schema/index.js';
import type { UsersRepo } from './users.service.js';

export function createUsersRepo(db: Database): UsersRepo {
  return {
    async findByTelegramId(telegramId) {
      const [row] = await db
        .select({ id: users.id, telegramId: users.telegramId, createdAt: users.createdAt })
        .from(users)
        .where(eq(users.telegramId, telegramId))
        .limit(1);
      return row ?? null;
    },

    async create({ telegramId, firstName, username }) {
      const [row] = await db
        .insert(users)
        .values({ telegramId, firstName: firstName ?? null, username: username ?? null })
        .returning({ id: users.id, telegramId: users.telegramId, createdAt: users.createdAt });
      if (!row) throw new Error('Failed to insert user');
      return row;
    },

    async touchLastSeen(id) {
      await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, id));
    },
  };
}
