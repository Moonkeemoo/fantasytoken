import { eq, or } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { friendships } from '../../db/schema/index.js';
import type { FriendsRepo } from './friends.service.js';

export function createFriendsRepo(db: Database): FriendsRepo {
  return {
    async upsert(userA, userB) {
      // Order pair so user_a < user_b (matches CHECK constraint).
      const [a, b] = userA < userB ? [userA, userB] : [userB, userA];
      await db.insert(friendships).values({ userAId: a, userBId: b }).onConflictDoNothing();
    },
    async listFriendIds(userId) {
      const rows = await db
        .select({ a: friendships.userAId, b: friendships.userBId })
        .from(friendships)
        .where(or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)));
      return rows.map((r) => (r.a === userId ? r.b : r.a));
    },
  };
}
