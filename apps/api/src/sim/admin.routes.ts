import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { SimGrantCoinsBody, SimSeedBody, SimWipeBody } from '@fantasytoken/shared';
import { requireAdmin } from '../lib/admin-auth.js';
import type { CurrencyService } from '../modules/currency/currency.service.js';
import type { SeedService } from './seed.service.js';
import type { WipeService } from './wipe.service.js';
import type { TickService } from './tick.service.js';
import type { SimObservability } from './observability.js';

export interface SimAdminRoutesDeps {
  seed: SeedService;
  wipe: WipeService;
  currency: CurrencyService;
  tick: TickService;
  observability: SimObservability;
}

/**
 * TZ-005 §4 — admin endpoints. Mounted under `/admin/sim`. Two gates:
 *   1. server.ts only registers this plugin when SIM_ADMIN_ENABLED=true.
 *   2. requireAdmin (existing) checks initData + ADMIN_TG_IDS membership.
 *
 * `set-rank` is intentionally omitted — `xp_events` is the source of
 * truth (INV-11). Adding a direct rank/xp_total bump here would violate
 * that invariant.
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

    /** Manual tick — useful for one-shot wave triggering during testing. */
    app.post('/tick', async (req) => {
      const stats = await deps.tick.tick();
      req.log.info({ ...stats }, 'sim.tick.manual');
      return stats;
    });

    // ─── Observability ────────────────────────────────────────────────
    const SinceQuery = z.object({
      sinceMinutes: z.coerce
        .number()
        .int()
        .positive()
        .max(60 * 24 * 7)
        .default(60),
    });

    app.get('/stats/actions', async (req) => {
      const q = SinceQuery.parse(req.query);
      const since = new Date(Date.now() - q.sinceMinutes * 60_000);
      return {
        sinceMinutes: q.sinceMinutes,
        rows: await deps.observability.getActionDistribution({ since }),
      };
    });

    app.get('/stats/hourly', async (req) => {
      const q = SinceQuery.extend({ action: z.string().optional() }).parse(req.query);
      const since = new Date(Date.now() - q.sinceMinutes * 60_000);
      return {
        sinceMinutes: q.sinceMinutes,
        action: q.action ?? null,
        rows: await deps.observability.getHourlyLoad(
          q.action ? { since, action: q.action } : { since },
        ),
      };
    });

    app.get('/stats/referral-tree', async () => deps.observability.getReferralTreeShape());

    app.get('/stats/economy', async () => ({
      rows: await deps.observability.getEconomySnapshot(),
    }));

    app.get('/stats/lineup-diversity/:contestId', async (req) => {
      const params = z.object({ contestId: z.string().uuid() }).parse(req.params);
      return deps.observability.getLineupDiversity({ contestId: params.contestId });
    });
  };
}
