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
        ...(tgUser.photo_url !== undefined && { photoUrl: tgUser.photo_url }),
      });

      return {
        user: {
          id: tgUser.id,
          first_name: tgUser.first_name ?? '',
          last_name: tgUser.last_name,
          username: tgUser.username,
          photo_url: tgUser.photo_url,
          language_code: tgUser.language_code,
        },
        balanceCents: Number(upsert.balanceCents),
        tutorialDone: upsert.tutorialDoneAt !== null,
      };
    });

    /**
     * POST /me/tutorial-done — marks the caller as having completed onboarding.
     * Idempotent (calling again keeps the original timestamp). FE calls this
     * once on tutorial finish/skip; on success it can also write the localStorage
     * cache for instant routing on the next cold start.
     */
    app.post('/tutorial-done', async (req) => {
      const initData = req.headers['x-telegram-init-data'];
      if (typeof initData !== 'string' || initData.length === 0) {
        throw errors.missingInitData();
      }
      const valid = validateInitData(initData, app.deps.config.TELEGRAM_BOT_TOKEN);
      if (!valid) throw errors.invalidInitData();
      const tgUser = parseUserFromInitData(initData);
      if (!tgUser) throw errors.invalidInitData();

      // Resolve to internal user id via upsert (creates the row if somehow
      // missing; cheap on the existing-user path).
      const upsert = await deps.users.upsertOnAuth({
        telegramId: tgUser.id,
        ...(tgUser.first_name !== undefined && { firstName: tgUser.first_name }),
      });
      await deps.users.markTutorialDone(upsert.userId);
      return { tutorialDone: true as const };
    });
  };
}
