import { Bot } from 'grammy';
import type { Logger } from '../../logger.js';

export interface PaymentHandlers {
  /** Telegram gives 10s to confirm — keep this fast (single DB lookup). */
  preCheckout(args: {
    invoicePayload: string;
    totalAmount: number;
  }): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Fired when the charge actually goes through. Idempotent on
   * `telegramPaymentChargeId`. */
  successfulPayment(args: {
    invoicePayload: string;
    totalAmount: number;
    telegramPaymentChargeId: string;
    fromTelegramId: number;
  }): Promise<void>;
}

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
  /** Wire up TG payment lifecycle hooks (Stars-based purchases). Called
   * after the shop service is constructed. Safe to call once; subsequent
   * calls are ignored. */
  attachPaymentHandlers(handlers: PaymentHandlers): void;
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
   *
   * `startParam` (e.g. "ref_12345") is forwarded so the WebApp receives
   * `WebApp.initDataUnsafe.start_param` and can run referral attribution
   * before routing to /welcome. Without this, a referee who taps the
   * inline button after /start ref_X loses the param and lands in
   * /tutorial instead of /welcome.
   */
  function buildOpenAppKeyboard(startParam?: string) {
    const sp = startParam && /^[A-Za-z0-9_-]{1,64}$/.test(startParam) ? startParam : null;
    if (miniAppWebUrl) {
      // web_app buttons only accept the configured domain — query params on
      // a https:// URL are passed straight through, but the WebApp SDK only
      // surfaces `start_param` when the launch happens via t.me alias. So
      // when we have a startParam, prefer the t.me deep-link form.
      if (sp) {
        const tmeFallback =
          miniAppUrl ??
          (bot.botInfo?.username
            ? `https://t.me/${bot.botInfo.username}/${miniAppShortName}`
            : null);
        if (tmeFallback) {
          return { inline_keyboard: [[openAppButton(`${tmeFallback}?startapp=${sp}`)]] };
        }
      }
      return { inline_keyboard: [[openAppButton(miniAppWebUrl)]] };
    }
    const fallback =
      miniAppUrl ??
      (bot.botInfo?.username ? `https://t.me/${bot.botInfo.username}/${miniAppShortName}` : null);
    if (!fallback) return { inline_keyboard: [] };
    const url = sp ? `${fallback}?startapp=${sp}` : fallback;
    return { inline_keyboard: [[openAppButton(url)]] };
  }

  bot.command('start', async (ctx) => {
    // /start payload (everything after "/start ") is the deep-link param
    // forwarded by Telegram. For referees this is "ref_<inviterTgId>"; we
    // pipe it back into the Open App button as ?startapp=ref_X so the
    // WebApp's referral attribution flow fires on first launch.
    const payload = ctx.match?.trim();
    await ctx.reply(
      '👋 Welcome to *Fantasy Token League*\\!\n\n' +
        'Pick a 5\\-coin lineup, beat the room, claim the pool\\.\n\n' +
        '_Tip: tap the blue *Play* button below the message bar to open the app any time\\._',
      {
        parse_mode: 'MarkdownV2',
        reply_markup: buildOpenAppKeyboard(payload || undefined),
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

  let paymentHandlersAttached = false;

  return {
    get api() {
      return bot.api;
    },
    attachPaymentHandlers(handlers: PaymentHandlers) {
      if (paymentHandlersAttached) {
        log.warn('bot.attachPaymentHandlers called twice — ignored');
        return;
      }
      paymentHandlersAttached = true;

      // Telegram requires the bot to confirm the pre-checkout within ~10s;
      // we delegate to a fast service path (single SELECT to validate
      // package id + amount).
      bot.on('pre_checkout_query', async (ctx) => {
        try {
          const result = await handlers.preCheckout({
            invoicePayload: ctx.preCheckoutQuery.invoice_payload,
            totalAmount: ctx.preCheckoutQuery.total_amount,
          });
          if (result.ok) {
            await ctx.answerPreCheckoutQuery(true);
          } else {
            await ctx.answerPreCheckoutQuery(false, result.reason);
            log.warn({ reason: result.reason }, 'bot.preCheckout rejected');
          }
        } catch (err) {
          log.error({ err }, 'bot.preCheckout handler crashed');
          try {
            await ctx.answerPreCheckoutQuery(false, 'Internal error, please retry.');
          } catch {
            // already logged
          }
        }
      });

      // Charge succeeded — credit the user. UNIQUE index on
      // transactions.payment_charge_id absorbs duplicate webhook deliveries.
      bot.on('message:successful_payment', async (ctx) => {
        const payment = ctx.message.successful_payment;
        const fromId = ctx.from?.id;
        if (!fromId) {
          log.warn({ payment }, 'bot.successfulPayment without ctx.from');
          return;
        }
        try {
          await handlers.successfulPayment({
            invoicePayload: payment.invoice_payload,
            totalAmount: payment.total_amount,
            telegramPaymentChargeId: payment.telegram_payment_charge_id,
            fromTelegramId: fromId,
          });
        } catch (err) {
          // INV-7: log + swallow. The grammY framework will retry on throw,
          // and our idempotency guard absorbs the retry safely.
          log.error(
            { err, telegramPaymentChargeId: payment.telegram_payment_charge_id },
            'bot.successfulPayment handler failed',
          );
        }
      });
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
