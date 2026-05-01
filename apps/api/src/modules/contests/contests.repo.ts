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
    // Attached in `attachMirror` (post-pass) since it requires the full
    // sibling list. Default null keeps the row complete when consumed
    // outside the lobby list (e.g. getById).
    mirrorContestId: null,
  };
}

/** ADR-0009: pair every FILLED row in the lobby list with a non-full
 * sibling (same matrix_cell_key) so the card can render an "open a
 * seat in the next instance" CTA. Pure function over the already-
 * computed items + db rows; runs in O(n). */
function attachMirror(
  items: ContestRowFromRepo[],
  rows: Array<{ row: typeof contests.$inferSelect }>,
): ContestRowFromRepo[] {
  const cellKeyById = new Map<string, string>();
  for (const r of rows) {
    if (r.row.matrixCellKey) cellKeyById.set(r.row.id, r.row.matrixCellKey);
  }
  // Group items by cell key so we can pick the best sibling with one
  // pass per group.
  const byCell = new Map<string, ContestRowFromRepo[]>();
  for (const it of items) {
    const k = cellKeyById.get(it.id);
    if (!k) continue;
    const arr = byCell.get(k) ?? [];
    arr.push(it);
    byCell.set(k, arr);
  }
  return items.map((it) => {
    if (it.spotsFilled < it.maxCapacity) return it;
    const k = cellKeyById.get(it.id);
    if (!k) return it;
    const sibs = byCell.get(k) ?? [];
    // Most spots-left wins; ties broken by latest startsAt (freshest).
    const candidate = sibs
      .filter((s) => s.id !== it.id && s.spotsFilled < s.maxCapacity)
      .sort((a, b) => {
        const aLeft = a.maxCapacity - a.spotsFilled;
        const bLeft = b.maxCapacity - b.spotsFilled;
        if (bLeft !== aLeft) return bLeft - aLeft;
        return b.startsAt.localeCompare(a.startsAt);
      })[0];
    return candidate ? { ...it, mirrorContestId: candidate.id } : it;
  });
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
      const items = rows.map((r) =>
        rowFromDbRow(
          r.row,
          counts.get(r.row.id) ?? 0,
          realCounts.get(r.row.id) ?? 0,
          rakePct,
          enteredSet.has(r.row.id),
        ),
      );
      // ADR-0009: pair every FILLED row with a sibling that still has a
      // seat. Siblings share matrix_cell_key (auto-generated server-side
      // from lane/stake/mode/name). Pick the one with most spots-left so
      // the player gets the freshest replica even if multiple exist.
      return attachMirror(items, rows);
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
