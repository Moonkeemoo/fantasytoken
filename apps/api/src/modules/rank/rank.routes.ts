import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  nextUnlockAfter,
  rankFromXp,
  type RankResponse,
  type TeaserResponse,
  xpToNextRank,
} from '@fantasytoken/shared';
import type { Database } from '../../db/client.js';
import { users } from '../../db/schema/index.js';
import { errors } from '../../lib/errors.js';
import { requireTelegramUser, upsertArgsFromTgUser } from '../../lib/auth-context.js';
import type { UsersService } from '../users/users.service.js';

export interface RankRoutesDeps {
  db: Database;
  users: UsersService;
}

export function makeRankRoutes(deps: RankRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    /**
     * GET /me/rank — current rank + XP progress for the calling user.
     * Mounted under /me so it sits next to /me itself in routing tables.
     */
    app.get('/rank', async (req) => {
      const tg = requireTelegramUser(req);
      const me = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
      const [u] = await deps.db
        .select({
          xpTotal: users.xpTotal,
          xpSeason: users.xpSeason,
          currentRank: users.currentRank,
          careerHighestRank: users.careerHighestRank,
        })
        .from(users)
        .where(eq(users.id, me.userId))
        .limit(1);
      if (!u) throw errors.notFound('user');

      const xpTotal = Number(u.xpTotal);
      const info = rankFromXp(xpTotal);
      const progress = xpToNextRank(xpTotal);

      const response: RankResponse = {
        currentRank: info.rank,
        tier: info.tier,
        tierRoman: info.tierRoman,
        display: info.display,
        color: info.color,
        xpTotal,
        xpSeason: Number(u.xpSeason),
        xpInRank: progress.xpInRank,
        xpForRank: progress.xpForRank,
        remainingToNext: progress.remainingToNext,
        atMax: progress.atMax,
        careerHighestRank: u.careerHighestRank,
      };
      return response;
    });

    /**
     * GET /me/rank/teaser — next unlock + XP-to-go for Lobby teaser banner.
     */
    app.get('/rank/teaser', async (req) => {
      const tg = requireTelegramUser(req);
      const me = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
      const [u] = await deps.db
        .select({ xpTotal: users.xpTotal, currentRank: users.currentRank })
        .from(users)
        .where(eq(users.id, me.userId))
        .limit(1);
      if (!u) throw errors.notFound('user');

      const xpTotal = Number(u.xpTotal);
      const progress = xpToNextRank(xpTotal);
      const unlock = nextUnlockAfter(u.currentRank);

      const response: TeaserResponse = {
        nextRank: progress.atMax ? null : u.currentRank + 1,
        xpToNext: progress.remainingToNext,
        nextUnlock: unlock,
      };
      return response;
    });
  };
}
