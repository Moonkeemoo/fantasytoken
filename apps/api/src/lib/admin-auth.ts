import type { FastifyReply, FastifyRequest } from 'fastify';
import { errors } from './errors.js';
import { parseUserFromInitData, validateInitData } from './telegram-auth.js';

/**
 * Interim admin gate (MVP §6.2 / ADR-pending). Replaces with full admin model in V2.
 *
 * Validates initData (INV-1) AND checks user.id ∈ ADMIN_TG_IDS.
 *
 * Usage:
 *   await app.register(async (admin) => {
 *     admin.addHook('preHandler', requireAdmin);
 *     admin.post('/contests', ...);
 *   }, { prefix: '/admin' });
 */
export async function requireAdmin(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const initData = req.headers['x-telegram-init-data'];
  if (typeof initData !== 'string' || initData.length === 0) {
    throw errors.missingInitData();
  }
  const valid = validateInitData(initData, req.server.deps.config.TELEGRAM_BOT_TOKEN);
  if (!valid) throw errors.invalidInitData();

  const user = parseUserFromInitData(initData);
  if (!user) throw errors.invalidInitData();

  const allow = req.server.deps.config.ADMIN_TG_IDS;
  if (!allow.includes(user.id)) {
    // INV-7: log denied admin attempt with user id (NOT initData).
    req.log.warn({ telegramId: user.id }, 'admin access denied');
    throw errors.forbidden();
  }
}
