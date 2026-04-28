import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { contests, entries, priceSnapshots, tokens, transactions } from '../../db/schema/index.js';
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
        })
        .from(contests)
        .where(eq(contests.id, id))
        .limit(1);
      if (!c) return null;
      return {
        id: c.id,
        name: c.name,
        status: c.status as 'scheduled' | 'active' | 'finalizing' | 'finalized' | 'cancelled',
        prizePoolCents: Number(c.prizePoolCents),
        entryFeeCents: Number(c.entryFeeCents),
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
  };
}
