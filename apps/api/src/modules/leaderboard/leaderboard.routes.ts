import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { LiveResponse } from '@fantasytoken/shared';
import { errors } from '../../lib/errors.js';
import { tryTelegramUser, upsertArgsFromTgUser } from '../../lib/auth-context.js';
import type { LeaderboardService } from './leaderboard.service.js';
import type { UsersService } from '../users/users.service.js';

export interface LiveRoutesDeps {
  leaderboard: LeaderboardService;
  users: UsersService;
}

export function makeLiveRoutes(deps: LiveRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.get('/:id/live', async (req) => {
      const { id: contestId } = z.object({ id: z.string().uuid() }).parse(req.params);

      const tg = tryTelegramUser(req);
      let userId: string | undefined;
      if (tg) {
        const upsert = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
        userId = upsert.userId;
      }

      const result = await deps.leaderboard.getLive({
        contestId,
        ...(userId !== undefined && { userId }),
      });
      if (!result) throw errors.notFound('contest');
      const response: typeof LiveResponse._type = result;
      return response;
    });
  };
}
