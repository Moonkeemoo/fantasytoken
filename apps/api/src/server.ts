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

  const contestsRepo = createContestsRepo(deps.db);
  const contests = createContestsService(contestsRepo);

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(makeMeRoutes({ users, currency }), { prefix: '/me' });
  await app.register(makeTokensRoutes({ tokens }), { prefix: '/tokens' });
  await app.register(makeContestsRoutes({ contests, users }), { prefix: '/contests' });
  await app.register(makeAdminRoutes({ contests, users }), { prefix: '/admin' });

  // Crons. INV-7 logging is inside scheduleEvery.
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

  return {
    app,
    stopCrons: () => {
      stopCatalogSync();
    },
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: ServerDeps;
  }
}
