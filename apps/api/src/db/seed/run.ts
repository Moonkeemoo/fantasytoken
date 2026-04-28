import { loadConfig } from '../../config.js';
import { createDatabase } from '../client.js';
import { createLogger } from '../../logger.js';
import { seedContests } from './contests.js';
import { createCoinGeckoClient } from '../../lib/coingecko.js';
import { createTokensRepo } from '../../modules/tokens/tokens.repo.js';
import { createTokensService } from '../../modules/tokens/tokens.service.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const db = createDatabase(config);

  const adminId = config.ADMIN_TG_IDS[0];
  if (!adminId) {
    logger.warn('ADMIN_TG_IDS empty — using fallback dev admin id 999_001');
  }
  const adminTelegramId = adminId ?? 999_001;

  // Sync token catalog (1 page = 250 tokens — enough for dev).
  const cg = createCoinGeckoClient(
    {
      baseUrl: config.COINGECKO_BASE_URL,
      ...(config.COINGECKO_API_KEY !== undefined && { apiKey: config.COINGECKO_API_KEY }),
    },
    logger,
  );
  const tokensRepo = createTokensRepo(db);
  const tokensSvc = createTokensService({ repo: tokensRepo, client: cg, log: logger });
  try {
    const synced = await tokensSvc.syncCatalog({ pages: 1, perPage: 250 });
    logger.info({ synced }, 'seeded tokens');
  } catch (err) {
    logger.warn({ err }, 'token catalog sync failed (continuing with contests)');
  }

  const result = await seedContests(db, { adminTelegramId });
  logger.info(result, 'seeded contests');

  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
