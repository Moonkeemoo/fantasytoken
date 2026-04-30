import type { FastifyPluginAsync } from 'fastify';
import {
  type CoinPackagesResponse,
  InvoiceCreateBody,
  type InvoiceCreateResponse,
} from '@fantasytoken/shared';
import { requireTelegramUser, upsertArgsFromTgUser } from '../../lib/auth-context.js';
import type { UsersService } from '../users/users.service.js';
import type { ShopService } from './shop.service.js';

export interface ShopRoutesDeps {
  shop: ShopService;
  users: UsersService;
}

export function makeShopRoutes(deps: ShopRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    /**
     * GET /shop/packages — active coin packages, sorted. Public-ish (no
     * auth required to read pricing) but we keep the initData header check
     * via app.preHandler to stay consistent.
     */
    app.get('/packages', async () => {
      const packages = await deps.shop.listPackages();
      const response: CoinPackagesResponse = { packages };
      return response;
    });

    /**
     * POST /shop/invoice — generate a TG invoice link for the chosen package.
     * The link is one-time-use and embeds the caller's internal userId in
     * the payload so the webhook handler can credit the right user without
     * a TG-id lookup at credit time.
     */
    app.post('/invoice', async (req) => {
      const tg = requireTelegramUser(req);
      const me = await deps.users.upsertOnAuth(upsertArgsFromTgUser(tg));
      const body = InvoiceCreateBody.parse(req.body);
      const result = await deps.shop.createInvoice({
        packageId: body.packageId,
        internalUserId: me.userId,
      });
      const response: InvoiceCreateResponse = { invoiceLink: result.invoiceLink };
      return response;
    });
  };
}
