import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ContestFilter, ContestListResponse } from '@fantasytoken/shared';
import type { Database } from '../../db/client.js';
import { users as usersTable } from '../../db/schema/index.js';
import { errors } from '../../lib/errors.js';
import { tryTelegramUser, upsertArgsFromTgUser } from '../../lib/auth-context.js';
import type { ContestsService } from './contests.service.js';
import type { UsersService } from '../users/users.service.js';

const ListQuery = z.object({
  filter: ContestFilter.default('cash'),
  /** When false, hide contests with min_rank > caller's currentRank.
   * Default true (aspirational locked cards). */
  include_locked: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export interface ContestsRoutesDeps {
  contests: ContestsService;
  users: UsersService;
  db: Database;
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
  const r = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
  return r.userId;
}

export function makeContestsRoutes(deps: ContestsRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async (req) => {
      const userId = await authedUser(req, deps);
      const q = ListQuery.parse(req.query);
      let items = await deps.contests.list({
        filter: q.filter,
        ...(userId !== undefined && { userId }),
      });

      // include_locked=false → hide contests above caller's rank, EXCEPT ones the
      // caller already entered (legacy entries should remain visible regardless).
      if (!q.include_locked && userId !== undefined) {
        const [u] = await deps.db
          .select({ currentRank: usersTable.currentRank })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        const callerRank = u?.currentRank ?? 1;
        items = items.filter((c) => c.userHasEntered || c.minRank <= callerRank);
      }

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
          minRank: r.minRank,
          payAll: r.payAll,
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
