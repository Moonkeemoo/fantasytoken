import { Bot } from 'grammy';
import type { Logger } from '../../logger.js';

export interface BotInstance {
  /** grammY bot — exposed so the queue service can call bot.api.sendMessage. */
  api: Bot['api'];
  /** Begin long-polling for incoming updates. Non-blocking; returns the
   * promise so callers can attach a global error handler. */
  start(): Promise<void>;
  /** Graceful stop. Safe to call even if start() never resolved. */
  stop(): Promise<void>;
}

export interface CreateBotArgs {
  token: string;
  log: Logger;
  /** URL of the mini-app (e.g. https://fantasytoken.app) — used for the
   * web_app inline button on /start. */
  miniAppUrl?: string;
}

/**
 * Initialise grammY with a single /start handler that deep-links into the
 * mini-app. Outbound DMs (commission notifications) go through queue.service
 * → this.api.sendMessage; we don't add per-user state here.
 *
 * Long-polling runs in the same Node process as Fastify. Single-replica
 * deploy means no leader election needed; if you scale to N>1 replicas,
 * switch to webhook mode (one container takes the webhook, others stay quiet).
 */
export function createBot({ token, log, miniAppUrl }: CreateBotArgs): BotInstance {
  const bot = new Bot(token);

  bot.command('start', async (ctx) => {
    // Welcome message + deep-link to the mini-app. The startapp param is
    // already on the original t.me/<bot>/<app>?startapp=ref_X URL the user
    // followed — opening the app from this button preserves their session
    // but loses the start_param, so the welcome text doubles as a friendly
    // landing for users who came via the bot directly.
    await ctx.reply(
      '👋 Welcome to *Fantasy Token League*\\!\n\n' +
        'Pick a 5\\-coin lineup, beat the room, claim the pool\\.',
      {
        parse_mode: 'MarkdownV2',
        reply_markup: miniAppUrl
          ? { inline_keyboard: [[{ text: '🎯 Open app', web_app: { url: miniAppUrl } }]] }
          : { inline_keyboard: [] },
      },
    );
  });

  // Surface unhandled errors to pino instead of letting grammY default to console.
  bot.catch((err) => {
    log.error({ err: err.error, ctx: err.ctx?.update?.update_id }, 'bot error');
  });

  return {
    get api() {
      return bot.api;
    },
    async start() {
      await bot.start({
        onStart: (info) => {
          log.info({ username: info.username, id: info.id }, 'bot.start');
        },
      });
    },
    async stop() {
      try {
        await bot.stop();
      } catch (err) {
        log.warn({ err }, 'bot.stop failed (already stopped?)');
      }
    },
  };
}
