import type { FastifyPluginAsync } from 'fastify';
import { SimGrantCoinsBody, SimSeedBody, SimWipeBody } from '@fantasytoken/shared';
import { requireAdmin } from '../lib/admin-auth.js';
import type { CurrencyService } from '../modules/currency/currency.service.js';
import type { SeedService } from './seed.service.js';
import type { WipeService } from './wipe.service.js';

export interface SimAdminRoutesDeps {
  seed: SeedService;
  wipe: WipeService;
  currency: CurrencyService;
}

/**
 * TZ-005 §4 — admin endpoints. Mounted under `/admin/sim`. Two gates:
 *   1. server.ts only registers this plugin when SIM_ADMIN_ENABLED=true.
 *   2. requireAdmin (existing) checks initData + ADMIN_TG_IDS membership.
 *
 * `set-rank` is intentionally omitted from M1 — TZ §10 lists it under M3
 * acceptance and `xp_events` is the source of truth (INV-11). Adding a
 * direct rank/xp_total bump here would violate that invariant.
 */
export function makeSimAdminRoutes(deps: SimAdminRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', requireAdmin);

    app.post('/seed', async (req) => {
      const body = SimSeedBody.parse(req.body);
      // exactOptionalPropertyTypes: spread only the keys that were provided,
      // so we never pass an explicit `undefined` for optional fields.
      const r = await deps.seed.seed({
        count: body.count,
        ...(body.distribution !== undefined ? { distribution: body.distribution } : {}),
        ...(body.batchSeed !== undefined ? { batchSeed: body.batchSeed } : {}),
      });
      req.log.info({ createdCount: r.createdCount, batchSeed: r.batchSeed }, 'sim.seed.completed');
      return {
        createdCount: r.createdCount,
        byPersona: r.byPersona,
        batchSeed: r.batchSeed,
      };
    });

    app.post('/grant-coins', async (req) => {
      const body = SimGrantCoinsBody.parse(req.body);
      const r = await deps.currency.transact({
        userId: body.userId,
        deltaCents: BigInt(body.amountCoins),
        type: 'DEV_GRANT',
      });
      return { txId: r.txId, balanceAfter: Number(r.balanceAfter) };
    });

    app.post('/wipe', async (req) => {
      const body = SimWipeBody.parse(req.body ?? {});
      const r = await deps.wipe.wipe({ dryRun: body.dryRun });
      req.log.warn({ ...r }, 'sim.wipe.completed');
      return r;
    });
  };
}
