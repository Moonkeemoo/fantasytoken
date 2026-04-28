import { and, eq, inArray, sql } from 'drizzle-orm';
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
      const baseQuery = db.select({ row: contests }).from(contests).$dynamic();

      let rows: Array<{ row: typeof contests.$inferSelect }>;
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
        const myContestIds = await db
          .selectDistinct({ contestId: entries.contestId })
          .from(entries)
          .where(eq(entries.userId, userId));
        const ids = myContestIds.map((r) => r.contestId);
        if (ids.length === 0) return [];
        rows = await baseQuery
          .where(inArray(contests.id, ids))
          .orderBy(sql`${contests.isFeatured} DESC`, sql`${contests.startsAt} ASC`);
      }

      const contestIds = rows.map((r) => r.row.id);
      const counts = await countSpots(db, contestIds);
      const enteredSet = userId ? await getEnteredSet(db, userId, contestIds) : new Set<string>();
      return rows.map((r) =>
        rowFromDbRow(r.row, counts.get(r.row.id) ?? 0, enteredSet.has(r.row.id)),
      );
    },

    async getById(id, userId) {
      const [r] = await db
        .select({ row: contests })
        .from(contests)
        .where(eq(contests.id, id))
        .limit(1);
      if (!r) return null;
      const counts = await countSpots(db, [id]);
      const enteredSet = userId ? await getEnteredSet(db, userId, [id]) : new Set<string>();
      return rowFromDbRow(r.row, counts.get(id) ?? 0, enteredSet.has(id));
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

async function countSpots(db: Database, contestIds: string[]): Promise<Map<string, number>> {
  if (contestIds.length === 0) return new Map();
  const rows = await db
    .select({ contestId: entries.contestId, n: sql<number>`COUNT(*)::int` })
    .from(entries)
    .where(inArray(entries.contestId, contestIds))
    .groupBy(entries.contestId);
  return new Map(rows.map((r) => [r.contestId, r.n]));
}

async function getEnteredSet(
  db: Database,
  userId: string,
  contestIds: string[],
): Promise<Set<string>> {
  if (contestIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ contestId: entries.contestId })
    .from(entries)
    .where(and(eq(entries.userId, userId), inArray(entries.contestId, contestIds)));
  return new Set(rows.map((r) => r.contestId));
}
