import type { Logger } from '../../logger.js';

export interface FriendsRepo {
  /** Insert mutual friendship (unordered pair). No-op if same id or already exists. */
  upsert(userA: string, userB: string): Promise<void>;
  /** List user_ids of all friends of a given user. */
  listFriendIds(userId: string): Promise<string[]>;
}

export interface FriendsServiceDeps {
  repo: FriendsRepo;
  log: Logger;
}

export interface FriendsService {
  /** Called by /me handshake when start_param contains a referral. Mutual. */
  addByInviter(args: { userId: string; inviterUserId: string }): Promise<void>;
  listFriendIds(userId: string): Promise<string[]>;
}

export function createFriendsService(deps: FriendsServiceDeps): FriendsService {
  return {
    async addByInviter({ userId, inviterUserId }) {
      if (userId === inviterUserId) return;
      try {
        await deps.repo.upsert(userId, inviterUserId);
      } catch (err) {
        // Likely FK violation (inviter doesn't exist) — don't fail the auth flow.
        deps.log.warn({ err, userId, inviterUserId }, 'friends.addByInviter failed');
      }
    },
    async listFriendIds(userId) {
      return deps.repo.listFriendIds(userId);
    },
  };
}
