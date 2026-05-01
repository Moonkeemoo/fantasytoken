import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { virtualBudgetCentsFor } from '@fantasytoken/shared';
import type { Database } from '../../db/client.js';
import {
  contests,
  entries,
  priceSnapshots,
  tokens,
  transactions,
  xpEvents,
} from '../../db/schema/index.js';
import type { ResultEntrySnapshot, ResultRepo } from './result.service.js';

export function createResultRepo(db: Database): ResultRepo {
  return {
    async getContest(id) {
      const [c] = await db
        .select({
          id: contests.id,
          name: contests.name,
          status: contests.status,
          prizePoolCents: contests.prizePoolCents,
          entryFeeCents: contests.entryFeeCents,
          virtualBudgetCents: contests.virtualBudgetCents,
        })
        .from(contests)
        .where(eq(contests.id, id))
        .limit(1);
      if (!c) return null;
      // ADR-0003: virtualBudgetCents is derived from entryFee via the
      // shared tier ladder. The DB column default (10_000_000) was being
      // returned as-is for every Quick Match (c1) contest, displaying as
      // "$10M committed" instead of the correct $10K tier. Mirror the
      // contests.repo projection so result + lobby agree.
      return {
        id: c.id,
        name: c.name,
        status: c.status as 'scheduled' | 'active' | 'finalizing' | 'finalized' | 'cancelled',
        prizePoolCents: Number(c.prizePoolCents),
        entryFeeCents: Number(c.entryFeeCents),
        virtualBudgetCents: virtualBudgetCentsFor(Number(c.entryFeeCents)),
      };
    },

    async getEntries(contestId) {
      const rows = await db
        .select({
          entryId: entries.id,
          userId: entries.userId,
          isBot: entries.isBot,
          submittedAt: entries.submittedAt,
          picks: entries.picks,
          finalScore: entries.finalScore,
          prizeCents: entries.prizeCents,
        })
        .from(entries)
        .where(eq(entries.contestId, contestId));
      return rows.map<ResultEntrySnapshot>((r) => ({
        entryId: r.entryId,
        userId: r.userId,
        isBot: r.isBot,
        submittedAt: r.submittedAt,
        picks: (r.picks as Array<{ symbol: string; alloc: number }>) ?? [],
        finalScore: r.finalScore !== null ? Number(r.finalScore) : 0,
        prizeCents: Number(r.prizeCents ?? 0),
      }));
    },

    async findMyEntry(contestId, userId, entryId) {
      if (entryId) {
        const [r] = await db
          .select({
            entryId: entries.id,
            userId: entries.userId,
            isBot: entries.isBot,
            submittedAt: entries.submittedAt,
            picks: entries.picks,
            finalScore: entries.finalScore,
            prizeCents: entries.prizeCents,
          })
          .from(entries)
          .where(and(eq(entries.id, entryId), eq(entries.contestId, contestId)))
          .limit(1);
        if (!r) return null;
        return {
          entryId: r.entryId,
          userId: r.userId,
          isBot: r.isBot,
          submittedAt: r.submittedAt,
          picks: (r.picks as Array<{ symbol: string; alloc: number }>) ?? [],
          finalScore: r.finalScore !== null ? Number(r.finalScore) : 0,
          prizeCents: Number(r.prizeCents ?? 0),
        };
      }
      if (!userId) return null;
      const [r] = await db
        .select({
          entryId: entries.id,
          userId: entries.userId,
          isBot: entries.isBot,
          submittedAt: entries.submittedAt,
          picks: entries.picks,
          finalScore: entries.finalScore,
          prizeCents: entries.prizeCents,
        })
        .from(entries)
        .where(and(eq(entries.contestId, contestId), eq(entries.userId, userId)))
        .limit(1);
      if (!r) return null;
      return {
        entryId: r.entryId,
        userId: r.userId,
        isBot: r.isBot,
        submittedAt: r.submittedAt,
        picks: (r.picks as Array<{ symbol: string; alloc: number }>) ?? [],
        finalScore: r.finalScore !== null ? Number(r.finalScore) : 0,
        prizeCents: Number(r.prizeCents ?? 0),
      };
    },

    async getPriceSnapshots(contestId) {
      const rows = await db
        .select({
          symbol: tokens.symbol,
          phase: priceSnapshots.phase,
          priceUsd: priceSnapshots.priceUsd,
        })
        .from(priceSnapshots)
        .innerJoin(tokens, eq(priceSnapshots.tokenId, tokens.id))
        .where(eq(priceSnapshots.contestId, contestId));
      const m = new Map<string, { start: number; end: number }>();
      for (const r of rows) {
        const cur = m.get(r.symbol) ?? { start: 0, end: 0 };
        if (r.phase === 'start') cur.start = Number(r.priceUsd);
        if (r.phase === 'end') cur.end = Number(r.priceUsd);
        m.set(r.symbol, cur);
      }
      return m;
    },

    async hasRefund(entryId) {
      const [r] = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.refType, 'entry'),
            eq(transactions.refId, entryId),
            eq(transactions.type, 'REFUND'),
          ),
        )
        .limit(1);
      return !!r;
    },

    async getImagesBySymbols(symbols) {
      if (symbols.length === 0) return new Map();
      const rows = await db
        .select({ symbol: tokens.symbol, imageUrl: tokens.imageUrl })
        .from(tokens)
        .where(inArray(tokens.symbol, symbols));
      return new Map(rows.map((r) => [r.symbol, r.imageUrl]));
    },

    async markResultViewed(entryId) {
      // First-write-wins via a partial UPDATE so re-fetches don't churn the
      // value (and the bot drain's skip-if-viewed check stays accurate).
      await db
        .update(entries)
        .set({ resultViewedAt: sql`NOW()` })
        .where(and(eq(entries.id, entryId), isNull(entries.resultViewedAt)));
    },

    async getXpAwardForUser(contestId, userId) {
      const [row] = await db
        .select({ deltaXp: xpEvents.deltaXp, breakdown: xpEvents.breakdown })
        .from(xpEvents)
        .where(and(eq(xpEvents.contestId, contestId), eq(xpEvents.userId, userId)))
        .limit(1);
      if (!row) return null;
      const breakdown = Array.isArray(row.breakdown)
        ? (row.breakdown as Array<{ reason: string; amount: number }>)
        : [];
      return { total: row.deltaXp, breakdown };
    },
  };
}
