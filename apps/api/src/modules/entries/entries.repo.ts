import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { contests, entries, tokens, users } from '../../db/schema/index.js';
import type { LineupSummary } from '@fantasytoken/shared';
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

    async listPublicLineups({ contestId, filter, limit }) {
      // INV-3 contract: picks JSONB shape is `[{symbol, alloc}]`. We strip
      // alloc here so the privacy contract is enforced at the data layer
      // (handoff §13 Q5: pre-kickoff returns symbols only — no PnL/stake).
      const orderClause =
        filter === 'recent' ? desc(entries.submittedAt) : asc(entries.submittedAt);
      const rows = await db
        .select({
          username: users.username,
          firstName: users.firstName,
          botHandle: entries.botHandle,
          isBot: entries.isBot,
          submittedAt: entries.submittedAt,
          picks: entries.picks,
        })
        .from(entries)
        .leftJoin(users, eq(users.id, entries.userId))
        .where(eq(entries.contestId, contestId))
        .orderBy(orderClause)
        .limit(limit);

      const lineups: LineupSummary[] = rows.map((r) => {
        const handleSrc = r.username ?? r.firstName ?? r.botHandle ?? (r.isBot ? 'bot' : 'player');
        const picksRaw = Array.isArray(r.picks) ? r.picks : [];
        const symbols = picksRaw
          .map((p) => (p && typeof p === 'object' && 'symbol' in p ? String(p.symbol) : ''))
          .filter((s) => s.length > 0);
        return {
          user: handleSrc,
          submittedAt: r.submittedAt.toISOString(),
          picks: symbols,
        };
      });

      return { lineups, total: lineups.length };
    },
  };
}
