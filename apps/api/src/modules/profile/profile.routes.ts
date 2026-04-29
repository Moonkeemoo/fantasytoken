import type { FastifyPluginAsync } from 'fastify';
import { ProfileResponse } from '@fantasytoken/shared';
import { errors } from '../../lib/errors.js';
import { requireTelegramUser, upsertArgsFromTgUser } from '../../lib/auth-context.js';
import type { UsersService } from '../users/users.service.js';
import type { ProfileService } from './profile.service.js';

export interface ProfileRoutesDeps {
  profile: ProfileService;
  users: UsersService;
}

export function makeProfileRoutes(deps: ProfileRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async (req) => {
      const tg = requireTelegramUser(req);
      const me = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
      const data = await deps.profile.load(me.userId);
      if (!data) throw errors.notFound('profile');

      const response: typeof ProfileResponse._type = {
        user: data.user,
        balanceCents: data.balanceCents,
        stats: data.stats,
        recentContests: data.recentContests.map((r) => ({
          contestId: r.contestId,
          contestName: r.contestName,
          contestType: r.contestType,
          finalRank: r.finalRank,
          totalEntries: r.totalEntries,
          finishedAt: r.finishedAt.toISOString(),
          netPnlCents: r.netPnlCents,
        })),
      };
      return response;
    });
  };
}
