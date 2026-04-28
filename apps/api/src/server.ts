import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import { AppError } from './lib/errors.js';
import type { Logger } from './logger.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { makeMeRoutes } from './modules/me/me.routes.js';
import { createCurrencyRepo } from './modules/currency/currency.repo.js';
import { createCurrencyService } from './modules/currency/currency.service.js';
import { createUsersRepo } from './modules/users/users.repo.js';
import { createUsersService } from './modules/users/users.service.js';

export interface ServerDeps {
  config: Config;
  logger: Logger;
  db: Database;
}

export async function createServer(deps: ServerDeps) {
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

  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(makeMeRoutes({ users, currency }), { prefix: '/me' });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: ServerDeps;
  }
}
