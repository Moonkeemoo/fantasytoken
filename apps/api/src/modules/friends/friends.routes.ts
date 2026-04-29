import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireTelegramUser, upsertArgsFromTgUser } from '../../lib/auth-context.js';
import type { UsersService } from '../users/users.service.js';
import type { FriendsService } from './friends.service.js';
import type { ReferralsService } from '../referrals/referrals.service.js';

const ReferralBody = z.object({
  inviterTelegramId: z.number().int().positive(),
});

export interface FriendsRoutesDeps {
  friends: FriendsService;
  users: UsersService;
  referrals: ReferralsService;
}

export function makeFriendsRoutes(deps: FriendsRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    /**
     * POST /friends/referral
     * Body: { inviterTelegramId }
     * Called by frontend on first auth with start_param=ref_<tgId>.
     *
     * Two outcomes (per REFERRAL_SYSTEM.md §1.1):
     *  - Always: create mutual friendship row (idempotent on conflict).
     *  - If caller is brand-new (created < 60s, 0 finalized entries): also set
     *    users.referrer_user_id (immutable, INV-13) and pre-create the two
     *    locked signup-bonus rows for the eventual unlock.
     *
     * Existing users hitting this endpoint only get the friendship side —
     * anti-abuse so two old friends can't retro-attribute one another.
     */
    app.post('/referral', async (req) => {
      const tg = requireTelegramUser(req);
      const body = ReferralBody.parse(req.body);

      const me = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
      const inviterUserId = await deps.users.findUserIdByTelegramId(body.inviterTelegramId);
      if (!inviterUserId) return { ok: false, reason: 'inviter_not_found' };

      await deps.friends.addByInviter({ userId: me.userId, inviterUserId });

      const attributed = await deps.users.attributeReferrer({
        userId: me.userId,
        inviterUserId,
      });
      if (attributed) {
        await deps.referrals.preCreateSignupBonuses({
          refereeUserId: me.userId,
          recruiterUserId: inviterUserId,
        });
      }

      return { ok: true, attributed };
    });
  };
}
