import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import { AppError } from './lib/errors.js';
import type { Logger } from './logger.js';
import { healthRoutes } from './modules/health/health.routes.js';

export interface ServerDeps {
  config: Config;
  logger: Logger;
  db: Database;
}

export async function createServer(deps: ServerDeps) {
  const app = Fastify({
    loggerInstance: deps.logger,
    trustProxy: true,
    bodyLimit: 100_000, // 100 KB; portfolio payloads are tiny.
    disableRequestLogging: false,
  });

  await app.register(helmet);
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  app.decorate('deps', deps);

  // INV-7: every caught error leaves a structured trace before responding.
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      req.log.warn({ code: err.code, cause: err.cause }, err.message);
      return reply.status(err.httpStatus).send({ code: err.code, message: err.message });
    }
    req.log.error({ err }, 'Unhandled error');
    return reply.status(500).send({ code: 'INTERNAL', message: 'Internal server error' });
  });

  await app.register(healthRoutes, { prefix: '/health' });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: ServerDeps;
  }
}
