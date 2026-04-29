import { desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { seasons, users } from '../../db/schema/index.js';
import type { Logger } from '../../logger.js';

export interface SeasonRow {
  id: string;
  number: number;
  name: string;
  startsAt: Date;
  endsAt: Date;
  status: 'active' | 'finalized';
}

export interface SeasonsService {
  /**
   * Calendar-aligned active season for `now`. Lazily creates the row if missing
   * and rolls over (finalize + soft-reset all users) any stale-active season whose
   * calendar month is past. No cron — drift is fixed by the next read of this fn.
   *
   * Season N spans [first-of-month UTC, first-of-NEXT-month UTC).
   */
  ensureActive(): Promise<SeasonRow>;
  /** Read-only: latest active row, no rollover. */
  currentRaw(): Promise<SeasonRow | null>;
}

export interface SeasonsServiceDeps {
  db: Database;
  log: Logger;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function monthBounds(d: Date): { startsAt: Date; endsAt: Date; name: string } {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const startsAt = new Date(Date.UTC(year, month, 1));
  const endsAt = new Date(Date.UTC(year, month + 1, 1));
  return { startsAt, endsAt, name: `${MONTH_NAMES[month]} ${year}` };
}

function rowToSeason(r: typeof seasons.$inferSelect): SeasonRow {
  return {
    id: r.id,
    number: r.number,
    name: r.name,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    status: r.status === 'finalized' ? 'finalized' : 'active',
  };
}

export function createSeasonsService(deps: SeasonsServiceDeps): SeasonsService {
  const svc: SeasonsService = {
    async currentRaw() {
      const [r] = await deps.db
        .select()
        .from(seasons)
        .where(eq(seasons.status, 'active'))
        .orderBy(desc(seasons.number))
        .limit(1);
      return r ? rowToSeason(r) : null;
    },

    async ensureActive() {
      const now = new Date();
      const { startsAt: thisStart, endsAt: thisEnd, name: thisName } = monthBounds(now);

      const [latest] = await deps.db.select().from(seasons).orderBy(desc(seasons.number)).limit(1);

      // Already aligned and active — fast path, no tx.
      if (
        latest &&
        latest.status === 'active' &&
        latest.startsAt.getTime() === thisStart.getTime()
      ) {
        return rowToSeason(latest);
      }

      // Rollover (or first-time bootstrap) under a tx so concurrent boot hits don't race.
      let createdRow: typeof seasons.$inferSelect | null = null;

      await deps.db.transaction(async (tx) => {
        const [latestTx] = await tx.select().from(seasons).orderBy(desc(seasons.number)).limit(1);

        if (
          latestTx &&
          latestTx.status === 'active' &&
          latestTx.startsAt.getTime() === thisStart.getTime()
        ) {
          createdRow = latestTx;
          return;
        }

        // Stale active → finalize + soft-reset users (RANK_SYSTEM.md §4.2).
        if (latestTx && latestTx.status === 'active') {
          await tx.update(seasons).set({ status: 'finalized' }).where(eq(seasons.id, latestTx.id));
          await tx
            .update(users)
            .set({
              currentRank: sql`GREATEST(5, ${users.currentRank} - 5)`,
              xpSeason: sql`0`,
            })
            .where(sql`true`);
          deps.log.info(
            { seasonId: latestTx.id, number: latestTx.number },
            'seasons.finalized (calendar rollover)',
          );
        }

        const nextNumber = (latestTx?.number ?? 0) + 1;

        // Defensive: row for this calendar month may already exist (eg manual seed).
        const [existingThisMonth] = await tx
          .select()
          .from(seasons)
          .where(eq(seasons.startsAt, thisStart))
          .limit(1);
        if (existingThisMonth) {
          if (existingThisMonth.status !== 'active') {
            await tx
              .update(seasons)
              .set({ status: 'active' })
              .where(eq(seasons.id, existingThisMonth.id));
            existingThisMonth.status = 'active';
          }
          createdRow = existingThisMonth;
          return;
        }

        const [created] = await tx
          .insert(seasons)
          .values({
            number: nextNumber,
            name: thisName,
            startsAt: thisStart,
            endsAt: thisEnd,
            status: 'active',
          })
          .returning();
        if (!created) throw new Error('Failed to create season');
        createdRow = created;
        deps.log.info(
          { seasonId: created.id, number: nextNumber, name: thisName },
          'seasons.opened',
        );
      });

      if (!createdRow) throw new Error('ensureActive: no row produced');
      return rowToSeason(createdRow);
    },
  };
  return svc;
}
