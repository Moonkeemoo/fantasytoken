import pino from 'pino';
import type { Config } from './config.js';

/**
 * Pino logger with PII redaction (INV-8).
 * Wallet addresses, tokens, telegram_id, initData must never appear in plaintext.
 * Add new sensitive paths here when introducing fields.
 */
export function createLogger(config: Config) {
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-telegram-init-data"]',
        '*.telegramBotToken',
        '*.TELEGRAM_BOT_TOKEN',
        '*.walletAddress',
        '*.wallet_address',
        '*.initData',
        '*.password',
      ],
      censor: '[REDACTED]',
    },
    transport:
      config.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
          }
        : undefined,
  });
}

export type Logger = ReturnType<typeof createLogger>;
