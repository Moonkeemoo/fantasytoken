import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { entrySubmissionSchema, EntrySubmissionResult } from '@fantasytoken/shared';
import { errors } from '../../lib/errors.js';
import { tryTelegramUser } from '../../lib/auth-context.js';
import type { EntriesService } from './entries.service.js';
import type { UsersService } from '../users/users.service.js';

export interface EntriesRoutesDeps {
  entries: EntriesService;
  users: UsersService;
}

/**
 * POST /contests/:id/enter
 *
 * Submit a lineup. Idempotent: returns existing entry if user already entered.
 * INV-9: ENTRY_FEE debited inside EntriesService via CurrencyService.transact().
 */
export function makeEntriesRoutes(deps: EntriesRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.post('/:id/enter', async (req) => {
      const { id: contestId } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = entrySubmissionSchema.parse(req.body);

      const tg = tryTelegramUser(req);
      if (!tg) throw errors.invalidInitData();
      const upsert = await deps.users.upsertOnAuth({
        telegramId: tg.id,
        ...(tg.first_name !== undefined && { firstName: tg.first_name }),
        ...(tg.username !== undefined && { username: tg.username }),
      });

      const result = await deps.entries.submit({
        userId: upsert.userId,
        contestId,
        picks: body.picks,
      });

      const response: typeof EntrySubmissionResult._type = result;
      return response;
    });
  };
}
