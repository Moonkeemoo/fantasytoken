import type { FastifyRequest } from 'fastify';
import type { TelegramUser } from '@fantasytoken/shared';
import { errors } from './errors.js';
import { parseUserFromInitData, validateInitData } from './telegram-auth.js';

/**
 * Validate initData (INV-1) and return the parsed Telegram user.
 * Throws AppError on missing/invalid data — use when auth is required.
 */
export function requireTelegramUser(req: FastifyRequest): TelegramUser {
  const initData = req.headers['x-telegram-init-data'];
  if (typeof initData !== 'string' || initData.length === 0) {
    throw errors.missingInitData();
  }
  if (!validateInitData(initData, req.server.deps.config.TELEGRAM_BOT_TOKEN)) {
    throw errors.invalidInitData();
  }
  const user = parseUserFromInitData(initData);
  if (!user) throw errors.invalidInitData();
  return user;
}

/**
 * Validate initData and return the parsed user, OR undefined if missing/invalid.
 * Use when auth is OPTIONAL (e.g. anonymous browsing).
 */
export function tryTelegramUser(req: FastifyRequest): TelegramUser | undefined {
  const initData = req.headers['x-telegram-init-data'];
  if (typeof initData !== 'string' || initData.length === 0) return undefined;
  if (!validateInitData(initData, req.server.deps.config.TELEGRAM_BOT_TOKEN)) return undefined;
  return parseUserFromInitData(initData) ?? undefined;
}
