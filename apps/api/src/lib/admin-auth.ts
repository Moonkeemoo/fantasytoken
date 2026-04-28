import type { FastifyReply, FastifyRequest } from 'fastify';
import type { TelegramUser } from '@fantasytoken/shared';
import { errors } from './errors.js';
import { requireTelegramUser } from './auth-context.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by requireAdmin preHandler — admin routes can read directly. */
    adminUser?: TelegramUser;
  }
}

/**
 * Interim admin gate (MVP §6.2). Validates initData (INV-1) AND checks
 * user.id ∈ ADMIN_TG_IDS. Stashes parsed user on req for downstream handlers.
 */
export async function requireAdmin(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const user = requireTelegramUser(req);
  const allow = req.server.deps.config.ADMIN_TG_IDS;
  if (!allow.includes(user.id)) {
    // INV-7 / INV-8: log telegramId only.
    req.log.warn({ telegramId: user.id }, 'admin access denied');
    throw errors.forbidden();
  }
  req.adminUser = user;
}
