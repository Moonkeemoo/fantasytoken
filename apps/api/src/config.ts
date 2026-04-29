import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TON_NETWORK: z.enum(['mainnet', 'testnet']).default('mainnet'),

  WELCOME_BONUS_USD_CENTS: z.coerce.number().int().nonnegative().default(10_000),
  RAKE_PCT: z.coerce.number().int().min(0).max(50).default(10),
  BOT_MIN_FILLER: z.coerce.number().int().nonnegative().default(20),
  BOT_RATIO: z.coerce.number().int().nonnegative().default(3),

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

  // Public base URL the api is reachable on — used to build absolute og:image links.
  // Must match what's in the Vercel/Railway domain config; falls back to localhost in dev.
  PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),
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
