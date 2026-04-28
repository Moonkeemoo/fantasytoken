import { numeric, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { contests } from './contests.js';
import { tokens } from './tokens.js';

// INV-2: immutable once captured.
export const priceSnapshots = pgTable(
  'price_snapshots',
  {
    contestId: uuid('contest_id')
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    tokenId: uuid('token_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'restrict' }),
    phase: varchar('phase', { length: 8 }).notNull(), // 'start' | 'end'
    priceUsd: numeric('price_usd', { precision: 30, scale: 9 }).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.contestId, t.tokenId, t.phase] }),
  }),
);

export type PriceSnapshotRow = typeof priceSnapshots.$inferSelect;
