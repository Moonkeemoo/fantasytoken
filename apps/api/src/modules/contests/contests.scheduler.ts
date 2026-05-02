import { eq, inArray, isNotNull, sql as dsql } from 'drizzle-orm';
import {
  effectiveCapacity,
  effectivePrizeFormat,
  effectiveXpMultiplier,
  LANE_DURATION_MS,
  LANE_FILL_MS,
  MATRIX_CELLS,
  STAKE_AMOUNT_COINS,
  type MatrixCell,
} from '@fantasytoken/shared';
import type { Database } from '../../db/client.js';
import { contests, entries, users } from '../../db/schema/index.js';
import type { Logger } from '../../logger.js';

/**
 * Contests v2 matrix scheduler — see `docs/specs/contests-v2/DESIGN.md`.
 *
 * Two passes per tick:
 *
 * 1. **Cold spawn** — for each cell with NO live (scheduled or active)
 *    instance, create the next one with the lane-appropriate fill window
 *    + play duration + xp_multiplier.
 *
 * 2. **Auto-replicate (ADR-0009)** — for each short-lane cell whose live
 *    instance(s) are ALL ≥AUTO_REPLICATE_FILL_PCT full of real users AND
 *    whose youngest sibling is older than AUTO_REPLICATE_AGE_MS, spawn a
 *    fresh sibling starting now+fill. Lobby UI then surfaces a "FILLED —
 *    open a seat in the next instance" CTA on the full card pointing at
 *    the new sibling. Skipped for 24h/7d cells (huge capacity + clock-
 *    anchored kickoffs make replication semantically confusing).
 *
 * Race protection is app-level: the scheduler runs on a single instance
 * with a 60s tick. We removed the partial UNIQUE index in 0023.
 *
 * Special cases:
 *   - Marathon (`weeklyMonday=true`): only spawn on Monday UTC, alternating
 *     bull/bear by ISO week parity. Other weekdays = no-op.
 *   - 24h/7d cells: anchored to fixed UTC clocks via `staggerOffsetSec`,
 *     so multiple cells of the same lane don't all kick off at the same
 *     wall-clock instant.
 */

/** Trigger replication when the existing instance(s) for a cell hit
 * this fraction of capacity. 0.9 = "90% full". Pre-spawn at 90% so the
 * "FILLED" cliff has a CTA the moment the card flips to 100%. */
const AUTO_REPLICATE_FILL_PCT = 0.9;
/** Don't replicate if a sibling was spawned recently — avoids spawning
 * a 3rd instance the very tick after #2 went up. The 60s scheduler
 * cadence + this guard keeps the chain at most one-replica-per-cell-
 * per-minute even if fill saturates. */
const AUTO_REPLICATE_MIN_GAP_MS = 60_000;

export interface SchedulerServiceDeps {
  db: Database;
  log: Logger;
  /** TG ID of an admin user; created lazily, used as createdByUserId so
   * legacy queries that filter by admin-owned contests still work. */
  adminTelegramId: number;
  /** Test seam — tests pass a fixed Date; production passes Date.now(). */
  now?: () => Date;
}

export interface SchedulerService {
  schedule(): Promise<{ created: number; replicated: number; gcCancelled: number }>;
}

export function createSchedulerService(deps: SchedulerServiceDeps): SchedulerService {
  const now = deps.now ?? (() => new Date());

  return {
    async schedule() {
      const adminId = await ensureAdminUser(deps);

      // Pass 0 — GC: cancel `scheduled` rows whose `starts_at` has already
      // passed and that hold no real entries. These are zero-stake-zero-loss
      // cleanups: no user paid an entry fee, so no REFUND is owed; the
      // tick-pipeline lock fell behind (e.g. a wave from auto-replicate
      // outpaced the lock budget) and they'd otherwise pile up forever,
      // eventually blowing past postgres' 65534-parameter ceiling on the
      // `loadLiveByCell` SELECT. This keeps the live+scheduled set bounded
      // by real demand, not by historical scheduler churn.
      const gcCancelled = await gcEmptyOverdueScheduled(deps);

      const liveByCell = await loadLiveByCell(deps.db);

      let created = 0;
      let replicated = 0;
      for (const cell of MATRIX_CELLS) {
        const liveSiblings = liveByCell.get(cell.key) ?? [];

        // Pass 1 — cold spawn (no live instance for this cell).
        if (liveSiblings.length === 0) {
          if (!shouldSpawnNow(cell, now())) continue;
          try {
            await spawnCellInstance({ db: deps.db, cell, adminId, now: now() });
            created += 1;
            deps.log.info({ cell: cell.key, name: cell.name }, 'scheduler.spawn');
          } catch (err: unknown) {
            const code = (err as { code?: string }).code;
            if (code === '23505') {
              deps.log.debug({ cell: cell.key }, 'scheduler.spawn race (ignored)');
              continue;
            }
            deps.log.warn({ err, cell: cell.key }, 'scheduler.spawn failed');
          }
          continue;
        }

        // Pass 2 — auto-replicate (ADR-0009). Only short lanes (10m/30m/1h);
        // 24h/7d already have huge capacity + clock-anchored kickoffs.
        if (cell.lane === '24h' || cell.lane === '7d') continue;
        if (cell.weeklyMonday) continue;
        if (!shouldReplicateNow({ cell, siblings: liveSiblings, at: now() })) continue;

        try {
          await spawnCellInstance({ db: deps.db, cell, adminId, now: now() });
          replicated += 1;
          deps.log.info(
            { cell: cell.key, name: cell.name, siblings: liveSiblings.length },
            'scheduler.replicate',
          );
        } catch (err: unknown) {
          deps.log.warn({ err, cell: cell.key }, 'scheduler.replicate failed');
        }
      }

      if (created > 0 || replicated > 0 || gcCancelled > 0) {
        deps.log.info({ created, replicated, gcCancelled }, 'scheduler.tick');
      }
      return { created, replicated, gcCancelled };
    },
  };
}

/**
 * Cancel `scheduled` rows that the lock pipeline never picked up
 * (`starts_at` is in the past) and that hold zero real entries.
 *
 * Bulk single-statement UPDATE — atomic, idempotent, INV-9-safe (no
 * money moves; the empty-entries predicate guarantees there is nothing
 * to refund). Logged but never throws; INV-7 — a GC failure must not
 * stop the spawn passes from running.
 *
 * Returns the number of rows cancelled.
 */
async function gcEmptyOverdueScheduled(deps: SchedulerServiceDeps): Promise<number> {
  try {
    const result = await deps.db
      .update(contests)
      .set({ status: 'cancelled' })
      .where(
        dsql`${contests.status} = 'scheduled'
             AND ${contests.startsAt} < now()
             AND NOT EXISTS (
               SELECT 1 FROM ${entries}
                WHERE ${entries.contestId} = ${contests.id}
                  AND ${entries.userId} IS NOT NULL
             )`,
      );
    // drizzle's UPDATE result shape varies by driver; postgres-js returns
    // the rows-affected count under `.count`. Default to 0 if absent.
    const cancelled = (result as { count?: number }).count ?? 0;
    if (cancelled > 0) {
      deps.log.info({ cancelled }, 'scheduler.gc cancelled overdue empty');
    }
    return cancelled;
  } catch (err) {
    deps.log.warn({ err }, 'scheduler.gc failed (non-fatal)');
    return 0;
  }
}

/** Replicate when EVERY live sibling is ≥AUTO_REPLICATE_FILL_PCT full
 * AND the youngest one was created at least AUTO_REPLICATE_MIN_GAP_MS
 * ago. The age guard avoids spawning a third instance the same minute
 * the second went up. Exported for unit-testing the decision logic
 * without touching the DB. */
export function shouldReplicateNow(args: {
  cell: MatrixCell;
  siblings: ReadonlyArray<LiveSibling>;
  at: Date;
}): boolean {
  const { cell, siblings, at } = args;
  if (siblings.length === 0) return false;
  const cap = effectiveCapacity(cell);
  if (cap <= 0) return false;
  const allFull = siblings.every((s) => s.realFilled / cap >= AUTO_REPLICATE_FILL_PCT);
  if (!allFull) return false;
  const youngest = siblings.reduce((acc, s) => Math.max(acc, s.createdAt.getTime()), 0);
  return at.getTime() - youngest >= AUTO_REPLICATE_MIN_GAP_MS;
}

async function ensureAdminUser(deps: SchedulerServiceDeps): Promise<string> {
  const [existing] = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.telegramId, deps.adminTelegramId))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await deps.db
    .insert(users)
    .values({
      telegramId: deps.adminTelegramId,
      username: 'admin',
      firstName: 'Admin',
    })
    .returning({ id: users.id });
  if (!created) throw new Error('failed to create admin user');
  return created.id;
}

export interface LiveSibling {
  id: string;
  createdAt: Date;
  /** Real (non-bot) entries currently submitted on this contest. The
   * replicate decision uses the real-only count so synth fillers don't
   * trigger replication on cells that real users haven't yet found. */
  realFilled: number;
}

async function loadLiveByCell(db: Database): Promise<Map<string, LiveSibling[]>> {
  const rows = await db
    .select({
      id: contests.id,
      key: contests.matrixCellKey,
      status: contests.status,
      createdAt: contests.createdAt,
    })
    .from(contests)
    .where(
      dsql`${contests.status} IN ('scheduled', 'active') AND ${isNotNull(contests.matrixCellKey)}`,
    );
  if (rows.length === 0) return new Map();

  // Chunk inArray to stay under postgres' 65534-param ceiling. With short-lane
  // auto-replicate (ADR-0009) the live+scheduled set can balloon past 65k rows
  // before the operator notices, and a single bulk SELECT with that many ids
  // crashes the worker with MAX_PARAMETERS_EXCEEDED → OOM loop. 5000 per chunk
  // is well below the limit and adds only N/5000 extra round-trips.
  const ids = rows.map((r) => r.id);
  const CHUNK = 5000;
  const byId = new Map<string, number>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const counts = await db
      .select({
        contestId: entries.contestId,
        n: dsql<number>`COUNT(*)::int`,
      })
      .from(entries)
      .where(dsql`${inArray(entries.contestId, slice)} AND ${isNotNull(entries.userId)}`)
      .groupBy(entries.contestId);
    for (const c of counts) byId.set(c.contestId, c.n);
  }

  const out = new Map<string, LiveSibling[]>();
  for (const r of rows) {
    if (!r.key) continue;
    const list = out.get(r.key) ?? [];
    list.push({ id: r.id, createdAt: r.createdAt, realFilled: byId.get(r.id) ?? 0 });
    out.set(r.key, list);
  }
  return out;
}

/** Marathon (weeklyMonday) only fires on Monday UTC, with bull/bear chosen
 * by ISO week parity (even week → bull, odd → bear). Returns false on any
 * other weekday OR on the wrong-mode-this-week case. */
function shouldSpawnNow(cell: MatrixCell, at: Date): boolean {
  if (!cell.weeklyMonday) return true;
  if (at.getUTCDay() !== 1) return false; // 1 = Monday
  const isoWeek = isoWeekNumber(at);
  const wantBull = isoWeek % 2 === 0;
  return wantBull ? cell.mode === 'bull' : cell.mode === 'bear';
}

/** Standard ISO week number — Mon-anchored, week 1 contains the first
 * Thursday of the calendar year. */
function isoWeekNumber(d: Date): number {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86_400_000;
  return 1 + Math.round((diff - ((firstThursday.getUTCDay() + 6) % 7) + 3) / 7);
}

interface SpawnArgs {
  db: Database;
  cell: MatrixCell;
  adminId: string;
  now: Date;
}

async function spawnCellInstance(args: SpawnArgs): Promise<void> {
  const { cell, now } = args;
  const fillMs = LANE_FILL_MS[cell.lane];
  const playMs = LANE_DURATION_MS[cell.lane];

  const startsAt = computeStartsAt({ cell, now, fillMs });
  const endsAt = new Date(startsAt.getTime() + playMs);

  const stakeCoins = STAKE_AMOUNT_COINS[cell.stake];
  const xpMultiplier = effectiveXpMultiplier(cell).toFixed(2);

  await args.db.insert(contests).values({
    name: cell.name,
    type: cell.mode,
    mode: cell.mode,
    durationLane: cell.lane,
    stakeTier: cell.stake,
    entryFeeCents: BigInt(stakeCoins),
    // Practice has a house-funded floor; everything else is pure pari-mutuel.
    prizePoolCents: cell.payAll ? 5n : 0n,
    maxCapacity: effectiveCapacity(cell),
    isFeatured: false,
    minRank: cell.minRank,
    xpMultiplier,
    payAll: cell.payAll ?? false,
    prizeFormat: effectivePrizeFormat(cell),
    startsAt,
    endsAt,
    createdByUserId: args.adminId,
  });
}

/** Compute kickoff time. For 10m/30m/1h cells we just stagger off `now` so
 * each cell's start-time is distinct. For 24h/7d we anchor to clock-aligned
 * boundaries (00/06/12/18 UTC for 24h; Monday 00:00 UTC for 7d) so users
 * get a predictable cadence. */
function computeStartsAt({
  cell,
  now,
  fillMs,
}: {
  cell: MatrixCell;
  now: Date;
  fillMs: number;
}): Date {
  if (cell.lane === '24h') {
    // Next 6h boundary + this cell's stagger offset.
    const offsetSec = cell.staggerOffsetSec ?? 0;
    const sixHourMs = 6 * 60 * 60 * 1000;
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0),
    ).getTime();
    let candidate = dayStart + offsetSec * 1000;
    while (candidate <= now.getTime() + fillMs) candidate += sixHourMs;
    return new Date(candidate);
  }
  if (cell.lane === '7d') {
    // Next Monday 00:00 UTC.
    const day = now.getUTCDay(); // 0=Sun, 1=Mon
    const daysUntilMon = day === 1 ? 7 : (8 - day) % 7 || 7;
    const next = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMon, 0, 0, 0),
    );
    return next;
  }
  // Short lanes: kickoff = now + fill, plus stagger offset so multiple
  // cells in the same lane don't fire on the same second.
  return new Date(now.getTime() + fillMs + (cell.staggerOffsetSec ?? 0) * 1000);
}
