import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { RankingMode } from '@fantasytoken/shared';
import { requireTelegramUser, upsertArgsFromTgUser } from '../../lib/auth-context.js';
import type { UsersService } from '../users/users.service.js';
import type { FriendsService } from '../friends/friends.service.js';
import type { RankingsService } from './rankings.service.js';

export interface RankingsRoutesDeps {
  rankings: RankingsService;
  friends: FriendsService;
  users: UsersService;
}

const Query = z.object({
  /** Sort axis for the leaderboard. Defaults to combined PnL for back-compat. */
  mode: RankingMode.optional(),
});

export function makeRankingsRoutes(deps: RankingsRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.get('/friends', async (req) => {
      const tg = requireTelegramUser(req);
      const me = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
      const friendIds = await deps.friends.listFriendIds(me.userId);
      const { mode } = Query.parse(req.query);
      return deps.rankings.getFriends({
        userId: me.userId,
        friendIds,
        mode: mode ?? 'total',
      });
    });

    app.get('/global', async (req) => {
      const tg = requireTelegramUser(req);
      const me = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
      const { mode } = Query.parse(req.query);
      return deps.rankings.getGlobal({
        userId: me.userId,
        limit: 100,
        mode: mode ?? 'total',
      });
    });
  };
}
