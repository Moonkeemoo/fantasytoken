import type { FastifyPluginAsync } from 'fastify';

import { CreateContestBody } from '@fantasytoken/shared';

import { requireAdmin } from '../../lib/admin-auth.js';
import { errors } from '../../lib/errors.js';
import { parseUserFromInitData, validateInitData } from '../../lib/telegram-auth.js';
import type { ContestsService } from '../contests/contests.service.js';
import type { UsersService } from '../users/users.service.js';

export interface AdminRoutesDeps {
  contests: ContestsService;
  users: UsersService;
}

export function makeAdminRoutes(deps: AdminRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', requireAdmin);

    app.post('/contests', async (req) => {
      const body = CreateContestBody.parse(req.body);

      // Resolve admin user id (requireAdmin already validated initData).
      const initData = req.headers['x-telegram-init-data'];
      if (typeof initData !== 'string') throw errors.invalidInitData();
      if (!validateInitData(initData, req.server.deps.config.TELEGRAM_BOT_TOKEN)) {
        throw errors.invalidInitData();
      }
      const tg = parseUserFromInitData(initData);
      if (!tg) throw errors.invalidInitData();
      const upsert = await deps.users.upsertOnAuth({
        telegramId: tg.id,
        ...(tg.first_name !== undefined && { firstName: tg.first_name }),
        ...(tg.username !== undefined && { username: tg.username }),
      });

      const startsAt = new Date(body.startsAt);
      const endsAt = new Date(body.endsAt);
      const created = await deps.contests.create({
        name: body.name,
        entryFeeCents: body.entryFeeCents,
        prizePoolCents: body.prizePoolCents,
        maxCapacity: body.maxCapacity,
        startsAt,
        endsAt,
        isFeatured: body.isFeatured,
        createdByUserId: upsert.userId,
      });
      return { id: created.id };
    });
  };
}
