import { createHmac } from 'node:crypto';

import { TelegramUser } from '@fantasytoken/shared';

// Re-export the shared zod-derived type so callers in this package can keep
// importing TelegramUser from telegram-auth.ts (no churn).
export type { TelegramUser };

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

/**
 * Parse user from validated initData. Caller MUST validate first.
 *
 * Returns null on parse failure (malformed JSON, schema mismatch, missing user).
 * Caller should map null → AUTH error (INV-7: routes log via global handler;
 * the silent return here is the documented contract).
 */
export function parseUserFromInitData(initData: string): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const userJson = params.get('user');
  if (!userJson) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(userJson);
  } catch {
    return null;
  }
  const parsed = TelegramUser.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
