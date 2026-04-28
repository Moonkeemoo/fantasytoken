import { numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const tokens = pgTable('tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  coingeckoId: text('coingecko_id').notNull().unique(),
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
  imageUrl: text('image_url'),
  currentPriceUsd: numeric('current_price_usd', { precision: 30, scale: 9 }),
  pctChange24h: numeric('pct_change_24h', { precision: 10, scale: 4 }),
  marketCapUsd: numeric('market_cap_usd', { precision: 20, scale: 2 }),
  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }),
});

export type TokenRow = typeof tokens.$inferSelect;
