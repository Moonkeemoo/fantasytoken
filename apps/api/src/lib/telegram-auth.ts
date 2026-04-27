import { createHmac } from 'node:crypto';

/**
 * Validate Telegram Mini App initData via HMAC-SHA256 (INV-1).
 * Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * The bot token is the secret. INV-1 / INV-8: never expose to frontend, never log.
 */
export function validateInitData(initData: string, botToken: string): boolean {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return timingSafeEqual(computed, hash);
}

/** Constant-time string compare to avoid timing side-channel. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

/**
 * Parse user from validated initData. Caller MUST validate first.
 * Returns null on parse failure; caller should log and reject (INV-7).
 */
export function parseUserFromInitData(initData: string): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const userJson = params.get('user');
  if (!userJson) return null;
  try {
    return JSON.parse(userJson) as TelegramUser;
  } catch {
    return null;
  }
}
