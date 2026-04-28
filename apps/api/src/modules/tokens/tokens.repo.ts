import { sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { tokens } from '../../db/schema/index.js';
import type { TokensRepo, TokenUpsertRow } from './tokens.service.js';

export function createTokensRepo(db: Database): TokensRepo {
  return {
    async upsertMany(rows: TokenUpsertRow[]) {
      if (rows.length === 0) return;
      // Drizzle batch insert with ON CONFLICT DO UPDATE.
      await db
        .insert(tokens)
        .values(
          rows.map((r) => ({
            coingeckoId: r.coingeckoId,
            symbol: r.symbol,
            name: r.name,
            currentPriceUsd: r.currentPriceUsd === null ? null : String(r.currentPriceUsd),
            pctChange24h: r.pctChange24h === null ? null : String(r.pctChange24h),
            marketCapUsd: r.marketCapUsd === null ? null : String(r.marketCapUsd),
            lastUpdatedAt: r.lastUpdatedAt,
          })),
        )
        .onConflictDoUpdate({
          target: tokens.coingeckoId,
          set: {
            symbol: sql`excluded.symbol`,
            name: sql`excluded.name`,
            currentPriceUsd: sql`excluded.current_price_usd`,
            pctChange24h: sql`excluded.pct_change_24h`,
            marketCapUsd: sql`excluded.market_cap_usd`,
            lastUpdatedAt: sql`excluded.last_updated_at`,
          },
        });
    },

    async search({ q, limit }) {
      const pattern = `%${q.toUpperCase()}%`;
      return db
        .select({
          symbol: tokens.symbol,
          name: tokens.name,
          currentPriceUsd: tokens.currentPriceUsd,
          pctChange24h: tokens.pctChange24h,
          marketCapUsd: tokens.marketCapUsd,
        })
        .from(tokens)
        .where(
          sql`(UPPER(${tokens.symbol}) LIKE ${pattern} OR UPPER(${tokens.name}) LIKE ${pattern})`,
        )
        .orderBy(sql`${tokens.marketCapUsd} DESC NULLS LAST`)
        .limit(limit);
    },

    async listPage({ page, limit }) {
      const offset = page * limit;
      const items = await db
        .select({
          symbol: tokens.symbol,
          name: tokens.name,
          currentPriceUsd: tokens.currentPriceUsd,
          pctChange24h: tokens.pctChange24h,
          marketCapUsd: tokens.marketCapUsd,
        })
        .from(tokens)
        .orderBy(sql`${tokens.marketCapUsd} DESC NULLS LAST`)
        .limit(limit)
        .offset(offset);

      const countResult = await db
        .select({ count: sql<number>`COUNT(${tokens.id})::int` })
        .from(tokens);

      const total = countResult[0]?.count ?? 0;
      return { items, total };
    },
  };
}
