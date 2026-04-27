import type { FastifyPluginAsync } from 'fastify';
import { errors } from '../../lib/errors.js';
import { parseUserFromInitData, validateInitData } from '../../lib/telegram-auth.js';

/**
 * GET /me — returns the Telegram user from validated initData.
 *
 * INV-1: HMAC-SHA256 over initData using bot token. Reject if invalid or missing.
 * INV-7: caught failures throw AppError (logged + mapped) instead of returning silently.
 * INV-8: never log raw initData — pino redact paths cover it.
 */
export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const initData = req.headers['x-telegram-init-data'];
    if (typeof initData !== 'string' || initData.length === 0) {
      throw errors.missingInitData();
    }

    const valid = validateInitData(initData, app.deps.config.TELEGRAM_BOT_TOKEN);
    if (!valid) {
      throw errors.invalidInitData();
    }

    const user = parseUserFromInitData(initData);
    if (!user) {
      throw errors.invalidInitData();
    }

    return { user };
  });
};
