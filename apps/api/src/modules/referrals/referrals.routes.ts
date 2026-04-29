import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  ReferralsPayoutsResponse,
  ReferralsSummaryResponse,
  ReferralsTreeResponse,
  WelcomeStatusResponse,
} from '@fantasytoken/shared';
import { requireTelegramUser, upsertArgsFromTgUser } from '../../lib/auth-context.js';
import { errors } from '../../lib/errors.js';
import type { ReferralsService } from './referrals.service.js';
import type { UsersService } from '../users/users.service.js';

export interface ReferralsRoutesDeps {
  referrals: ReferralsService;
  users: UsersService;
}

const PayoutsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Mounted at /me, so paths render as /me/referrals, /me/welcome-status, etc.
 * Auth is INV-1 — every route validates initData and resolves the caller.
 * Wire-side amounts are number (cents); we cast bigint → number at the boundary
 * after a MAX_SAFE_INTEGER guard (~$90T, well above any plausible payout). */
export function makeReferralsRoutes(deps: ReferralsRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    /** GET /me/referrals — aggregated summary for the headline. */
    app.get('/referrals', async (req) => {
      const tg = requireTelegramUser(req);
      const me = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
      const s = await deps.referrals.getStats(me.userId);
      const l1 = toCents(s.l1EarnedCents, 'l1EarnedCents');
      const l2 = toCents(s.l2EarnedCents, 'l2EarnedCents');
      const response: typeof ReferralsSummaryResponse._type = {
        l1Count: s.l1Count,
        l2Count: s.l2Count,
        l1ActiveCount: s.l1ActiveCount,
        l2ActiveCount: s.l2ActiveCount,
        totalEarnedCents: l1 + l2,
        l1EarnedCents: l1,
        l2EarnedCents: l2,
        // V1 USD-only — STARS/TON keys appear when those rails ship.
        byCurrency: { USD: { l1Cents: l1, l2Cents: l2 } },
      };
      return response;
    });

    /** GET /me/referrals/tree — drill list for Profile referrals section. */
    app.get('/referrals/tree', async (req) => {
      const tg = requireTelegramUser(req);
      const me = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
      const t = await deps.referrals.getTree(me.userId);
      const response: typeof ReferralsTreeResponse._type = {
        l1: t.l1.map((n) => ({
          userId: n.userId,
          firstName: n.firstName,
          photoUrl: n.photoUrl,
          joinedAt: n.joinedAt.toISOString(),
          hasPlayed: n.hasPlayed,
          contestsPlayed: n.contestsPlayed,
          totalContributedCents: toCents(n.totalContributedCents, 'totalContributedCents'),
        })),
        l2: t.l2.map((n) => ({
          userId: n.userId,
          firstName: n.firstName,
          photoUrl: n.photoUrl,
          joinedAt: n.joinedAt.toISOString(),
          hasPlayed: n.hasPlayed,
          contestsPlayed: n.contestsPlayed,
          totalContributedCents: toCents(n.totalContributedCents, 'totalContributedCents'),
          viaUserId: n.viaUserId,
        })),
      };
      return response;
    });

    /** GET /me/referrals/payouts?limit=20 — recent commission history. */
    app.get('/referrals/payouts', async (req) => {
      const tg = requireTelegramUser(req);
      const me = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
      const q = PayoutsQuery.parse(req.query);
      const payouts = await deps.referrals.getPayouts(me.userId, q.limit);
      const response: typeof ReferralsPayoutsResponse._type = {
        items: payouts.map((p) => ({
          id: p.id,
          level: p.level,
          payoutCents: toCents(p.payoutCents, 'payoutCents'),
          sourcePrizeCents: toCents(p.sourcePrizeCents, 'sourcePrizeCents'),
          currencyCode: p.currencyCode,
          sourceFirstName: p.sourceFirstName,
          contestName: p.contestName,
          createdAt: p.createdAt.toISOString(),
        })),
      };
      return response;
    });

    /** GET /me/welcome-status — bonus expiry state for Welcome screen countdown. */
    app.get('/welcome-status', async (req) => {
      const tg = requireTelegramUser(req);
      const me = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
      const s = await deps.users.getWelcomeStatus(me.userId);
      const response: typeof WelcomeStatusResponse._type = {
        state: s.state,
        welcomeBonusCents: s.welcomeBonusCents,
        welcomeCreditedAt: s.welcomeCreditedAt?.toISOString() ?? null,
        welcomeExpiresAt: s.welcomeExpiresAt?.toISOString() ?? null,
        daysUntilExpiry: s.daysUntilExpiry,
        recruiter: s.recruiter,
      };
      return response;
    });
  };
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Cast bigint cents to wire-side number with a precision guard. */
function toCents(v: bigint, label: string): number {
  if (v < 0n || v > MAX_SAFE) {
    // Should never trip in practice — but if it does we'd silently lose precision.
    throw errors.internal(`${label} out of safe-int range: ${v.toString()}`);
  }
  return Number(v);
}
