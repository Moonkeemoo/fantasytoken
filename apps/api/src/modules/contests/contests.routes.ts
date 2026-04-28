import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ContestFilter, ContestListResponse } from '@fantasytoken/shared';
import { errors } from '../../lib/errors.js';
import { tryTelegramUser } from '../../lib/auth-context.js';
import type { ContestsService } from './contests.service.js';
import type { UsersService } from '../users/users.service.js';

const ListQuery = z.object({ filter: ContestFilter.default('cash') });

export interface ContestsRoutesDeps {
  contests: ContestsService;
  users: UsersService;
}

/**
 * Resolve calling user from initData (INV-1) so 'my' filter and `userHasEntered`
 * reflect the requester. Returns undefined if no/invalid initData (anonymous user
 * gets 'cash'/'free' lists with userHasEntered=false; 'my' returns empty).
 */
async function authedUser(
  req: FastifyRequest,
  deps: ContestsRoutesDeps,
): Promise<string | undefined> {
  const tg = tryTelegramUser(req);
  if (!tg) return undefined;
  const r = await deps.users.upsertOnAuth({
    telegramId: tg.id,
    ...(tg.first_name !== undefined && { firstName: tg.first_name }),
    ...(tg.username !== undefined && { username: tg.username }),
  });
  return r.userId;
}

export function makeContestsRoutes(deps: ContestsRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async (req) => {
      const userId = await authedUser(req, deps);
      const q = ListQuery.parse(req.query);
      const items = await deps.contests.list({
        filter: q.filter,
        ...(userId !== undefined && { userId }),
      });
      const response: typeof ContestListResponse._type = {
        items: items.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          status: r.status,
          entryFeeCents: r.entryFeeCents,
          prizePoolCents: r.prizePoolCents,
          maxCapacity: r.maxCapacity,
          spotsFilled: r.spotsFilled,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          isFeatured: r.isFeatured,
          userHasEntered: r.userHasEntered,
        })),
      };
      return response;
    });

    app.get('/:id', async (req) => {
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const userId = await authedUser(req, deps);
      const c = await deps.contests.getById(params.id, userId);
      if (!c) throw errors.notFound('contest');
      return c;
    });
  };
}
