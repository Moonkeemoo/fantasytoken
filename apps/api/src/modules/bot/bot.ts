import { Bot } from 'grammy';
import type { Logger } from '../../logger.js';

export interface BotInstance {
  /** grammY bot — exposed so the queue service can call bot.api.sendMessage. */
  api: Bot['api'];
  /** Begin long-polling for incoming updates. Non-blocking; returns the
   * promise so callers can attach a global error handler. */
  start(): Promise<void>;
  /** One-shot setup: register slash-commands + the persistent menu
   * button so the app shows up in TG's "recent apps" list and the
   * blue button next to the chat input opens it in one tap. Called
   * after start() succeeds (best-effort, errors are logged). */
  setup(): Promise<void>;
  /** Graceful stop. Safe to call even if start() never resolved. */
  stop(): Promise<void>;
}

export interface CreateBotArgs {
  token: string;
  log: Logger;
  /** URL of the mini-app (e.g. https://fantasytoken.app) — used for the
   * web_app inline button on /start AND the persistent chat menu
   * button. Must be HTTPS. */
  miniAppUrl?: string;
}

/**
 * Initialise grammY with /start + /play handlers that deep-link into the
 * mini-app. Outbound DMs (commission notifications) go through queue.service
 * → this.api.sendMessage; we don't add per-user state here.
 *
 * Long-polling runs in the same Node process as Fastify. Single-replica
 * deploy means no leader election needed; if you scale to N>1 replicas,
 * switch to webhook mode (one container takes the webhook, others stay quiet).
 */
export function createBot({ token, log, miniAppUrl }: CreateBotArgs): BotInstance {
  const bot = new Bot(token);

  /** Reusable inline keyboard for the "Open app" CTA. Lets us reuse the
   * same button across /start and /play so muscle memory works. */
  const openAppKeyboard = miniAppUrl
    ? { inline_keyboard: [[{ text: '🎯 Open app', web_app: { url: miniAppUrl } }]] }
    : { inline_keyboard: [] };

  bot.command('start', async (ctx) => {
    // Welcome message + deep-link to the mini-app. The startapp param is
    // already on the original t.me/<bot>/<app>?startapp=ref_X URL the user
    // followed — opening the app from this button preserves their session
    // but loses the start_param, so the welcome text doubles as a friendly
    // landing for users who came via the bot directly.
    await ctx.reply(
      '👋 Welcome to *Fantasy Token League*\\!\n\n' +
        'Pick a 5\\-coin lineup, beat the room, claim the pool\\.\n\n' +
        '_Tip: tap the blue *Play* button below the message bar to open the app any time\\._',
      {
        parse_mode: 'MarkdownV2',
        reply_markup: openAppKeyboard,
      },
    );
  });

  // /play — quick-launch from the typeahead bar without scrolling for /start.
  bot.command('play', async (ctx) => {
    await ctx.reply('🎯 Tap below to jump into the lobby\\.', {
      parse_mode: 'MarkdownV2',
      reply_markup: openAppKeyboard,
    });
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
    async setup() {
      // 1. Slash-command list — shows up in the typeahead and the bot's
      // command menu (≡ icon next to the message bar). Keeps the command
      // surface discoverable without users having to remember names.
      try {
        await bot.api.setMyCommands([
          { command: 'play', description: 'Open Fantasy Token' },
          { command: 'start', description: 'Welcome screen' },
        ]);
      } catch (err) {
        log.warn({ err }, 'bot.setup setMyCommands failed');
      }

      // 2. Persistent menu button — the BIG difference for retention.
      // Without this, users have to find the bot in their chat list +
      // remember to /start every time. With the web_app menu button:
      //   • the blue "Play" button is always one tap away in the chat
      //   • opening it via that button registers the mini-app in TG's
      //     "Recent Apps" tray so users find it from the home/main menu
      //   • a fresh chat shows it immediately on first /start
      // No-op (logged) if miniAppUrl is unset (dev / unconfigured env).
      if (!miniAppUrl) {
        log.warn('bot.setup skipping menu button — MINI_APP_URL not configured');
        return;
      }
      try {
        await bot.api.setChatMenuButton({
          menu_button: {
            type: 'web_app',
            text: 'Play',
            web_app: { url: miniAppUrl },
          },
        });
        log.info({ miniAppUrl }, 'bot.setup menu button installed');
      } catch (err) {
        log.warn({ err, miniAppUrl }, 'bot.setup setChatMenuButton failed');
      }
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
