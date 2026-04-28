import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { contests, entries } from '../../db/schema/index.js';
import type { ContestsRepo, ContestRowFromRepo, CreateContestArgs } from './contests.service.js';

const MAX_CENTS_AS_NUMBER = BigInt(Number.MAX_SAFE_INTEGER);

function rowFromDbRow(
  row: typeof contests.$inferSelect,
  spotsFilled: number,
  userHasEntered: boolean,
): ContestRowFromRepo {
  // Guard against silent precision loss on bigint→number cast.
  // 2^53 cents ≈ $90T — if we ever cross this we have bigger problems.
  if (row.entryFeeCents > MAX_CENTS_AS_NUMBER || row.prizePoolCents > MAX_CENTS_AS_NUMBER) {
    throw new Error(
      `contest ${row.id} has cents value exceeding Number.MAX_SAFE_INTEGER — wire shape would lose precision`,
    );
  }
  return {
    id: row.id,
    name: row.name,
    status: row.status as ContestRowFromRepo['status'],
    entryFeeCents: Number(row.entryFeeCents),
    prizePoolCents: Number(row.prizePoolCents),
    maxCapacity: row.maxCapacity,
    spotsFilled,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    isFeatured: row.isFeatured,
    userHasEntered,
  };
}

export function createContestsRepo(db: Database): ContestsRepo {
  return {
    async list({ filter, userId }) {
      const baseQuery = db
        .select({
          row: contests,
          spotsFilled: sql<number>`(SELECT COUNT(*)::int FROM ${entries} WHERE ${entries.contestId} = ${contests.id})`,
          userHasEntered: userId
            ? sql<boolean>`EXISTS (SELECT 1 FROM ${entries} WHERE ${entries.contestId} = ${contests.id} AND ${entries.userId} = ${userId})`
            : sql<boolean>`false`,
        })
        .from(contests)
        .$dynamic();

      let rows: Array<{
        row: typeof contests.$inferSelect;
        spotsFilled: number;
        userHasEntered: boolean;
      }>;

      if (filter === 'cash') {
        rows = await baseQuery
          .where(and(eq(contests.status, 'scheduled'), sql`${contests.entryFeeCents} > 0`))
          .orderBy(sql`${contests.isFeatured} DESC`, sql`${contests.startsAt} ASC`);
      } else if (filter === 'free') {
        rows = await baseQuery
          .where(and(eq(contests.status, 'scheduled'), sql`${contests.entryFeeCents} = 0`))
          .orderBy(sql`${contests.isFeatured} DESC`, sql`${contests.startsAt} ASC`);
      } else {
        // 'my'
        if (!userId) return [];
        rows = await baseQuery
          .where(
            sql`EXISTS (SELECT 1 FROM ${entries} WHERE ${entries.contestId} = ${contests.id} AND ${entries.userId} = ${userId})`,
          )
          .orderBy(sql`${contests.isFeatured} DESC`, sql`${contests.startsAt} ASC`);
      }

      return rows.map((r) => rowFromDbRow(r.row, r.spotsFilled, r.userHasEntered));
    },

    async getById(id, userId) {
      const [r] = await db
        .select({
          row: contests,
          spotsFilled: sql<number>`(SELECT COUNT(*)::int FROM ${entries} WHERE ${entries.contestId} = ${contests.id})`,
          userHasEntered: userId
            ? sql<boolean>`EXISTS (SELECT 1 FROM ${entries} WHERE ${entries.contestId} = ${contests.id} AND ${entries.userId} = ${userId})`
            : sql<boolean>`false`,
        })
        .from(contests)
        .where(eq(contests.id, id))
        .limit(1);
      if (!r) return null;
      return rowFromDbRow(r.row, r.spotsFilled, r.userHasEntered);
    },

    async create(args: CreateContestArgs) {
      const [row] = await db
        .insert(contests)
        .values({
          name: args.name,
          entryFeeCents: BigInt(args.entryFeeCents),
          prizePoolCents: BigInt(args.prizePoolCents),
          maxCapacity: args.maxCapacity,
          startsAt: args.startsAt,
          endsAt: args.endsAt,
          isFeatured: args.isFeatured,
          createdByUserId: args.createdByUserId,
        })
        .returning({ id: contests.id });
      if (!row) throw new Error('Failed to insert contest');
      return row;
    },
  };
}
