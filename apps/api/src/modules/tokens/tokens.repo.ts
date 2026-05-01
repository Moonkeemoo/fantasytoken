import { sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { contests, entries, tokens } from '../../db/schema/index.js';
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
            imageUrl: r.imageUrl,
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
            imageUrl: sql`excluded.image_url`,
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
          imageUrl: tokens.imageUrl,
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

    async pickedByPctMap({ contestId, symbols }) {
      if (symbols.length === 0) return new Map<string, number>();
      // Count entries containing each symbol vs total entries in the contest.
      // We pre-count totals once and then run a JSONB-array-elements lateral
      // join to count matches per symbol.
      const totalRows = await db.execute<{ total: number }>(
        sql`SELECT COUNT(*)::int AS total FROM ${entries} WHERE ${entries.contestId} = ${contestId}`,
      );
      const total = (totalRows as unknown as Array<{ total: number }>)[0]?.total ?? 0;
      if (total === 0) return new Map<string, number>();
      const upper = symbols.map((s) => s.toUpperCase());
      const rows = await db.execute<{ symbol: string; n: number }>(
        sql`SELECT pick->>'symbol' AS symbol, COUNT(DISTINCT ${entries.id})::int AS n
            FROM ${entries},
                 jsonb_array_elements(${entries.picks}::jsonb) pick
            WHERE ${entries.contestId} = ${contestId}
              AND UPPER(pick->>'symbol') = ANY(${upper})
            GROUP BY pick->>'symbol'`,
      );
      const map = new Map<string, number>();
      for (const r of rows as unknown as Array<{ symbol: string; n: number }>) {
        const pct = Math.round((r.n / total) * 100);
        map.set(r.symbol, pct);
      }
      return map;
    },

    async listActiveSymbols() {
      const rows = await db.execute<{ symbol: string }>(
        sql`SELECT DISTINCT (pick->>'symbol')::text AS symbol
            FROM ${entries}
            JOIN ${contests} ON ${entries.contestId} = ${contests.id},
            jsonb_array_elements(${entries.picks}::jsonb) pick
            WHERE ${contests.status} = 'active'`,
      );
      return (rows as unknown as Array<{ symbol: string }>).map((r) => r.symbol);
    },

    async listAllCatalogSymbols() {
      const rows = await db.select({ symbol: tokens.symbol }).from(tokens);
      return rows.map((r) => r.symbol);
    },

    async listActiveCoingeckoIds(opts) {
      // Resolve symbols-in-live-or-pending-contests → coingecko_ids. We
      // include 'scheduled' so prices stay warm during the fill window —
      // otherwise a contest with no peers could age its picks past the
      // 2h staleness gate the tick service used to enforce, and locking
      // would deadlock waiting for prices that never refresh.
      //
      // `excludeFreshWithinSec`: when set, filter out tokens whose
      // last_updated_at is newer than (NOW() - X seconds). The Binance
      // WS feed bumps last_updated_at every ~1s for tokens it covers;
      // CoinGecko sync only needs to chase the long tail.
      const freshFilter = opts?.excludeFreshWithinSec
        ? sql`AND (t.last_updated_at IS NULL OR t.last_updated_at < NOW() - (${opts.excludeFreshWithinSec}::int * INTERVAL '1 second'))`
        : sql``;
      const rows = await db.execute<{ coingecko_id: string }>(
        sql`SELECT DISTINCT t.coingecko_id
            FROM ${entries} e
            JOIN ${contests} c ON e.contest_id = c.id,
            jsonb_array_elements(e.picks::jsonb) pick
            JOIN ${tokens} t ON UPPER(t.symbol) = UPPER(pick->>'symbol')
            WHERE c.status IN ('scheduled', 'active')
              ${freshFilter}`,
      );
      return (rows as unknown as Array<{ coingecko_id: string }>).map((r) => r.coingecko_id);
    },

    async upsertPricesBySymbol(rows) {
      if (rows.length === 0) return 0;
      // One-shot UPDATE … FROM (VALUES …). We can't INSERT here because
      // tokens.coingecko_id is NOT NULL (catalog-sourced) and Binance
      // doesn't carry it; only update existing rows. Symbols missing
      // from our catalog (Binance has ~500, our catalog ~516; overlap
      // is the bulk) are silently skipped, which is exactly what we want.
      const valuesSql = sql.join(
        rows.map(
          (r) =>
            sql`(${r.symbol.toUpperCase()},
                 ${r.currentPriceUsd}::numeric,
                 ${r.pctChange24h === null ? null : String(r.pctChange24h)}::numeric)`,
        ),
        sql`, `,
      );
      const result = await db.execute<{ count: string }>(sql`
        WITH updated AS (
          UPDATE tokens t
          SET current_price_usd = v.price,
              pct_change_24h    = v.pct,
              last_updated_at   = NOW()
          FROM (VALUES ${valuesSql}) AS v(symbol, price, pct)
          WHERE UPPER(t.symbol) = v.symbol
          RETURNING 1
        )
        SELECT COUNT(*)::text AS count FROM updated
      `);
      const cnt = (result as unknown as Array<{ count: string }>)[0]?.count ?? '0';
      return Number(cnt);
    },

    async listPage({ page, limit }) {
      const offset = page * limit;
      const items = await db
        .select({
          symbol: tokens.symbol,
          name: tokens.name,
          imageUrl: tokens.imageUrl,
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
