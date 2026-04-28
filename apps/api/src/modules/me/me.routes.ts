import type { FastifyPluginAsync } from 'fastify';
import { errors } from '../../lib/errors.js';
import { parseUserFromInitData, validateInitData } from '../../lib/telegram-auth.js';
import type { UsersService } from '../users/users.service.js';
import type { CurrencyService } from '../currency/currency.service.js';

export interface MeRoutesDeps {
  users: UsersService;
  currency: CurrencyService;
}

/**
 * GET /me — validates initData, upserts user (welcome bonus on first), returns balance.
 *
 * INV-1: HMAC-SHA256 over initData using bot token.
 * INV-7: caught failures throw AppError (logged + mapped).
 * INV-8: never log raw initData — pino redact paths cover it.
 * INV-9: bonus credit goes through CurrencyService.transact().
 */
export function makeMeRoutes(deps: MeRoutesDeps): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async (req) => {
      const initData = req.headers['x-telegram-init-data'];
      if (typeof initData !== 'string' || initData.length === 0) {
        throw errors.missingInitData();
      }
      const valid = validateInitData(initData, app.deps.config.TELEGRAM_BOT_TOKEN);
      if (!valid) throw errors.invalidInitData();

      const tgUser = parseUserFromInitData(initData);
      if (!tgUser) throw errors.invalidInitData();

      const upsert = await deps.users.upsertOnAuth({
        telegramId: tgUser.id,
        ...(tgUser.first_name !== undefined && { firstName: tgUser.first_name }),
        ...(tgUser.username !== undefined && { username: tgUser.username }),
      });

      return {
        user: {
          id: tgUser.id,
          first_name: tgUser.first_name ?? '',
          last_name: tgUser.last_name,
          username: tgUser.username,
          language_code: tgUser.language_code,
        },
        balanceCents: Number(upsert.balanceCents),
      };
    });
  };
}
