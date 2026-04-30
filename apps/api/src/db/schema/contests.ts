import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const contests = pgTable('contests', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('scheduled'),
  // INV-4 frozen — MVP only stores 'bull', kept varchar for V2.
  type: varchar('type', { length: 8 }).notNull().default('bull'),
  entryFeeCents: bigint('entry_fee_cents', { mode: 'bigint' }).notNull(),
  prizePoolCents: bigint('prize_pool_cents', { mode: 'bigint' }).notNull(),
  maxCapacity: integer('max_capacity').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  isFeatured: boolean('is_featured').notNull().default(false),
  // Rank-system: gating + XP multiplier (RANK_SYSTEM.md §6).
  minRank: integer('min_rank').notNull().default(1),
  xpMultiplier: numeric('xp_multiplier', { precision: 3, scale: 2 }).notNull().default('1.00'),
  // Pay-curve override. Default `false` keeps the standard "top 50% pays"
  // curve. `true` makes every entry payable (used by Practice — "all 10
  // positions get a slice"). Curve shape stays geometric either way.
  payAll: boolean('pay_all').notNull().default(false),
  // ADR-0003: $-first UX layer. Display-only — backend score / payout
  // continues to operate in pure % space. Default 10_000_000 cents = $100,000
  // (matches the legacy "fixed budget" concept). drizzle-kit 0.28 cannot
  // serialize BigInt literal defaults, so the SQL is written manually.
  virtualBudgetCents: bigint('virtual_budget_cents', { mode: 'bigint' })
    .notNull()
    .default(sql`10000000`),
  // Contests v2 matrix (ADR-0004, INV-13). All three NOT NULL — see migration
  // 0020_contests_v2_matrix.sql. matrix_cell_key is GENERATED — we never write
  // to it; Drizzle reads it for SELECTs only.
  durationLane: text('duration_lane').notNull(),
  stakeTier: text('stake_tier').notNull(),
  mode: text('mode').notNull(),
  matrixCellKey: text('matrix_cell_key'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ContestRow = typeof contests.$inferSelect;
export type NewContestRow = typeof contests.$inferInsert;
