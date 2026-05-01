import { eq } from 'drizzle-orm';
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
import { contests, users } from '../../db/schema/index.js';
import type { Logger } from '../../logger.js';

/**
 * Contests v2 matrix scheduler — see `docs/specs/contests-v2/DESIGN.md`.
 *
 * Replaces the legacy `contests.replenish` (which fired the same 12 templates
 * on a 5-min ladder cycle). New behaviour:
 *
 * 1. Iterate every cell in MATRIX_CELLS.
 * 2. If a live (scheduled or active) instance exists for that cell — skip.
 * 3. Else — create the next instance with the lane-appropriate fill window
 *    + play duration + xp_multiplier.
 *
 * The DB-level UNIQUE INDEX `idx_one_live_per_cell` enforces INV-13 even
 * if two scheduler ticks race; the ON CONFLICT swallows the duplicate
 * cleanly so we just log and move on.
 *
 * Special cases:
 *   - Marathon (`weeklyMonday=true`): only spawn on Monday UTC, alternating
 *     bull/bear by ISO week parity. Other weekdays = no-op.
 *   - 24h/7d cells: anchored to fixed UTC clocks via `staggerOffsetSec`,
 *     so multiple cells of the same lane don't all kick off at the same
 *     wall-clock instant.
 */

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
  schedule(): Promise<{ created: number }>;
}

export function createSchedulerService(deps: SchedulerServiceDeps): SchedulerService {
  const now = deps.now ?? (() => new Date());

  return {
    async schedule() {
      const adminId = await ensureAdminUser(deps);
      const liveByCell = await loadLiveCellKeys(deps.db);

      let created = 0;
      for (const cell of MATRIX_CELLS) {
        if (liveByCell.has(cell.key)) continue;
        if (!shouldSpawnNow(cell, now())) continue;

        try {
          await spawnCellInstance({ db: deps.db, cell, adminId, now: now() });
          created += 1;
          deps.log.info({ cell: cell.key, name: cell.name }, 'scheduler.spawn');
        } catch (err: unknown) {
          // The unique index races a concurrent tick — swallow duplicate
          // and let next tick re-evaluate. Anything else is a real bug.
          const code = (err as { code?: string }).code;
          if (code === '23505') {
            deps.log.debug({ cell: cell.key }, 'scheduler.spawn race (ignored)');
            continue;
          }
          deps.log.warn({ err, cell: cell.key }, 'scheduler.spawn failed');
        }
      }

      if (created > 0) {
        deps.log.info({ created }, 'scheduler.tick');
      }
      return { created };
    },
  };
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

async function loadLiveCellKeys(db: Database): Promise<Set<string>> {
  const rows = await db
    .select({ key: contests.matrixCellKey, status: contests.status })
    .from(contests);
  const live = new Set<string>();
  for (const r of rows) {
    if (!r.key) continue;
    if (r.status === 'scheduled' || r.status === 'active') {
      live.add(r.key);
    }
  }
  return live;
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
