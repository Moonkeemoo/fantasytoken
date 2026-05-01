import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import type { PersonaKind } from '@fantasytoken/shared';
import type { Database } from '../db/client.js';
import { contests, entries, syntheticActionsLog, tokens, users } from '../db/schema/index.js';
import type { PoolToken } from './lineup_picker.js';

/**
 * Read-side helpers consumed by tick.service. Kept thin: every method is
 * one indexed query against a handful of partition keys (is_synthetic,
 * status, last_updated_at). Designed for ~5K synths × 1-min tick before
 * any optimisation pressure shows up.
 */

export interface TickSynthetic {
  id: string;
  personaKind: PersonaKind;
  syntheticSeed: number;
}

export interface TickOpenContest {
  id: string;
  entryFeeCents: bigint;
  createdAt: Date;
  startsAt: Date;
}

export interface TickRepo {
  listSynthetics(): Promise<TickSynthetic[]>;
  /** Open contests = status='scheduled' and startsAt > now (still open
   * for entries). We do NOT include status='active' because entries
   * close at startsAt — see entries.service.getOpenContest. */
  listOpenContests(): Promise<TickOpenContest[]>;
  /** Token catalog snapshot; price/cap fields are read-only here. */
  loadTokenPool(): Promise<PoolToken[]>;
  /** Returns a Set keyed `${userId}|${contestId}` for every existing
   * entry. One query, one round-trip; cheap because of the partial unique
   * index `entries_user_contest_uniq`. */
  loadEnteredPairs(synthIds: string[], contestIds: string[]): Promise<Set<string>>;
  /** Per-user most-recent successful 'top_up' tick. Used by tick.service
   * to enforce persona.topUpBehavior.intervalDays. */
  loadLastTopUpAt(userIds: string[]): Promise<Map<string, Date>>;
}

export function createTickRepo(db: Database): TickRepo {
  return {
    async listSynthetics() {
      const rows = await db
        .select({
          id: users.id,
          personaKind: users.personaKind,
          syntheticSeed: users.syntheticSeed,
        })
        .from(users)
        .where(eq(users.isSynthetic, true));
      return rows
        .filter((r) => r.personaKind !== null && r.syntheticSeed !== null)
        .map((r) => ({
          id: r.id,
          personaKind: r.personaKind as PersonaKind,
          syntheticSeed: r.syntheticSeed as number,
        }));
    },

    async listOpenContests() {
      // INV-13: status='scheduled' is the entry-open phase. Once active,
      // entries.service.getOpenContest rejects new entries; we mirror that.
      const rows = await db
        .select({
          id: contests.id,
          entryFeeCents: contests.entryFeeCents,
          createdAt: contests.createdAt,
          startsAt: contests.startsAt,
        })
        .from(contests)
        .where(and(eq(contests.status, 'scheduled'), gt(contests.startsAt, new Date())));
      return rows.map((r) => ({
        id: r.id,
        entryFeeCents: r.entryFeeCents,
        createdAt: r.createdAt,
        startsAt: r.startsAt,
      }));
    },

    async loadTokenPool() {
      const rows = await db
        .select({
          symbol: tokens.symbol,
          marketCapUsd: tokens.marketCapUsd,
          pctChange24h: tokens.pctChange24h,
        })
        .from(tokens);
      return rows.map((r) => ({
        symbol: r.symbol,
        marketCapUsd: r.marketCapUsd === null ? null : Number(r.marketCapUsd),
        pctChange24h: r.pctChange24h === null ? null : Number(r.pctChange24h),
      }));
    },

    async loadEnteredPairs(synthIds, contestIds) {
      if (synthIds.length === 0 || contestIds.length === 0) return new Set();
      const rows = await db
        .select({ userId: entries.userId, contestId: entries.contestId })
        .from(entries)
        .where(and(inArray(entries.userId, synthIds), inArray(entries.contestId, contestIds)));
      const out = new Set<string>();
      for (const r of rows) {
        if (r.userId) out.add(`${r.userId}|${r.contestId}`);
      }
      return out;
    },

    async loadLastTopUpAt(userIds) {
      if (userIds.length === 0) return new Map();
      // GROUP BY user_id, MAX(tick) WHERE action='top_up' AND outcome='success'.
      // Indexed on (user_id, tick) — sim_log_user_tick_idx.
      const rows = await db
        .select({
          userId: syntheticActionsLog.userId,
          lastAt: sql<Date>`MAX(${syntheticActionsLog.tick})`.as('last_at'),
        })
        .from(syntheticActionsLog)
        .where(
          and(
            inArray(syntheticActionsLog.userId, userIds),
            eq(syntheticActionsLog.action, 'top_up'),
            eq(syntheticActionsLog.outcome, 'success'),
          ),
        )
        .groupBy(syntheticActionsLog.userId);
      const out = new Map<string, Date>();
      for (const r of rows) out.set(r.userId, new Date(r.lastAt));
      return out;
    },
  };
}
