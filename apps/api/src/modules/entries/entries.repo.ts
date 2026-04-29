import { and, eq, gt, inArray } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { contests, entries, tokens } from '../../db/schema/index.js';
import type { EntriesRepo } from './entries.service.js';

export function createEntriesRepo(db: Database): EntriesRepo {
  return {
    async findExisting({ userId, contestId }) {
      const [row] = await db
        .select({ id: entries.id })
        .from(entries)
        .where(and(eq(entries.userId, userId), eq(entries.contestId, contestId)))
        .limit(1);
      return row ? { entryId: row.id } : null;
    },

    async getOpenContest(id) {
      const now = new Date();
      const [row] = await db
        .select({
          id: contests.id,
          entryFeeCents: contests.entryFeeCents,
          startsAt: contests.startsAt,
          minRank: contests.minRank,
        })
        .from(contests)
        .where(
          and(eq(contests.id, id), eq(contests.status, 'scheduled'), gt(contests.startsAt, now)),
        )
        .limit(1);
      return row ?? null;
    },

    async unknownSymbols(symbols) {
      if (symbols.length === 0) return [];
      const upper = symbols.map((s) => s.toUpperCase());
      const found = await db
        .select({ symbol: tokens.symbol })
        .from(tokens)
        .where(inArray(tokens.symbol, upper));
      const foundSet = new Set(found.map((r) => r.symbol));
      return upper.filter((s) => !foundSet.has(s));
    },

    async create({ userId, contestId, picks }) {
      const [row] = await db
        .insert(entries)
        .values({
          userId,
          contestId,
          picks,
        })
        .returning({ id: entries.id, submittedAt: entries.submittedAt });
      if (!row) throw new Error('Failed to insert entry');
      return row;
    },
  };
}
