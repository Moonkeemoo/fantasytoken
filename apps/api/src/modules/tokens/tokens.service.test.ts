import { describe, expect, it, vi } from 'vitest';
import { createTokensService, type TokensRepo } from './tokens.service.js';
import type { CoinGeckoClient } from '../../lib/coingecko.js';

function makeFakeRepo(): TokensRepo & { upserted: number } {
  let upserted = 0;
  return {
    get upserted() {
      return upserted;
    },
    async upsertMany(rows) {
      upserted += rows.length;
    },
    async listPage() {
      return { items: [], total: 0 };
    },
    async search() {
      return [];
    },
    async listActiveSymbols() {
      return [];
    },
    async listActiveCoingeckoIds() {
      return [];
    },
  };
}

const noopLog = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} } as never;

describe('TokensService.syncCatalog', () => {
  it('fetches 2 CoinGecko pages and upserts their union', async () => {
    const client: CoinGeckoClient = {
      marketsByIds: vi.fn().mockResolvedValue([]),
      topMarkets: vi.fn().mockImplementation(async ({ page }) => {
        if (page === 1) {
          return [
            {
              id: 'bitcoin',
              symbol: 'btc',
              name: 'Bitcoin',
              current_price: 60000,
              market_cap: 1e12,
              price_change_percentage_24h: 1.5,
              last_updated: '2026-04-28T00:00:00Z',
            },
          ];
        }
        return [
          {
            id: 'pepe',
            symbol: 'pepe',
            name: 'Pepe',
            current_price: 0.000001,
            market_cap: 4e8,
            price_change_percentage_24h: 12.4,
            last_updated: '2026-04-28T00:00:00Z',
          },
        ];
      }),
    };
    const repo = makeFakeRepo();
    const svc = createTokensService({ repo, client, log: noopLog });
    const n = await svc.syncCatalog({ pages: 2, perPage: 250, pageDelayMs: 0 });
    expect(client.topMarkets).toHaveBeenCalledTimes(2);
    expect(repo.upserted).toBe(2);
    expect(n).toBe(2);
  });

  it('survives a single-page failure and reports partial', async () => {
    let calls = 0;
    const client: CoinGeckoClient = {
      marketsByIds: vi.fn().mockResolvedValue([]),
      topMarkets: vi.fn().mockImplementation(async () => {
        calls += 1;
        if (calls === 2) throw new Error('rate limited');
        return [
          {
            id: 'bitcoin',
            symbol: 'btc',
            name: 'Bitcoin',
            current_price: 60000,
            market_cap: 1e12,
            price_change_percentage_24h: 1.5,
            last_updated: '2026-04-28T00:00:00Z',
          },
        ];
      }),
    };
    const repo = makeFakeRepo();
    const svc = createTokensService({ repo, client, log: noopLog });
    const n = await svc.syncCatalog({ pages: 2, perPage: 250, pageDelayMs: 0 });
    // Page 1 succeeded, page 2 failed → only page 1 upserted.
    expect(repo.upserted).toBe(1);
    expect(n).toBe(1);
  });
});
