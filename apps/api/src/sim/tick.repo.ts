import { and, eq, gt, inArray, sql as dsql } from 'drizzle-orm';
import type { PersonaKind } from '@fantasytoken/shared';
import type { Database } from '../db/client.js';
import {
  balances,
  contests,
  entries,
  syntheticActionsLog,
  tokens,
  users,
} from '../db/schema/index.js';
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
  /** Synth's current rank (RANK_SYSTEM.md). Synths start at 1 and climb
   * via xp_events the same way real users do. Drives the picker's
   * minRank gate so they don't try contests above their tier. */
  currentRank: number;
}

export interface TickOpenContest {
  id: string;
  entryFeeCents: bigint;
  createdAt: Date;
  startsAt: Date;
  minRank: number;
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
  /** Per-user current coin balance (USD currency). Synths without a row
   * default to 0n. Used by the picker to skip contests they can't
   * afford — without this they'd hammer paid contests with INSUFFICIENT_COINS
   * rejections and drown the real "drained" signal. */
  loadBalancesByUser(synthIds: string[]): Promise<Map<string, bigint>>;
  /** Faucet state per synth (2026-05-02). Returns the count of
   * `cannot_afford` events within `lookbackMinutes` and the timestamp
   * of the most recent `faucet_top_up` (any time). Synths without
   * either signal are absent from the map. One indexed query —
   * synthetic_actions_log has `sim_log_user_tick_idx` on (user_id, tick)
   * and `sim_log_action_tick_idx` on (action, tick). */
  loadFaucetState(
    synthIds: string[],
    lookbackMinutes: number,
  ): Promise<Map<string, { recentCantAffordCount: number; lastFaucetAt: Date | null }>>;
}

export function createTickRepo(db: Database): TickRepo {
  return {
    async listSynthetics() {
      const rows = await db
        .select({
          id: users.id,
          personaKind: users.personaKind,
          syntheticSeed: users.syntheticSeed,
          currentRank: users.currentRank,
        })
        .from(users)
        .where(eq(users.isSynthetic, true));
      return rows
        .filter((r) => r.personaKind !== null && r.syntheticSeed !== null)
        .map((r) => ({
          id: r.id,
          personaKind: r.personaKind as PersonaKind,
          syntheticSeed: r.syntheticSeed as number,
          currentRank: r.currentRank,
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
          minRank: contests.minRank,
        })
        .from(contests)
        .where(and(eq(contests.status, 'scheduled'), gt(contests.startsAt, new Date())));
      return rows.map((r) => ({
        id: r.id,
        entryFeeCents: r.entryFeeCents,
        createdAt: r.createdAt,
        startsAt: r.startsAt,
        minRank: r.minRank,
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
      // qa007 sister bug (2026-05-02): postgres caps a single query at
      // 65 534 bind params. synthIds is bounded by the cohort (~2.4k),
      // but contestIds = scheduler open set, which now sits at ~96k
      // under steady state (24h-lane spawning ahead of starts_at). We
      // chunk on contestIds — synthIds always inline as one inArray.
      // 5000 contests / chunk + 2408 synths = ~7.4k params per query,
      // well below the ceiling, with N/5000 extra round-trips per tick.
      const out = new Set<string>();
      const CHUNK = 5000;
      for (let i = 0; i < contestIds.length; i += CHUNK) {
        const slice = contestIds.slice(i, i + CHUNK);
        const rows = await db
          .select({ userId: entries.userId, contestId: entries.contestId })
          .from(entries)
          .where(and(inArray(entries.userId, synthIds), inArray(entries.contestId, slice)));
        for (const r of rows) {
          if (r.userId) out.add(`${r.userId}|${r.contestId}`);
        }
      }
      return out;
    },

    async loadBalancesByUser(synthIds) {
      if (synthIds.length === 0) return new Map();
      const rows = await db
        .select({ userId: balances.userId, amountCents: balances.amountCents })
        .from(balances)
        .where(and(inArray(balances.userId, synthIds), eq(balances.currencyCode, 'USD')));
      const out = new Map<string, bigint>();
      for (const r of rows) out.set(r.userId, r.amountCents);
      return out;
    },

    async loadFaucetState(synthIds, lookbackMinutes) {
      if (synthIds.length === 0) return new Map();
      const rows = await db
        .select({
          userId: syntheticActionsLog.userId,
          cantAfford: dsql<number>`COUNT(*) FILTER (WHERE ${syntheticActionsLog.action} = 'cannot_afford' AND ${syntheticActionsLog.tick} > now() - (${lookbackMinutes} || ' minutes')::interval)::int`,
          lastFaucet: dsql<Date | null>`MAX(${syntheticActionsLog.tick}) FILTER (WHERE ${syntheticActionsLog.action} = 'faucet_top_up')`,
        })
        .from(syntheticActionsLog)
        .where(inArray(syntheticActionsLog.userId, synthIds))
        .groupBy(syntheticActionsLog.userId);
      const out = new Map<string, { recentCantAffordCount: number; lastFaucetAt: Date | null }>();
      for (const r of rows) {
        if (r.cantAfford > 0 || r.lastFaucet !== null) {
          out.set(r.userId, {
            recentCantAffordCount: r.cantAfford,
            lastFaucetAt: r.lastFaucet,
          });
        }
      }
      return out;
    },
  };
}
