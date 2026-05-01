import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import { AppError } from './lib/errors.js';
import { createCoinGeckoClient } from './lib/coingecko.js';
import { scheduleEvery } from './lib/cron.js';
import type { Logger } from './logger.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { makeMeRoutes } from './modules/me/me.routes.js';
import { createCurrencyRepo } from './modules/currency/currency.repo.js';
import { createCurrencyService } from './modules/currency/currency.service.js';
import { createUsersRepo } from './modules/users/users.repo.js';
import { createUsersService } from './modules/users/users.service.js';
import { createTokensRepo } from './modules/tokens/tokens.repo.js';
import { createTokensService } from './modules/tokens/tokens.service.js';
import { makeTokensRoutes } from './modules/tokens/tokens.routes.js';
import { createPriceFeedWriter } from './modules/tokens/price-feed.service.js';
import { startBybitFeed } from './lib/bybit.js';
import { startOkxFeed } from './lib/okx.js';
import { createContestsRepo } from './modules/contests/contests.repo.js';
import { createContestsService } from './modules/contests/contests.service.js';
import { makeContestsRoutes } from './modules/contests/contests.routes.js';
import { makeAdminRoutes } from './modules/admin/admin.routes.js';
import { createCancelContest } from './modules/admin/admin.cancel.js';
import { createEntriesRepo } from './modules/entries/entries.repo.js';
import { createEntriesService } from './modules/entries/entries.service.js';
import { makeEntriesRoutes } from './modules/entries/entries.routes.js';
import { createContestsFinalizeRepo } from './modules/contests/contests.finalize.repo.js';
import { createContestsTickRepo } from './modules/contests/contests.tick.repo.js';
import { createContestsTickService } from './modules/contests/contests.tick.service.js';
import { createLeaderboardRepo } from './modules/leaderboard/leaderboard.repo.js';
import { createLeaderboardService } from './modules/leaderboard/leaderboard.service.js';
import { makeLiveRoutes } from './modules/leaderboard/leaderboard.routes.js';
import { createResultRepo } from './modules/result/result.repo.js';
import { createResultService } from './modules/result/result.service.js';
import { makeResultRoutes } from './modules/result/result.routes.js';
import { createSchedulerService } from './modules/contests/contests.scheduler.js';
import { createShareRepo } from './modules/share/share.repo.js';
import { createShareService } from './modules/share/share.service.js';
import { makeShareRoutes } from './modules/share/share.routes.js';
import { createFriendsRepo } from './modules/friends/friends.repo.js';
import { createFriendsService } from './modules/friends/friends.service.js';
import { makeFriendsRoutes } from './modules/friends/friends.routes.js';
import { createReferralsRepo } from './modules/referrals/referrals.repo.js';
import { createReferralsService } from './modules/referrals/referrals.service.js';
import { makeReferralsRoutes } from './modules/referrals/referrals.routes.js';
import { createBot } from './modules/bot/bot.js';
import { createDmQueueRepo } from './modules/bot/queue.repo.js';
import { createDmQueueService } from './modules/bot/queue.service.js';
import { createShopRepo } from './modules/shop/shop.repo.js';
import { createShopService } from './modules/shop/shop.service.js';
import { makeShopRoutes } from './modules/shop/shop.routes.js';
import { createRealtimeHub } from './modules/realtime/hub.js';
import { makeRealtimeRoutes } from './modules/realtime/realtime.routes.js';
import websocketPlugin from '@fastify/websocket';
import { createRankingsRepo } from './modules/rankings/rankings.repo.js';
import { createRankingsService } from './modules/rankings/rankings.service.js';
import { makeRankingsRoutes } from './modules/rankings/rankings.routes.js';
import { createProfileRepo } from './modules/profile/profile.repo.js';
import { createProfileService } from './modules/profile/profile.service.js';
import { makeProfileRoutes } from './modules/profile/profile.routes.js';
import { createSeasonsService } from './modules/seasons/seasons.service.js';
import { makeSeasonsRoutes } from './modules/seasons/seasons.routes.js';
import { makeRankRoutes } from './modules/rank/rank.routes.js';
import {
  createSeedRepo,
  createSeedService,
  createWipeRepo,
  createWipeService,
  createTickRepo,
  createTickService,
  createSimLogger,
  createSimObservability,
  makeSimAdminRoutes,
  SIM_CONFIG,
} from './sim/index.js';

export interface ServerDeps {
  config: Config;
  logger: Logger;
  db: Database;
}

export interface ServerHandle {
  app: Awaited<ReturnType<typeof Fastify>>;
  stopCrons: () => void;
}

export async function createServer(deps: ServerDeps): Promise<ServerHandle> {
  const app = Fastify({
    loggerInstance: deps.logger,
    trustProxy: true,
    bodyLimit: 100_000,
    disableRequestLogging: false,
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origin === 'https://fantasytoken.vercel.app') return cb(null, true);
      if (/^https:\/\/fantasytoken-[a-z0-9-]+\.vercel\.app$/.test(origin)) return cb(null, true);
      if (origin === 'http://localhost:5173') return cb(null, true);
      cb(new Error(`CORS origin not allowed: ${origin}`), false);
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['content-type', 'x-telegram-init-data'],
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(websocketPlugin);

  app.decorate('deps', deps);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      req.log.warn({ code: err.code, cause: err.cause, details: err.details }, err.message);
      return reply.status(err.httpStatus).send({
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      });
    }
    req.log.error({ err }, 'Unhandled error');
    return reply.status(500).send({ code: 'INTERNAL', message: 'Internal server error' });
  });

  // Compose modules.
  const currencyRepo = createCurrencyRepo(deps.db);
  const currency = createCurrencyService(currencyRepo);
  const usersRepo = createUsersRepo(deps.db);
  const users = createUsersService({
    repo: usersRepo,
    currency,
    welcomeBonusCoins: BigInt(deps.config.WELCOME_BONUS_COINS),
    log: deps.logger,
  });

  const cgClient = createCoinGeckoClient(
    {
      baseUrl: deps.config.COINGECKO_BASE_URL,
      ...(deps.config.COINGECKO_API_KEY !== undefined && { apiKey: deps.config.COINGECKO_API_KEY }),
    },
    deps.logger,
  );
  const tokensRepo = createTokensRepo(deps.db);
  const tokens = createTokensService({ repo: tokensRepo, client: cgClient, log: deps.logger });

  const contestsRepo = createContestsRepo(deps.db, deps.config.RAKE_PCT);
  const contests = createContestsService(contestsRepo);

  const entriesRepo = createEntriesRepo(deps.db);
  const entries = createEntriesService({ repo: entriesRepo, currency });

  // Bot DM stack — initialised before referrals so payCommissions can enqueue.
  // Skipped in test env: tests don't want long-polling to TG.
  const bot =
    deps.config.NODE_ENV === 'test'
      ? null
      : createBot({
          token: deps.config.TELEGRAM_BOT_TOKEN,
          log: deps.logger,
          ...(deps.config.MINI_APP_URL ? { miniAppUrl: deps.config.MINI_APP_URL } : {}),
          ...(deps.config.MINI_APP_WEB_URL ? { miniAppWebUrl: deps.config.MINI_APP_WEB_URL } : {}),
        });
  const dmQueueRepo = createDmQueueRepo(deps.db);
  const dmQueue = bot
    ? createDmQueueService({ repo: dmQueueRepo, bot, log: deps.logger })
    : undefined;

  // Realtime push hub — in-memory pub/sub for the WS commission toast.
  // Single-process today; promote to Redis pub/sub when scaling to N>1
  // replicas (commission produced on node A would otherwise miss a recipient
  // connected to node B).
  const realtimeHub = createRealtimeHub(deps.logger);

  // Referrals must be live before finalizeRepo — finalize calls it as a sidecar.
  const referralsRepo = createReferralsRepo(deps.db);
  const referrals = createReferralsService({
    repo: referralsRepo,
    currency,
    log: deps.logger,
    ...(dmQueue ? { dmQueue } : {}),
    ...(deps.config.MINI_APP_URL ? { miniAppUrl: deps.config.MINI_APP_URL } : {}),
    realtimeHub,
  });

  const finalizeRepo = createContestsFinalizeRepo(
    deps.db,
    currency,
    deps.config.RAKE_PCT,
    deps.logger,
    referrals,
    {
      ...(dmQueue ? { dmQueue } : {}),
      ...(deps.config.MINI_APP_URL ? { miniAppUrl: deps.config.MINI_APP_URL } : {}),
    },
  );
  const cancelContest = createCancelContest({
    db: deps.db,
    currency,
    log: deps.logger,
    ...(dmQueue ? { dmQueue } : {}),
    ...(deps.config.MINI_APP_URL ? { miniAppUrl: deps.config.MINI_APP_URL } : {}),
  });
  const tickRepo = createContestsTickRepo(deps.db, finalizeRepo, cancelContest);
  const adminTelegramId = deps.config.ADMIN_TG_IDS[0] ?? 999_001;
  const scheduler = createSchedulerService({
    db: deps.db,
    log: deps.logger,
    adminTelegramId,
  });
  const tick = createContestsTickService({
    repo: tickRepo,
    log: deps.logger,
    onContestLocked: async () => {
      await scheduler.schedule();
    },
    refreshPricesBeforeLock: async () => {
      await tokens.syncActive();
    },
    botFillEnabled: deps.config.BOT_FILL_ENABLED,
  });

  const leaderboardRepo = createLeaderboardRepo(deps.db);
  const leaderboard = createLeaderboardService({
    repo: leaderboardRepo,
    rakePct: deps.config.RAKE_PCT,
  });

  const resultRepo = createResultRepo(deps.db);
  const result = createResultService({ repo: resultRepo });

  const friendsRepo = createFriendsRepo(deps.db);
  const friends = createFriendsService({ repo: friendsRepo, log: deps.logger });
  const rankingsRepo = createRankingsRepo(deps.db);
  const rankings = createRankingsService({ repo: rankingsRepo });

  const shareRepo = createShareRepo(deps.db);
  const share = createShareService(shareRepo);

  const profileRepo = createProfileRepo(deps.db);
  const profile = createProfileService(profileRepo);

  const seasonsSvc = createSeasonsService({ db: deps.db, log: deps.logger });
  // Boot-time: ensure Season 1 exists. Idempotent.
  await seasonsSvc.ensureActive();

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(makeMeRoutes({ users, currency, entries }), { prefix: '/me' });
  await app.register(makeRankRoutes({ db: deps.db, users }), { prefix: '/me' });
  await app.register(makeReferralsRoutes({ referrals, users, friends }), { prefix: '/me' });
  await app.register(makeRealtimeRoutes({ hub: realtimeHub, users }), { prefix: '/ws' });
  await app.register(makeSeasonsRoutes({ seasons: seasonsSvc }), { prefix: '/seasons' });
  await app.register(makeTokensRoutes({ tokens }), { prefix: '/tokens' });
  await app.register(makeContestsRoutes({ contests, users, db: deps.db }), { prefix: '/contests' });
  await app.register(makeEntriesRoutes({ entries, users }), { prefix: '/contests' });
  await app.register(makeLiveRoutes({ leaderboard, users }), { prefix: '/contests' });
  await app.register(makeResultRoutes({ result, users }), { prefix: '/contests' });
  await app.register(makeFriendsRoutes({ friends, users, referrals }), { prefix: '/friends' });
  await app.register(
    makeShareRoutes({
      share,
      ...(deps.config.PUBLIC_API_URL ? { apiBaseUrl: deps.config.PUBLIC_API_URL } : {}),
    }),
    { prefix: '/share' },
  );
  await app.register(makeRankingsRoutes({ rankings, friends, users }), { prefix: '/rankings' });

  // Shop module (TZ-002): coin packages catalog + invoice creation. Bot's
  // payment hooks (preCheckout + successful_payment) wired to shop service
  // below so frontend `WebApp.openInvoice` flows credit on completion.
  const shopRepo = createShopRepo(deps.db);
  const shop = bot
    ? createShopService({
        repo: shopRepo,
        currency,
        // Adapter: shop service speaks an object-shaped API; grammY's
        // createInvoiceLink is positional. Single wrap site keeps the
        // service test-friendly (fake the BotApi without grammY peer dep).
        bot: {
          createInvoiceLink: (args) =>
            bot.api.createInvoiceLink(
              args.title,
              args.description,
              args.payload,
              args.provider_token,
              args.currency,
              args.prices,
            ),
        },
        log: deps.logger,
      })
    : null;
  if (shop) {
    await app.register(makeShopRoutes({ shop, users }), { prefix: '/shop' });
    bot!.attachPaymentHandlers({
      preCheckout: (args) => shop.validatePreCheckout(args),
      successfulPayment: async (args) => {
        await shop.creditFromPayment({
          invoicePayload: args.invoicePayload,
          totalAmount: args.totalAmount,
          telegramPaymentChargeId: args.telegramPaymentChargeId,
        });
      },
    });
  }
  await app.register(makeProfileRoutes({ profile, users }), { prefix: '/profile' });
  await app.register(makeAdminRoutes({ contests, users, cancelContest }), { prefix: '/admin' });

  // TZ-005: synthetic-users admin endpoints + tick worker — only mounted
  // when explicitly enabled via env. Behind requireAdmin too, so the env
  // flag is a coarse build-time gate and the per-request gate stays the
  // existing ADMIN_TG_IDS check.
  let stopSimTick: (() => void) | null = null;
  if (deps.config.SIM_ADMIN_ENABLED) {
    const simSeedRepo = createSeedRepo(deps.db);
    const seedSvc = createSeedService({ repo: simSeedRepo, currency });
    const wipeSvc = createWipeService({ repo: createWipeRepo(deps.db) });
    const simLog = createSimLogger(deps.db);
    const tickSvc = createTickService({
      repo: createTickRepo(deps.db),
      seedRepo: simSeedRepo,
      entries,
      currency,
      // Reuse the existing referrals repo's preCreateSignupBonuses — the
      // tick's invite_friend action is the synthetic counterpart of the
      // upsertOnAuth path that sets up real referees.
      signupBonuses: {
        preCreateSignupBonuses: (args) => referralsRepo.preCreateSignupBonuses(args),
      },
      log: simLog,
      serverLog: deps.logger,
    });
    const observability = createSimObservability(deps.db);
    await app.register(
      makeSimAdminRoutes({
        seed: seedSvc,
        wipe: wipeSvc,
        currency,
        tick: tickSvc,
        observability,
      }),
      { prefix: '/admin/sim' },
    );
    deps.logger.warn('SIM_ADMIN_ENABLED — /admin/sim routes are ACTIVE');

    // Tick cron — drives the synthetics every SIM_CONFIG.tickIntervalMs.
    // INV-7 catch-and-log lives inside scheduleEvery.
    //
    // We log every tick (heartbeat at debug level when nothing happened,
    // info when actions fired) so the cron's liveness is visible. Without
    // this it took us a confused 5 minutes to tell "tick fired but synths
    // were quiet" apart from "tick never fired" while bringing the cohort
    // up on prod.
    stopSimTick = scheduleEvery({
      intervalMs: SIM_CONFIG.tickIntervalMs,
      fn: async () => {
        const stats = await tickSvc.tick();
        const fired =
          stats.joinsAttempted > 0 || stats.invitesCreated > 0 || stats.topUpsGranted > 0;
        if (fired) {
          deps.logger.info(stats, 'sim.tick');
        } else if (stats.syntheticsScanned > 0) {
          deps.logger.info(
            {
              syntheticsScanned: stats.syntheticsScanned,
              loginsLogged: stats.loginsLogged,
              idlesLogged: stats.idlesLogged,
              durationMs: stats.durationMs,
            },
            'sim.tick.heartbeat',
          );
        }
      },
      name: 'sim.tick',
      log: deps.logger,
      runOnStart: deps.config.NODE_ENV !== 'test',
    });
  }

  // Crons. INV-7 logging is inside scheduleEvery.
  const MINUTE = 60_000;
  const HOUR = 60 * 60 * 1000;
  const stopCatalogSync = scheduleEvery({
    intervalMs: HOUR,
    fn: async () => {
      await tokens.syncCatalog({ pages: 2, perPage: 250 });
    },
    name: 'tokens.sync.catalog',
    log: deps.logger,
    runOnStart: deps.config.NODE_ENV !== 'test',
  });

  // Tick every 10s so the gap between startsAt and active state is at most 10s.
  // Cheap (one indexed query per state transition); runs locally on the API node.
  const stopTick = scheduleEvery({
    intervalMs: 10_000,
    fn: async () => {
      await tick.tick();
    },
    name: 'contests.tick',
    log: deps.logger,
    runOnStart: deps.config.NODE_ENV !== 'test',
  });

  // Active-token price sync via CoinGecko — the workhorse for tokens
  // Bybit/OKX don't carry AND for quiet markets they do (Bybit pushes
  // only on price change, so a low-volume token can sit a minute with
  // no update). Cadence: 30s tick, refresh anything stale >60s. We
  // tried 15s/25s earlier and it produced steady HTTP 429 from the
  // CoinGecko free-tier — per qa003, the limit is bursty per-second,
  // not the documented per-minute total. Steady state at this cadence
  // is <40 calls/min and stays inside the budget.
  const stopActiveSync = scheduleEvery({
    intervalMs: 30_000,
    fn: async () => {
      await tokens.syncActive();
    },
    name: 'tokens.sync.active',
    log: deps.logger,
    runOnStart: deps.config.NODE_ENV !== 'test',
  });

  // Bybit public WS — live feed for ~500 USDT-quoted spot tokens.
  // (Replaces Binance because Railway's IP is geo-blocked by Binance with
  // HTTP 451.) Subscribes to `tickers.{SYMBOL}USDT` per catalog symbol.
  // Bybit silently drops symbols it doesn't list, so we send our whole
  // catalog on connect and let the broker decide.
  // Buffered + flushed once a second through the price-feed writer.
  // Skipped in test env so unit tests don't open real network sockets.
  const priceFeedWriter =
    deps.config.NODE_ENV === 'test'
      ? null
      : createPriceFeedWriter({ repo: tokensRepo, log: deps.logger });
  // Two parallel live feeds — Bybit (primary, ~459 USDT spot pairs) and
  // OKX (secondary, ~296 pairs, fills gaps). Both push into the same
  // coalescing writer; last write wins per symbol inside the 1s flush
  // window — contention is rare because their coverage overlaps only
  // partially, and either is an acceptable source-of-truth tick.
  // Diagnosed via apps/api/scripts/check-feed-gap.ts: Bybit+OKX cover
  // ~50% of our 519-token catalog. Gate.io was tried as a 3rd feed
  // (apps/api/src/lib/gateio.ts) but Railway's egress IP gets silently
  // black-holed by Gate's WS endpoint — see qa006 for the trace. The
  // remaining ~50% of the catalog is served by the CoinGecko cron at
  // 60s cadence.
  let bybitHandle: { stop: () => void } | null = null;
  let okxHandle: { stop: () => void } | null = null;
  if (priceFeedWriter !== null) {
    void (async () => {
      try {
        const symbols = await tokensRepo.listAllCatalogSymbols();
        bybitHandle = startBybitFeed({
          log: deps.logger,
          symbols,
          onUpdate: (updates) => priceFeedWriter.push(updates),
        });
        okxHandle = startOkxFeed({
          log: deps.logger,
          symbols,
          onUpdate: (updates) => priceFeedWriter.push(updates),
        });
      } catch (err) {
        deps.logger.warn({ err }, 'price-feeds bootstrap failed');
      }
    })();
  }

  const stopScheduler = scheduleEvery({
    intervalMs: MINUTE,
    fn: async () => {
      await scheduler.schedule();
    },
    name: 'contests.scheduler',
    log: deps.logger,
    runOnStart: deps.config.NODE_ENV !== 'test',
  });

  // Bot DM drain: aggregate pending commission notifications per recipient
  // (1 DM/recipient/hour cap, REFERRAL_SYSTEM.md §11.2). 1-min cadence so a
  // burst of commissions still gets coalesced into one message in steady state.
  // Skipped in test env (no bot to send through).
  const stopDmDrain = dmQueue
    ? scheduleEvery({
        intervalMs: MINUTE,
        fn: async () => {
          const r = await dmQueue.drain();
          if (r.sentCount > 0 || r.failedCount > 0) {
            deps.logger.info(r, 'bot.dm.drain');
          }
        },
        name: 'bot.dm.drain',
        log: deps.logger,
        runOnStart: deps.config.NODE_ENV !== 'test',
      })
    : () => {};

  // Bot long-polling — runs in the background; if it ever crashes the API
  // server stays up. Single-replica deploy on Railway, so no leader election
  // needed. Move to webhook mode if scaling to N>1 replicas.
  if (bot) {
    const botInstance = bot;
    void botInstance.start().catch((err) => {
      deps.logger.error({ err }, 'bot.start failed (DMs will not send)');
    });
    // Best-effort post-start setup (slash commands + persistent menu
    // button). Run async after a small delay so bot.start has had a
    // chance to authenticate; failures are logged inside setup().
    setTimeout(() => {
      void botInstance.setup();
    }, 2_000);
  }

  // Welcome bonus expiry: claw back $25 from users who never played within
  // 7 days. Daily cadence is plenty — the underlying SQL filter is cheap
  // (indexed on welcome_credited_at via the planner's seq scan over a small
  // user table; revisit if it shows up in profiling). Skipped in test env so
  // unit tests never trigger real currency mutations.
  const stopWelcomeExpiry = scheduleEvery({
    intervalMs: 24 * HOUR,
    fn: async () => {
      const r = await users.expireUnusedWelcome();
      if (r.expiredCount > 0) {
        deps.logger.info({ expiredCount: r.expiredCount }, 'users.expireUnusedWelcome');
      }
    },
    name: 'users.welcome.expiry',
    log: deps.logger,
    runOnStart: deps.config.NODE_ENV !== 'test',
  });

  // Seasons are calendar-month aligned. No cron — rollover happens lazily inside
  // seasonsSvc.ensureActive() on the read path (currently /seasons/current and
  // contests.finalize). Boot-time call above ensures Season N for current month
  // exists before first request.

  return {
    app,
    stopCrons: () => {
      stopCatalogSync();
      stopTick();
      stopActiveSync();
      stopScheduler();
      stopWelcomeExpiry();
      stopDmDrain();
      if (stopSimTick) stopSimTick();
      if (bybitHandle) bybitHandle.stop();
      if (okxHandle) okxHandle.stop();
      if (priceFeedWriter) priceFeedWriter.stop();
      if (bot) void bot.stop();
      realtimeHub.closeAll();
    },
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: ServerDeps;
  }
}
