import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  computeActualPrizeCents,
  computeLinearPracticeCurve,
  computePrizeCurve,
  virtualBudgetCentsFor,
  type PrizeFormat,
} from '@fantasytoken/shared';
import type { Database } from '../../db/client.js';
import { contests, entries } from '../../db/schema/index.js';
import type { ContestsRepo, ContestRowFromRepo, CreateContestArgs } from './contests.service.js';

const MAX_CENTS_AS_NUMBER = BigInt(Number.MAX_SAFE_INTEGER);

/** Sum of all per-rank prizes from the linear Practice curve. House-funded;
 * scales ~1.5×N. Used to display a believable PRIZE POOL on the lobby card
 * instead of the legacy hardcoded 5n that didn't scale. */
function sumLinearCurve(N: number): number {
  if (N <= 0) return 0;
  const m = computeLinearPracticeCurve(N);
  let sum = 0;
  for (const v of m.values()) sum += v;
  return sum;
}

function rowFromDbRow(
  row: typeof contests.$inferSelect,
  spotsFilled: number,
  _realSpotsFilled: number,
  rakePct: number,
  userHasEntered: boolean,
): ContestRowFromRepo {
  // Guard against silent precision loss on bigint→number cast.
  // 2^53 cents ≈ $90T — if we ever cross this we have bigger problems.
  if (row.entryFeeCents > MAX_CENTS_AS_NUMBER || row.prizePoolCents > MAX_CENTS_AS_NUMBER) {
    throw new Error(
      `contest ${row.id} has cents value exceeding Number.MAX_SAFE_INTEGER — wire shape would lose precision`,
    );
  }
  // Projected pool. Pre-lock the actual lock-time count is unknown; for
  // open scheduled Practice/Marathon we use the LIVE spotsFilled (real
  // synthetic+real entries) so the lobby shows a believable, growing
  // number — not the static room cap. For paid contests we still fall
  // back to maxCapacity pre-lock because their pool is pari-mutuel and
  // depends on the final filled count.
  const poolCountForPaid = row.status === 'scheduled' ? row.maxCapacity : spotsFilled;
  // Practice / Marathon (`payAll`) use a linear house-funded curve:
  // sum of all per-rank prizes from `computeLinearPracticeCurve(N)`.
  // Static `prize_pool_cents=5` from the migration is misleading —
  // it doesn't scale with N and was the legacy hardcode.
  const dynamicPool = row.payAll
    ? sumLinearCurve(spotsFilled || row.maxCapacity)
    : computeActualPrizeCents({
        totalCount: poolCountForPaid,
        entryFeeCents: Number(row.entryFeeCents),
        rakePct,
        guaranteedPoolCents: Number(row.prizePoolCents),
      });
  return {
    id: row.id,
    name: row.name,
    type: row.type === 'bear' ? 'bear' : 'bull',
    status: row.status as ContestRowFromRepo['status'],
    entryFeeCents: Number(row.entryFeeCents),
    prizePoolCents: dynamicPool,
    maxCapacity: row.maxCapacity,
    spotsFilled,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    isFeatured: row.isFeatured,
    minRank: row.minRank,
    payAll: row.payAll,
    // ADR-0003: virtualBudgetCents is derived from entryFeeCents via the
    // shared tier ladder. The DB column exists as a future-override hook;
    // we ignore its value here so all contests get a consistent UX without
    // requiring admins to set the field manually for every new contest.
    virtualBudgetCents: virtualBudgetCentsFor(Number(row.entryFeeCents)),
    userHasEntered,
    // ADR-0008: prize structure metadata for the lobby card.
    // We compute the curve over the projected pool so "Win up to" /
    // "min cash" / "Top X paid" are accurate before lock-in.
    ...prizeStructureFor(
      row.prizeFormat as PrizeFormat,
      spotsFilled || row.maxCapacity,
      dynamicPool,
    ),
  };
}

/** Derive UI-friendly summary for a row's prize structure. */
function prizeStructureFor(
  format: PrizeFormat,
  N: number,
  pool: number,
): { prizeFormat: PrizeFormat; payingRanks: number; topPrize: number; minCash: number } {
  const curve = computePrizeCurve(N, pool, { format });
  const ranks = [...curve.keys()].sort((a, b) => a - b);
  const lastRank = ranks[ranks.length - 1] ?? 0;
  return {
    prizeFormat: format,
    payingRanks: ranks.length,
    topPrize: curve.get(1) ?? 0,
    minCash: lastRank > 0 ? (curve.get(lastRank) ?? 0) : 0,
  };
}

export function createContestsRepo(db: Database, rakePct: number): ContestsRepo {
  return {
    async list({ filter, userId }) {
      const baseQuery = db.select({ row: contests }).from(contests).$dynamic();

      // Lobby v2 (DESIGN.md §4) needs ACTIVE contests for the Watch zone too,
      // not just scheduled. Pre-v2 we only ever showed scheduled because the
      // sole UX surface was "join now"; spectator mode broke that assumption.
      const inProgress = sql`${contests.status} IN ('scheduled','active')`;

      let rows: Array<{ row: typeof contests.$inferSelect }>;
      if (filter === 'cash') {
        rows = await baseQuery
          .where(and(inProgress, sql`${contests.entryFeeCents} > 0`))
          .orderBy(sql`${contests.isFeatured} DESC`, sql`${contests.startsAt} ASC`);
      } else if (filter === 'free') {
        rows = await baseQuery
          .where(and(inProgress, sql`${contests.entryFeeCents} = 0`))
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
      const realCounts = await countRealSpots(db, contestIds);
      const enteredSet = userId ? await getEnteredSet(db, userId, contestIds) : new Set<string>();
      return rows.map((r) =>
        rowFromDbRow(
          r.row,
          counts.get(r.row.id) ?? 0,
          realCounts.get(r.row.id) ?? 0,
          rakePct,
          enteredSet.has(r.row.id),
        ),
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
      const realCounts = await countRealSpots(db, [id]);
      const enteredSet = userId ? await getEnteredSet(db, userId, [id]) : new Set<string>();
      return rowFromDbRow(
        r.row,
        counts.get(id) ?? 0,
        realCounts.get(id) ?? 0,
        rakePct,
        enteredSet.has(id),
      );
    },

    async create(args: CreateContestArgs) {
      // Contests v2 (ADR-0004) makes mode/durationLane/stakeTier NOT NULL.
      // The admin/legacy create() path doesn't carry matrix metadata, so we
      // pin sensible defaults: bull · 10m · c1. Production contest creation
      // goes through the matrix scheduler (contests.scheduler.ts) which
      // populates these from the cell definition.
      const [row] = await db
        .insert(contests)
        .values({
          name: args.name,
          type: 'bull',
          mode: 'bull',
          durationLane: '10m',
          stakeTier: 'c1',
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

async function countRealSpots(db: Database, contestIds: string[]): Promise<Map<string, number>> {
  if (contestIds.length === 0) return new Map();
  const rows = await db
    .select({ contestId: entries.contestId, n: sql<number>`COUNT(*)::int` })
    .from(entries)
    .where(and(inArray(entries.contestId, contestIds), eq(entries.isBot, false)))
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
