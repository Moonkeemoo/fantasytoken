import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * TZ-002 §5.1: catalogue of buyable coin packages. Server-controlled so
 * pricing / bonus / sort can be A/B-tuned without a client deploy.
 */
export const coinPackages = pgTable('coin_packages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** TG Stars charged at checkout. */
  starsPrice: integer('stars_price').notNull(),
  /** Whole coins credited before bonus. */
  coinsBase: integer('coins_base').notNull(),
  /** Volume bonus % stacked on `coins_base` at credit time (round half-up). */
  bonusPct: integer('bonus_pct').notNull().default(0),
  /** UI flag — exactly one package usually carries the "Best value" pill. */
  isHighlighted: boolean('is_highlighted').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CoinPackageRow = typeof coinPackages.$inferSelect;
export type NewCoinPackageRow = typeof coinPackages.$inferInsert;
