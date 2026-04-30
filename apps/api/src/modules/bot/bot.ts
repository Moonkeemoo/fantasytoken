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
  /** Mini-app short_name registered in @BotFather (the `<short>` portion
   * of `https://t.me/<bot>/<short>`). Used to synthesise a fallback
   * deep-link when MINI_APP_URL isn't configured — that way buttons
   * always render even on a half-configured environment. */
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
  miniAppShortName = 'fantasytoken',
}: CreateBotArgs): BotInstance {
  const bot = new Bot(token);

  /**
   * Resolve the URL to use for "Open app" buttons. Priority:
   *   1. Explicit MINI_APP_URL env (most flexible — can be either the
   *      raw frontend HTTPS URL or a t.me alias).
   *   2. Synthetic t.me alias built from the bot's own username and
   *      the configured mini-app short_name. Available only after
   *      bot.start() resolves bot.botInfo.
   *   3. Empty inline_keyboard — the bot replies with text only.
   *
   * Computed lazily inside command handlers so we always use the latest
   * resolved value (botInfo isn't populated until start completes).
   */
  function effectiveMiniAppUrl(): string | null {
    if (miniAppUrl) return miniAppUrl;
    const username = bot.botInfo?.username;
    if (username && miniAppShortName) return `https://t.me/${username}/${miniAppShortName}`;
    return null;
  }

  function buildOpenAppKeyboard() {
    const url = effectiveMiniAppUrl();
    return url ? { inline_keyboard: [[openAppButton(url)]] } : { inline_keyboard: [] };
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

      // 2. Persistent menu button — the BIG difference for retention.
      // Without this, users have to find the bot in their chat list +
      // remember to /start every time. With the web_app menu button:
      //   • the blue "Play" button is always one tap away in the chat
      //   • opening it via that button registers the mini-app in TG's
      //     "Recent Apps" tray so users find it from the home/main menu
      //   • a fresh chat shows it immediately on first /start
      // Telegram only accepts the raw frontend URL for menu_button.web_app
      // (a t.me/<bot>/<short> deep-link is rejected). When the effective
      // URL is the t.me variant we fall back to type:'commands' — the
      // slash-command list (set above) becomes the visible menu instead
      // of text saying nothing's there.
      const url = effectiveMiniAppUrl();
      log.info(
        {
          envUrl: miniAppUrl ?? null,
          effectiveUrl: url,
          source: miniAppUrl ? 'MINI_APP_URL' : url ? 'fallback (botInfo + short_name)' : 'none',
        },
        'bot.setup resolving mini-app URL',
      );
      const isTmeAlias = url && /^https:\/\/t\.me\//i.test(url);
      if (!url || isTmeAlias) {
        try {
          await bot.api.setChatMenuButton({ menu_button: { type: 'commands' } });
          log.info(
            { reason: !url ? 'no effective URL' : 't.me alias unsupported by web_app' },
            'bot.setup menu button → commands list (set MINI_APP_URL to the raw frontend HTTPS URL to enable the Play button)',
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
            web_app: { url },
          },
        });
        log.info({ url }, 'bot.setup menu button installed');
      } catch (err) {
        log.warn({ err, url }, 'bot.setup setChatMenuButton failed — falling back to commands');
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
