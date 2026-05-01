import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TON_NETWORK: z.enum(['mainnet', 'testnet']).default('mainnet'),

  // TZ-002: signup grant in WHOLE COINS (1 coin = $1 fantasy display).
  WELCOME_BONUS_COINS: z.coerce.number().int().nonnegative().default(20),
  RAKE_PCT: z.coerce.number().int().min(0).max(50).default(10),
  BOT_MIN_FILLER: z.coerce.number().int().nonnegative().default(20),
  BOT_RATIO: z.coerce.number().int().nonnegative().default(3),
  // Off by default 2026-05-01 — synthetic users (TZ-005) populate
  // contests now, no need for the fake-bot filler that pre-dates them.
  // Flip back on if a sim is ever disabled to keep contests non-empty.
  BOT_FILL_ENABLED: z
    .string()
    .default('false')
    .transform((s) => ['true', '1', 'yes', 'on'].includes(s.toLowerCase())),

  // Empty string → empty array. List of TG IDs as integers.
  ADMIN_TG_IDS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => Number.parseInt(x, 10)),
    )
    .pipe(z.array(z.number().int().positive())),

  COINGECKO_BASE_URL: z.string().url().default('https://api.coingecko.com/api/v3'),
  COINGECKO_API_KEY: z.string().optional(),

  // Optional public base URL of the API (e.g. https://fantasytoken-production.up.railway.app).
  // Used to build absolute og:image links for the share card. Empty → routes derive
  // from request headers, which works behind Railway / Vercel proxies.
  PUBLIC_API_URL: z.string().url().optional(),
  /** Telegram deep-link to the mini-app, e.g. https://t.me/<bot>/<short>.
   * Used inside DMs and share links — opens *inside* Telegram and supports
   * ?startapp=... for in-app routing (result pages, referral attribution).
   * Default points at the production bot; override on staging environments. */
  MINI_APP_URL: z.string().url().default('https://t.me/fantasytokenbot/fantasytoken'),
  /** Direct HTTPS URL of the deployed mini-app frontend (Vercel/etc).
   * Telegram requires this format for `web_app: { url }` in inline buttons
   * and `setChatMenuButton.web_app` — a t.me alias is silently rejected.
   * Default points at the production Vercel deploy. */
  MINI_APP_WEB_URL: z.string().url().default('https://fantasytoken.vercel.app'),

  // TZ-005: synthetic users simulation. When false (default) /admin/sim/*
  // routes are not registered — production deploys explicitly opt in.
  // Accepts truthy strings ('true', '1', 'yes') so .env values from
  // any provider behave consistently.
  SIM_ADMIN_ENABLED: z
    .string()
    .default('false')
    .transform((s) => ['true', '1', 'yes', 'on'].includes(s.toLowerCase())),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Validate process.env at boot. Fail fast and loud — never start with bad config.
 * INV-8: do NOT log raw values; only field names on failure.
 */
export function loadConfig(): Config {
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
