import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  type ActivityResponse,
  LineupsFilter,
  type LineupsListResponse,
  entrySubmissionSchema,
  EntrySubmissionResult,
} from '@fantasytoken/shared';
import { errors } from '../../lib/errors.js';
import { tryTelegramUser, upsertArgsFromTgUser } from '../../lib/auth-context.js';
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
      const upsert = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));

      const result = await deps.entries.submit({
        userId: upsert.userId,
        contestId,
        // TZ-003: body.picks is now `string[]` (symbols only).
        picks: body.picks,
      });

      const response: typeof EntrySubmissionResult._type = result;
      return response;
    });

    /**
     * GET /contests/:id/lineups?filter=all|friends|recent&limit=50
     *
     * Public Browse-others feed (TZ-001 §07). Privacy contract enforced at
     * the repo layer: returns user handle + symbols + submittedAt only.
     * No allocations, no entry fee, no PnL — even post-kickoff. Live PnL has
     * its own dedicated endpoint.
     */
    app.get('/:id/lineups', async (req) => {
      const { id: contestId } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { filter, limit } = z
        .object({
          filter: LineupsFilter.optional(),
          limit: z.coerce.number().int().positive().max(200).optional(),
        })
        .parse(req.query);
      const resolvedFilter = filter ?? 'all';
      const resolvedLimit = limit ?? 50;
      const result = await deps.entries.listPublicLineups({
        contestId,
        filter: resolvedFilter,
        limit: resolvedLimit,
      });
      const response: LineupsListResponse = result;
      return response;
    });

    /**
     * GET /contests/:id/activity?limit=20
     *
     * Recent lock-in events for the LockedScreen rotating activity row.
     * Privacy: first-name handles only (handoff §13 Q4).
     */
    app.get('/:id/activity', async (req) => {
      const { id: contestId } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { limit } = z
        .object({
          limit: z.coerce.number().int().positive().max(50).optional(),
        })
        .parse(req.query);
      const items = await deps.entries.listActivity({
        contestId,
        limit: limit ?? 20,
      });
      const response: ActivityResponse = { items };
      return response;
    });
  };
}
