import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ResultResponse } from '@fantasytoken/shared';
import { errors } from '../../lib/errors.js';
import { tryTelegramUser, upsertArgsFromTgUser } from '../../lib/auth-context.js';
import type { ResultService } from './result.service.js';
import type { UsersService } from '../users/users.service.js';

export interface ResultRoutesDeps {
  result: ResultService;
  users: UsersService;
}

export function makeResultRoutes(deps: ResultRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.get('/:id/result', async (req) => {
      const { id: contestId } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { entry: entryId } = z.object({ entry: z.string().uuid().optional() }).parse(req.query);

      const tg = tryTelegramUser(req);
      let userId: string | undefined;
      if (tg) {
        const upsert = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
        userId = upsert.userId;
      }

      const result = await deps.result.get({
        contestId,
        ...(userId !== undefined && { userId }),
        ...(entryId !== undefined && { entryId }),
      });
      if (!result) throw errors.notFound('contest result');
      const response: typeof ResultResponse._type = result;
      return response;
    });
  };
}
