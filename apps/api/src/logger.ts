import pino from 'pino';
import type { Config } from './config.js';

/**
 * Pino logger with PII redaction (INV-8).
 * Wallet addresses, tokens, telegram_id, initData must never appear in plaintext.
 * Add new sensitive paths here when introducing fields.
 */
export function createLogger(config: Config) {
  const base: pino.LoggerOptions = {
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
  };

  if (config.NODE_ENV === 'development') {
    base.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
    };
  }

  return pino(base);
}

export type Logger = ReturnType<typeof createLogger>;
