import type { ActionOutcome, SyntheticAction } from '@fantasytoken/shared';
import type { Database } from '../db/client.js';
import { syntheticActionsLog } from '../db/schema/index.js';

/**
 * TZ-005 §1 — append-only behaviour log writer.
 *
 * Every synthetic action — successful, rejected, or skipped — flows through
 * here. The whole point is to find economy holes: a wave of
 * `joinContest`/`rejected`/`INSUFFICIENT_COINS` is the smoke that says
 * starting balances are too low or contest fees too high.
 *
 * Never throws on log-write failure: simulation must keep running even if
 * the log table is briefly unavailable. INV-7 satisfied via the `err` field
 * on the surrounding caller's logger when we propagate.
 */

export interface LogActionArgs {
  userId: string;
  action: SyntheticAction;
  outcome: ActionOutcome;
  errorCode?: string | null;
  payload?: Record<string, unknown> | null;
  balanceAfterCents?: bigint | null;
  /** Override `tick` timestamp (default NOW()). Used by replay tooling. */
  tick?: Date;
}

export interface SimLogger {
  log(args: LogActionArgs): Promise<void>;
}

export function createSimLogger(db: Database): SimLogger {
  return {
    async log(args) {
      await db.insert(syntheticActionsLog).values({
        userId: args.userId,
        tick: args.tick ?? new Date(),
        action: args.action,
        outcome: args.outcome,
        errorCode: args.errorCode ?? null,
        payload: args.payload ?? null,
        balanceAfterCents: args.balanceAfterCents ?? null,
      });
    },
  };
}
