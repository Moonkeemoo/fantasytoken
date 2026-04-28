import type { FastifyPluginAsync } from 'fastify';
import { requireTelegramUser, upsertArgsFromTgUser } from '../../lib/auth-context.js';
import type { UsersService } from '../users/users.service.js';
import type { FriendsService } from '../friends/friends.service.js';
import type { RankingsService } from './rankings.service.js';

export interface RankingsRoutesDeps {
  rankings: RankingsService;
  friends: FriendsService;
  users: UsersService;
}

export function makeRankingsRoutes(deps: RankingsRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.get('/friends', async (req) => {
      const tg = requireTelegramUser(req);
      const me = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
      const friendIds = await deps.friends.listFriendIds(me.userId);
      return deps.rankings.getFriends({ userId: me.userId, friendIds });
    });

    app.get('/global', async (req) => {
      const tg = requireTelegramUser(req);
      const me = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
      return deps.rankings.getGlobal({ userId: me.userId, limit: 100 });
    });
  };
}
