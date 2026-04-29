import type { FastifyPluginAsync } from 'fastify';
import type { SeasonsService } from './seasons.service.js';

export interface SeasonsRoutesDeps {
  seasons: SeasonsService;
}

export function makeSeasonsRoutes(deps: SeasonsRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.get('/current', async () => {
      // Read-path triggers calendar rollover if the active season's month is past.
      const s = await deps.seasons.ensureActive();
      const daysLeft = Math.max(0, Math.ceil((s.endsAt.getTime() - Date.now()) / (24 * 3600_000)));
      return {
        id: s.id,
        number: s.number,
        name: s.name,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        daysLeft,
      };
    });
  };
}
