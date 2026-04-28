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
import { createReplenishService } from './modules/contests/contests.replenish.js';
import { createFriendsRepo } from './modules/friends/friends.repo.js';
import { createFriendsService } from './modules/friends/friends.service.js';
import { makeFriendsRoutes } from './modules/friends/friends.routes.js';
import { createRankingsRepo } from './modules/rankings/rankings.repo.js';
import { createRankingsService } from './modules/rankings/rankings.service.js';
import { makeRankingsRoutes } from './modules/rankings/rankings.routes.js';

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

  app.decorate('deps', deps);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      req.log.warn({ code: err.code, cause: err.cause }, err.message);
      return reply.status(err.httpStatus).send({ code: err.code, message: err.message });
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
    welcomeBonusCents: BigInt(deps.config.WELCOME_BONUS_USD_CENTS),
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

  const finalizeRepo = createContestsFinalizeRepo(deps.db, currency, deps.config.RAKE_PCT);
  const cancelContest = createCancelContest({ db: deps.db, currency, log: deps.logger });
  const tickRepo = createContestsTickRepo(deps.db, finalizeRepo, cancelContest);
  const tick = createContestsTickService({
    repo: tickRepo,
    log: deps.logger,
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

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(makeMeRoutes({ users, currency }), { prefix: '/me' });
  await app.register(makeTokensRoutes({ tokens }), { prefix: '/tokens' });
  await app.register(makeContestsRoutes({ contests, users }), { prefix: '/contests' });
  await app.register(makeEntriesRoutes({ entries, users }), { prefix: '/contests' });
  await app.register(makeLiveRoutes({ leaderboard, users }), { prefix: '/contests' });
  await app.register(makeResultRoutes({ result, users }), { prefix: '/contests' });
  await app.register(makeFriendsRoutes({ friends, users }), { prefix: '/friends' });
  await app.register(makeRankingsRoutes({ rankings, friends, users }), { prefix: '/rankings' });
  await app.register(makeAdminRoutes({ contests, users, cancelContest }), { prefix: '/admin' });

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

  const stopTick = scheduleEvery({
    intervalMs: MINUTE,
    fn: async () => {
      await tick.tick();
    },
    name: 'contests.tick',
    log: deps.logger,
    runOnStart: deps.config.NODE_ENV !== 'test',
  });

  const stopActiveSync = scheduleEvery({
    intervalMs: 5 * MINUTE,
    fn: async () => {
      await tokens.syncActive();
    },
    name: 'tokens.sync.active',
    log: deps.logger,
    runOnStart: deps.config.NODE_ENV !== 'test',
  });

  const adminTelegramId = deps.config.ADMIN_TG_IDS[0] ?? 999_001;
  const replenish = createReplenishService({
    db: deps.db,
    log: deps.logger,
    adminTelegramId,
  });

  const stopReplenish = scheduleEvery({
    intervalMs: MINUTE,
    fn: async () => {
      await replenish.replenish();
    },
    name: 'contests.replenish',
    log: deps.logger,
    runOnStart: deps.config.NODE_ENV !== 'test',
  });

  return {
    app,
    stopCrons: () => {
      stopCatalogSync();
      stopTick();
      stopActiveSync();
      stopReplenish();
    },
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: ServerDeps;
  }
}
