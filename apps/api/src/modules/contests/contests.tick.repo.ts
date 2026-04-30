import { and, eq, inArray, lt, lte, or, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { contests, entries, priceSnapshots, tokens } from '../../db/schema/index.js';
import type { CancelContestResult } from '../admin/admin.cancel.js';
import type { ContestsFinalizeRepo } from './contests.finalize.repo.js';
import type { ContestsTickRepo } from './contests.tick.service.js';

export function createContestsTickRepo(
  db: Database,
  finalize: ContestsFinalizeRepo,
  cancel: (args: { contestId: string }) => Promise<CancelContestResult>,
): ContestsTickRepo {
  return {
    async findContestsToLock() {
      const now = new Date();
      const rows = await db
        .select({
          id: contests.id,
          startsAt: contests.startsAt,
          endsAt: contests.endsAt,
          maxCapacity: contests.maxCapacity,
          durationLane: contests.durationLane,
          realEntries: sql<number>`(SELECT COUNT(*)::int FROM ${entries} WHERE ${entries.contestId} = ${contests.id} AND ${entries.userId} IS NOT NULL)`,
        })
        .from(contests)
        .where(and(eq(contests.status, 'scheduled'), lte(contests.startsAt, now)));
      return rows;
    },

    async findContestsToFinalize() {
      const now = new Date();
      const rows = await db
        .select({
          id: contests.id,
          startsAt: contests.startsAt,
          endsAt: contests.endsAt,
          maxCapacity: contests.maxCapacity,
          realEntries: sql<number>`(SELECT COUNT(*)::int FROM ${entries} WHERE ${entries.contestId} = ${contests.id} AND ${entries.userId} IS NOT NULL)`,
        })
        .from(contests)
        .where(and(eq(contests.status, 'active'), lte(contests.endsAt, now)));
      return rows;
    },

    async getTokensInPicks(contestId) {
      const symbolsRaw = await db.execute<{ symbol: string }>(
        sql`SELECT DISTINCT (pick->>'symbol')::text AS symbol
            FROM ${entries}, jsonb_array_elements(${entries.picks}::jsonb) pick
            WHERE ${entries.contestId} = ${contestId}`,
      );
      const symbols = (symbolsRaw as unknown as Array<{ symbol: string }>).map((r) => r.symbol);
      if (symbols.length === 0) return [];

      const rows = await db
        .select({ symbol: tokens.symbol, lastUpdatedAt: tokens.lastUpdatedAt })
        .from(tokens)
        .where(inArray(tokens.symbol, symbols));
      return rows;
    },

    async getRealEntryCount(contestId) {
      const [r] = await db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(entries)
        .where(and(eq(entries.contestId, contestId), sql`${entries.userId} IS NOT NULL`));
      return r?.n ?? 0;
    },

    async listSymbols() {
      const rows = await db.select({ symbol: tokens.symbol }).from(tokens).limit(500);
      return rows.map((r) => r.symbol);
    },

    async lockAndSpawn({ contestId, maxCapacity, botPicks }) {
      let botsInserted = 0;
      await db.transaction(async (tx) => {
        await tx.update(contests).set({ status: 'active' }).where(eq(contests.id, contestId));

        // Recount real entries inside the tx so a late submit can't push us over capacity.
        const [realCountRow] = await tx
          .select({ n: sql<number>`COUNT(*)::int` })
          .from(entries)
          .where(and(eq(entries.contestId, contestId), sql`${entries.userId} IS NOT NULL`));
        const realCount = realCountRow?.n ?? 0;
        const seatsLeft = Math.max(0, maxCapacity - realCount);
        const trimmedBotPicks = botPicks.slice(0, seatsLeft);

        const symbolsRaw = await tx.execute<{ symbol: string }>(
          sql`SELECT DISTINCT (pick->>'symbol')::text AS symbol
              FROM ${entries}, jsonb_array_elements(${entries.picks}::jsonb) pick
              WHERE ${entries.contestId} = ${contestId}`,
        );
        const realSymbols = (symbolsRaw as unknown as Array<{ symbol: string }>).map(
          (r) => r.symbol,
        );
        const botSymbols = trimmedBotPicks.flatMap((b) => b.picks.map((p) => p.symbol));
        const symbolSet = new Set<string>([...realSymbols, ...botSymbols]);

        if (symbolSet.size > 0) {
          const tokenRows = await tx
            .select({
              id: tokens.id,
              symbol: tokens.symbol,
              currentPriceUsd: tokens.currentPriceUsd,
            })
            .from(tokens)
            .where(inArray(tokens.symbol, [...symbolSet]));

          for (const t of tokenRows) {
            if (t.currentPriceUsd === null) continue;
            await tx
              .insert(priceSnapshots)
              .values({
                contestId,
                tokenId: t.id,
                phase: 'start',
                priceUsd: t.currentPriceUsd,
              })
              .onConflictDoNothing();
          }
        }

        if (trimmedBotPicks.length > 0) {
          const rows = trimmedBotPicks.map((b) => ({
            contestId,
            userId: null,
            isBot: true,
            botHandle: b.handle,
            picks: b.picks,
          }));
          await tx.insert(entries).values(rows);
        }
        botsInserted = trimmedBotPicks.length;
      });
      return { botsInserted };
    },

    async finalizeStart({ contestId }) {
      await db.transaction(async (tx) => {
        await tx.update(contests).set({ status: 'finalizing' }).where(eq(contests.id, contestId));

        const symbolsRaw = await tx.execute<{ symbol: string }>(
          sql`SELECT DISTINCT (pick->>'symbol')::text AS symbol
              FROM ${entries}, jsonb_array_elements(${entries.picks}::jsonb) pick
              WHERE ${entries.contestId} = ${contestId}`,
        );
        const symbols = (symbolsRaw as unknown as Array<{ symbol: string }>).map((r) => r.symbol);
        if (symbols.length === 0) return;

        const tokenRows = await tx
          .select({ id: tokens.id, currentPriceUsd: tokens.currentPriceUsd })
          .from(tokens)
          .where(inArray(tokens.symbol, symbols));

        for (const t of tokenRows) {
          if (t.currentPriceUsd === null) continue;
          await tx
            .insert(priceSnapshots)
            .values({
              contestId,
              tokenId: t.id,
              phase: 'end',
              priceUsd: t.currentPriceUsd,
            })
            .onConflictDoNothing();
        }
      });
    },

    async findContestsToFinalize2() {
      return finalize.findContestsToFinalize2();
    },

    async finalize(contestId) {
      return finalize.finalize(contestId);
    },

    async findStaleContests(thresholdMs) {
      // Per-status stuck detection: a contest is considered stuck when the
      // lifecycle marker relevant to its current state is `thresholdMs`
      // older than now.
      //   - scheduled  → should have locked by startsAt + thresholdMs
      //   - active     → should have finalized by endsAt + thresholdMs
      //   - finalizing → payouts should have completed by endsAt + thresholdMs
      // Plus a separate abnormal-duration safety net for legacy rows whose
      // (endsAt - startsAt) span is hours/days — those need cancelling
      // regardless of where they are in the lifecycle.
      const cutoff = new Date(Date.now() - thresholdMs);
      const ABNORMAL_DURATION_S = 60 * 60; // 1 h
      const rows = await db
        .select({ id: contests.id })
        .from(contests)
        .where(
          or(
            and(eq(contests.status, 'scheduled'), lt(contests.startsAt, cutoff)),
            and(eq(contests.status, 'active'), lt(contests.endsAt, cutoff)),
            and(eq(contests.status, 'finalizing'), lt(contests.endsAt, cutoff)),
            and(
              or(eq(contests.status, 'scheduled'), eq(contests.status, 'active')),
              sql`(${contests.endsAt} - ${contests.startsAt}) > make_interval(secs => ${ABNORMAL_DURATION_S})`,
            ),
          ),
        );
      return rows;
    },

    async cancelContest(contestId) {
      return cancel({ contestId });
    },
  };
}
