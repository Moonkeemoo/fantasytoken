import {
  bigint,
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

// TZ-005 §1. Append-only behavior log for synthetic users. We capture
// outcome+errorCode (not just intent) so the agent loop can spot economy
// holes — e.g. a wave of `joinContest`/`rejected`/`INSUFFICIENT_COINS`
// means our coin grants dry up too fast.
//
// CASCADE on user_id is intentional and sim-only: real-user audit (INV-9)
// lives in `transactions`. This log is observability for fakes; wipe
// removes it cleanly along with the synthetic user.
export const syntheticActionsLog = pgTable(
  'synthetic_actions_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tick: timestamp('tick', { withTimezone: true }).notNull(),
    action: text('action').notNull(),
    outcome: text('outcome').notNull(), // 'success' | 'rejected' | 'skipped' | 'error'
    errorCode: text('error_code'), // AppError code when outcome='rejected'/'error'
    payload: jsonb('payload'),
    /** Snapshot of the user's coin balance immediately AFTER the action.
     * Lets us graph balance-over-time per user without joining transactions. */
    balanceAfterCents: bigint('balance_after_cents', { mode: 'bigint' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byUser: index('sim_log_user_tick_idx').on(t.userId, t.tick),
    byActionTick: index('sim_log_action_tick_idx').on(t.action, t.tick),
    byTick: index('sim_log_tick_idx').on(t.tick),
  }),
);

export type SyntheticActionsLogRow = typeof syntheticActionsLog.$inferSelect;
export type NewSyntheticActionsLogRow = typeof syntheticActionsLog.$inferInsert;
