import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { contests, entries, priceSnapshots, tokens, users } from '../../db/schema/index.js';
import type { EntrySnapshot, LeaderboardRepo } from './leaderboard.service.js';

export function createLeaderboardRepo(db: Database): LeaderboardRepo {
  return {
    async getContest(id) {
      const [c] = await db
        .select({
          id: contests.id,
          name: contests.name,
          status: contests.status,
          startsAt: contests.startsAt,
          endsAt: contests.endsAt,
          prizePoolCents: contests.prizePoolCents,
          entryFeeCents: contests.entryFeeCents,
          type: contests.type,
        })
        .from(contests)
        .where(eq(contests.id, id))
        .limit(1);
      if (!c) return null;
      return {
        id: c.id,
        name: c.name,
        status: c.status as 'scheduled' | 'active' | 'finalizing' | 'finalized' | 'cancelled',
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        prizePoolCents: Number(c.prizePoolCents),
        entryFeeCents: Number(c.entryFeeCents),
        type: c.type === 'bear' ? 'bear' : 'bull',
      };
    },

    async getEntries(contestId) {
      const rows = await db
        .select({
          entryId: entries.id,
          isBot: entries.isBot,
          userId: entries.userId,
          botHandle: entries.botHandle,
          submittedAt: entries.submittedAt,
          picks: entries.picks,
        })
        .from(entries)
        .where(eq(entries.contestId, contestId));

      return rows.map<EntrySnapshot>((r) => ({
        entryId: r.entryId,
        isBot: r.isBot,
        userId: r.userId,
        botHandle: r.botHandle,
        submittedAt: r.submittedAt,
        picks: (r.picks as Array<{ symbol: string; alloc: number }>) ?? [],
      }));
    },

    async getPriceSnapshots(contestId, phase) {
      const rows = await db
        .select({ symbol: tokens.symbol, priceUsd: priceSnapshots.priceUsd })
        .from(priceSnapshots)
        .innerJoin(tokens, eq(priceSnapshots.tokenId, tokens.id))
        .where(and(eq(priceSnapshots.contestId, contestId), eq(priceSnapshots.phase, phase)));
      return new Map(rows.map((r) => [r.symbol, Number(r.priceUsd)]));
    },

    async getCurrentPrices(symbols) {
      if (symbols.length === 0) return new Map();
      const rows = await db
        .select({ symbol: tokens.symbol, priceUsd: tokens.currentPriceUsd })
        .from(tokens)
        .where(inArray(tokens.symbol, symbols));
      const m = new Map<string, number>();
      for (const r of rows) {
        if (r.priceUsd !== null) m.set(r.symbol, Number(r.priceUsd));
      }
      return m;
    },

    async getMyEntry(contestId, userId) {
      const [r] = await db
        .select({
          entryId: entries.id,
          isBot: entries.isBot,
          userId: entries.userId,
          botHandle: entries.botHandle,
          submittedAt: entries.submittedAt,
          picks: entries.picks,
        })
        .from(entries)
        .where(and(eq(entries.contestId, contestId), eq(entries.userId, userId)))
        .limit(1);
      if (!r) return null;
      return {
        entryId: r.entryId,
        isBot: r.isBot,
        userId: r.userId,
        botHandle: r.botHandle,
        submittedAt: r.submittedAt,
        picks: (r.picks as Array<{ symbol: string; alloc: number }>) ?? [],
      };
    },

    async getProfileForUser(userId) {
      const [u] = await db
        .select({
          firstName: users.firstName,
          username: users.username,
          photoUrl: users.photoUrl,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return {
        displayName: u?.firstName ?? u?.username ?? 'Player',
        avatarUrl: u?.photoUrl ?? null,
      };
    },

    async getImagesBySymbols(symbols) {
      if (symbols.length === 0) return new Map();
      const rows = await db
        .select({ symbol: tokens.symbol, imageUrl: tokens.imageUrl })
        .from(tokens)
        .where(inArray(tokens.symbol, symbols));
      return new Map(rows.map((r) => [r.symbol, r.imageUrl]));
    },
  };
}
