import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireTelegramUser, upsertArgsFromTgUser } from '../../lib/auth-context.js';
import type { UsersService } from '../users/users.service.js';
import type { FriendsService } from './friends.service.js';

const ReferralBody = z.object({
  inviterTelegramId: z.number().int().positive(),
});

export interface FriendsRoutesDeps {
  friends: FriendsService;
  users: UsersService;
}

export function makeFriendsRoutes(deps: FriendsRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    /**
     * POST /friends/referral
     * Body: { inviterTelegramId }
     * Called by frontend on first auth with start_param=ref_<tgId>.
     * Creates mutual friendship; idempotent on conflict.
     */
    app.post('/referral', async (req) => {
      const tg = requireTelegramUser(req);
      const body = ReferralBody.parse(req.body);

      const me = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
      const inviterUserId = await deps.users.findUserIdByTelegramId(body.inviterTelegramId);
      if (!inviterUserId) return { ok: false, reason: 'inviter_not_found' };

      await deps.friends.addByInviter({ userId: me.userId, inviterUserId });
      return { ok: true };
    });
  };
}
