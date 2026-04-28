import type { Logger } from '../logger.js';

export interface CoinGeckoConfig {
  baseUrl: string;
  apiKey?: string;
}

export interface CoinGeckoMarket {
  id: string; // coingecko_id, e.g. 'bitcoin'
  symbol: string; // 'btc'
  name: string;
  current_price: number | null;
  market_cap: number | null;
  price_change_percentage_24h: number | null;
  last_updated: string | null;
}

export interface CoinGeckoClient {
  /** Fetch top-N coins ordered by market cap. Free tier: per_page max 250. */
  topMarkets(args: { perPage: number; page: number }): Promise<CoinGeckoMarket[]>;
}

export function createCoinGeckoClient(cfg: CoinGeckoConfig, log: Logger): CoinGeckoClient {
  return {
    async topMarkets({ perPage, page }) {
      const url = new URL(`${cfg.baseUrl}/coins/markets`);
      url.searchParams.set('vs_currency', 'usd');
      url.searchParams.set('per_page', String(perPage));
      url.searchParams.set('page', String(page));
      url.searchParams.set('order', 'market_cap_desc');

      const headers: Record<string, string> = { accept: 'application/json' };
      // Demo plan key header is x-cg-demo-api-key; pro is x-cg-pro-api-key.
      // Both work via the same hostname for free-tier-style endpoints.
      if (cfg.apiKey) {
        headers['x-cg-demo-api-key'] = cfg.apiKey;
      }

      const res = await fetch(url.toString(), { headers });
      if (!res.ok) {
        // INV-7: surface caller; INV-8: don't log url params (key may leak via header logs).
        log.warn({ status: res.status }, 'coingecko request failed');
        throw new Error(`CoinGecko ${res.status}`);
      }
      const json: unknown = await res.json();
      if (!Array.isArray(json)) {
        throw new Error('CoinGecko: expected array response');
      }
      // Trust the shape minimally; extract only fields we know about.
      return json.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id ?? ''),
          symbol: String(r.symbol ?? ''),
          name: String(r.name ?? ''),
          current_price: typeof r.current_price === 'number' ? r.current_price : null,
          market_cap: typeof r.market_cap === 'number' ? r.market_cap : null,
          price_change_percentage_24h:
            typeof r.price_change_percentage_24h === 'number'
              ? r.price_change_percentage_24h
              : null,
          last_updated: typeof r.last_updated === 'string' ? r.last_updated : null,
        };
      });
    },
  };
}
