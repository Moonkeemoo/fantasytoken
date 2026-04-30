import type { CoinGeckoClient, CoinGeckoMarket } from '../../lib/coingecko.js';
import type { Logger } from '../../logger.js';

export interface TokenUpsertRow {
  coingeckoId: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
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
      imageUrl: string | null;
      currentPriceUsd: string | null;
      pctChange24h: string | null;
      marketCapUsd: string | null;
    }>;
    total: number;
  }>;
  search(args: { q: string; limit: number }): Promise<
    Array<{
      symbol: string;
      name: string;
      imageUrl: string | null;
      currentPriceUsd: string | null;
      pctChange24h: string | null;
      marketCapUsd: string | null;
    }>
  >;
  /** Per-symbol pick frequency in a contest, expressed as integer percent.
   * Returns symbols that appear in ≥1 entry; missing symbols imply 0%.
   * Used by the contest-scoped /tokens/search to surface 🔥 N% picked. */
  pickedByPctMap(args: { contestId: string; symbols: string[] }): Promise<Map<string, number>>;
  listActiveSymbols(): Promise<string[]>;
  /** Returns coingecko_ids for tokens used in any active contest's entry picks. */
  listActiveCoingeckoIds(): Promise<string[]>;
}

export interface TokensServiceDeps {
  repo: TokensRepo;
  client: CoinGeckoClient;
  log: Logger;
}

export interface TokensService {
  syncCatalog(args: { pages: number; perPage: number; pageDelayMs?: number }): Promise<number>;
  syncActive(): Promise<number>;
  listPage(args: { page: number; limit: number }): ReturnType<TokensRepo['listPage']>;
  search(args: { q: string; limit: number; contestId?: string }): Promise<
    Array<{
      symbol: string;
      name: string;
      imageUrl: string | null;
      currentPriceUsd: string | null;
      pctChange24h: string | null;
      marketCapUsd: string | null;
      pickedByPct?: number;
    }>
  >;
}

export function createTokensService(deps: TokensServiceDeps): TokensService {
  return {
    async syncCatalog({ pages, perPage, pageDelayMs = 5000 }) {
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
        // Stagger between pages to avoid CoinGecko free-tier rate-limit (5-15 req/min).
        if (page < pages && pageDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, pageDelayMs));
        }
      }
      deps.log.info({ upserted, pages }, 'tokens.sync.catalog done');
      return upserted;
    },

    async syncActive() {
      const ids = await deps.repo.listActiveCoingeckoIds();
      if (ids.length === 0) return 0;
      try {
        const markets = await deps.client.marketsByIds(ids);
        const rows = markets.map(toUpsertRow);
        const missing = ids.length - rows.length;
        await deps.repo.upsertMany(rows);
        // Loud at info-level so it's easy to spot in Railway tail when the
        // Live screen looks frozen: refreshed = how many actually got new
        // prices, missing = ids CoinGecko didn't recognise (typo or delisted).
        if (missing > 0) {
          deps.log.warn(
            { refreshed: rows.length, requested: ids.length, missing },
            'tokens.sync.active partial — some ids returned no data',
          );
        } else {
          deps.log.info(
            { refreshed: rows.length, requested: ids.length },
            'tokens.sync.active done',
          );
        }
        return rows.length;
      } catch (err) {
        // Surface the message so a CoinGecko 429/5xx is obvious in logs;
        // the user-visible symptom is a frozen P&L.
        const message = err instanceof Error ? err.message : String(err);
        deps.log.warn({ err, message, requested: ids.length }, 'tokens.sync.active failed');
        return 0;
      }
    },

    async listPage(args) {
      return deps.repo.listPage(args);
    },

    async search(args) {
      const trimmed = args.q.trim();
      if (trimmed.length === 0) return [];
      const items = await deps.repo.search({ q: trimmed, limit: args.limit });
      if (!args.contestId || items.length === 0) return items;
      const pickedMap = await deps.repo.pickedByPctMap({
        contestId: args.contestId,
        symbols: items.map((t) => t.symbol),
      });
      return items.map((t) => {
        const pct = pickedMap.get(t.symbol);
        if (pct === undefined) return t;
        return { ...t, pickedByPct: pct };
      });
    },
  };
}

function toUpsertRow(m: CoinGeckoMarket): TokenUpsertRow {
  return {
    coingeckoId: m.id,
    symbol: m.symbol.toUpperCase(),
    name: m.name,
    imageUrl: m.image,
    currentPriceUsd: m.current_price,
    pctChange24h: m.price_change_percentage_24h,
    marketCapUsd: m.market_cap,
    lastUpdatedAt: m.last_updated ? new Date(m.last_updated) : null,
  };
}
