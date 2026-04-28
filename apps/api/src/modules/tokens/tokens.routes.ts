import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { TokenList } from '@fantasytoken/shared';
import type { TokensService } from './tokens.service.js';

const QuerySchema = z.object({
  page: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(250).default(50),
});

const SearchQuery = z.object({
  q: z.string().min(1).max(40),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export interface TokensRoutesDeps {
  tokens: TokensService;
}

export function makeTokensRoutes(deps: TokensRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async (req) => {
      const q = QuerySchema.parse(req.query);
      const page = await deps.tokens.listPage({ page: q.page, limit: q.limit });
      const response: typeof TokenList._type = {
        items: page.items,
        page: q.page,
        total: page.total,
      };
      return response;
    });

    app.get('/search', async (req) => {
      const q = SearchQuery.parse(req.query);
      const items = await deps.tokens.search({ q: q.q, limit: q.limit });
      return { items };
    });
  };
}
