import type { FastifyPluginAsync } from 'fastify';

/**
 * Liveness probe. Reference implementation of the module convention —
 * see `src/modules/CLAUDE.md`. A real domain has routes + service + repo;
 * health is route-only on purpose.
 */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));
};
