import type { CoinGeckoClient, CoinGeckoMarket } from '../../lib/coingecko.js';
import type { Logger } from '../../logger.js';

export interface TokenUpsertRow {
  coingeckoId: string;
  symbol: string;
  name: string;
  currentPriceUsd: number | null;
  pctChange24h: number | null;
  marketCapUsd: number | null;
  lastUpdatedAt: Date | null;
}

export interface TokensRepo {
  upsertMany(rows: TokenUpsertRow[]): Promise<void>;
  listPage(args: { page: number; limit: number }): Promise<{
    items: Array<{
      symbol: string;
      name: string;
      currentPriceUsd: string | null;
      pctChange24h: string | null;
      marketCapUsd: string | null;
    }>;
    total: number;
  }>;
}

export interface TokensServiceDeps {
  repo: TokensRepo;
  client: CoinGeckoClient;
  log: Logger;
}

export interface TokensService {
  syncCatalog(args: { pages: number; perPage: number }): Promise<number>;
  listPage(args: { page: number; limit: number }): ReturnType<TokensRepo['listPage']>;
}

export function createTokensService(deps: TokensServiceDeps): TokensService {
  return {
    async syncCatalog({ pages, perPage }) {
      let upserted = 0;
      for (let page = 1; page <= pages; page++) {
        try {
          const markets = await deps.client.topMarkets({ perPage, page });
          const rows = markets.map(toUpsertRow);
          await deps.repo.upsertMany(rows);
          upserted += rows.length;
        } catch (err) {
          // INV-7: log per-page failure; continue to next page.
          deps.log.warn({ err, page }, 'tokens.sync.catalog page failed');
        }
      }
      deps.log.info({ upserted, pages }, 'tokens.sync.catalog done');
      return upserted;
    },

    async listPage(args) {
      return deps.repo.listPage(args);
    },
  };
}

function toUpsertRow(m: CoinGeckoMarket): TokenUpsertRow {
  return {
    coingeckoId: m.id,
    symbol: m.symbol.toUpperCase(),
    name: m.name,
    currentPriceUsd: m.current_price,
    pctChange24h: m.price_change_percentage_24h,
    marketCapUsd: m.market_cap,
    lastUpdatedAt: m.last_updated ? new Date(m.last_updated) : null,
  };
}
