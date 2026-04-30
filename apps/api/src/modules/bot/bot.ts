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
  /** Telegram deep-link to the mini-app, e.g. https://t.me/<bot>/<short>.
   * Used as a fallback for the inline "Open app" button when no direct
   * frontend URL is configured. */
  miniAppUrl?: string;
  /** Direct HTTPS URL of the deployed mini-app frontend. Required for
   * setChatMenuButton.web_app (the persistent blue Play button) and for
   * inline `web_app: { url }` buttons that open in TG's WebView without
   * a t.me round-trip. When unset we fall back to miniAppUrl. */
  miniAppWebUrl?: string;
  /** Mini-app short_name registered in @BotFather (the `<short>` portion
   * of `https://t.me/<bot>/<short>`). Used to synthesise a fallback
   * deep-link when MINI_APP_URL isn't configured. */
  miniAppShortName?: string;
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
/**
 * Telegram Bot API rejects `web_app: { url: ... }` when the URL is a
 * t.me deep-link — the `web_app` type expects the HTTPS URL of the
 * actual frontend (the one registered via /newapp in @BotFather).
 * For t.me/<bot>/<short> links we fall back to a regular `url:` button
 * which TG clients resolve client-side back into a mini-app launch.
 *
 * Net effect: button always renders, regardless of whether the env
 * gives us the t.me alias or the raw frontend URL.
 */
function openAppButton(
  url: string,
): { text: string; url: string } | { text: string; web_app: { url: string } } {
  if (/^https:\/\/t\.me\//i.test(url)) {
    return { text: '🎯 Open app', url };
  }
  return { text: '🎯 Open app', web_app: { url } };
}

export function createBot({
  token,
  log,
  miniAppUrl,
  miniAppWebUrl,
  miniAppShortName = 'fantasytoken',
}: CreateBotArgs): BotInstance {
  const bot = new Bot(token);

  /**
   * Resolve the URL for inline "Open app" buttons. Priority:
   *   1. miniAppWebUrl — direct frontend URL → uses `web_app:` button
   *      (in-WebView open, smoothest UX, no round-trip).
   *   2. miniAppUrl — t.me deep-link → uses `url:` button (TG resolves
   *      client-side back into a mini-app launch).
   *   3. Synthetic t.me alias from botInfo.username + short_name.
   *   4. Empty keyboard if all unavailable.
   * Resolved lazily inside the command handler so botInfo (populated
   * only after bot.start()) is available when we evaluate it.
   */
  function buildOpenAppKeyboard() {
    if (miniAppWebUrl) {
      return { inline_keyboard: [[openAppButton(miniAppWebUrl)]] };
    }
    const fallback =
      miniAppUrl ??
      (bot.botInfo?.username ? `https://t.me/${bot.botInfo.username}/${miniAppShortName}` : null);
    return fallback ? { inline_keyboard: [[openAppButton(fallback)]] } : { inline_keyboard: [] };
  }

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
        reply_markup: buildOpenAppKeyboard(),
      },
    );
  });

  // /play — quick-launch from the typeahead bar without scrolling for /start.
  bot.command('play', async (ctx) => {
    await ctx.reply('🎯 Tap below to jump into the lobby\\.', {
      parse_mode: 'MarkdownV2',
      reply_markup: buildOpenAppKeyboard(),
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

      // 2. Persistent menu button — the BIG difference for retention:
      //   • blue "Play" button is always one tap away in the chat
      //   • opening it registers the mini-app in TG's "Recent Apps" tray
      //   • a fresh chat shows it immediately, no /start required
      // setChatMenuButton.web_app requires the *raw* frontend HTTPS URL
      // (Vercel/Railway deploy) — Telegram silently rejects t.me aliases.
      // We use miniAppWebUrl for this; if unset, fall back to a commands
      // hamburger so the slash-command list is at least discoverable.
      log.info(
        {
          miniAppUrl: miniAppUrl ?? null,
          miniAppWebUrl: miniAppWebUrl ?? null,
        },
        'bot.setup resolving menu button URL',
      );
      if (!miniAppWebUrl) {
        try {
          await bot.api.setChatMenuButton({ menu_button: { type: 'commands' } });
          log.info(
            'bot.setup menu button → commands list (MINI_APP_WEB_URL not configured — set the raw frontend URL to enable the Play button)',
          );
        } catch (err) {
          log.warn({ err }, 'bot.setup setChatMenuButton(commands) failed');
        }
        return;
      }
      try {
        await bot.api.setChatMenuButton({
          menu_button: {
            type: 'web_app',
            text: 'Play',
            web_app: { url: miniAppWebUrl },
          },
        });
        log.info({ url: miniAppWebUrl }, 'bot.setup menu button installed');
      } catch (err) {
        log.warn(
          { err, url: miniAppWebUrl },
          'bot.setup setChatMenuButton failed — falling back to commands',
        );
        try {
          await bot.api.setChatMenuButton({ menu_button: { type: 'commands' } });
        } catch (err2) {
          log.warn({ err: err2 }, 'bot.setup commands fallback also failed');
        }
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
