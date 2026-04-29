import { alias } from 'drizzle-orm/pg-core';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { contests, entries, users } from '../../db/schema/index.js';
import type { ShareCardData, ShareRepo } from './share.service.js';

export function createShareRepo(db: Database): ShareRepo {
  // Self-join alias so we can pull the recruiter's profile alongside the
  // entry owner's in a single round-trip.
  const recruiter = alias(users, 'recruiter');

  return {
    async load(entryId) {
      const [row] = await db
        .select({
          entryId: entries.id,
          userId: entries.userId,
          isBot: entries.isBot,
          finalScore: entries.finalScore,
          prizeCents: entries.prizeCents,
          status: entries.status,
          contestId: entries.contestId,
          contestName: contests.name,
          contestType: contests.type,
          contestStatus: contests.status,
          contestEndsAt: contests.endsAt,
          maxCapacity: contests.maxCapacity,
          uDisplay: users.firstName,
          uUsername: users.username,
          uPhotoUrl: users.photoUrl,
          uTelegramId: users.telegramId,
          uReferrerId: users.referrerUserId,
          rDisplay: recruiter.firstName,
          rUsername: recruiter.username,
        })
        .from(entries)
        .innerJoin(contests, eq(contests.id, entries.contestId))
        .leftJoin(users, eq(users.id, entries.userId))
        .leftJoin(recruiter, eq(recruiter.id, users.referrerUserId))
        .where(eq(entries.id, entryId))
        .limit(1);

      if (!row) return null;
      if (row.isBot || !row.userId) return null;
      if (row.contestStatus !== 'finalized' && row.contestStatus !== 'cancelled') return null;

      const totalEntries = await countEntries(db, row.contestId);
      const realEntries = await countRealEntries(db, row.contestId);
      const finalRank = await rankInContest(
        db,
        row.contestId,
        row.entryId,
        row.contestType === 'bear' ? 'bear' : 'bull',
      );

      const data: ShareCardData = {
        entryId: row.entryId,
        contestName: row.contestName,
        contestType: row.contestType === 'bear' ? 'bear' : 'bull',
        finalRank,
        totalEntries,
        realEntries,
        netPnlCents: Math.round(Number(row.finalScore ?? 0) * 10_000),
        prizeCents: Number(row.prizeCents ?? 0),
        finishedAt: row.contestEndsAt,
        user: {
          displayName: row.uDisplay ?? row.uUsername ?? 'Player',
          username: row.uUsername,
          avatarUrl: row.uPhotoUrl,
          telegramId: row.uTelegramId ?? 0,
        },
        recruiter:
          row.uReferrerId !== null
            ? {
                displayName: row.rDisplay ?? row.rUsername ?? 'a friend',
                username: row.rUsername,
              }
            : null,
      };
      return data;
    },
  };
}

async function countEntries(db: Database, contestId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(entries)
    .where(eq(entries.contestId, contestId));
  return r?.n ?? 0;
}

async function countRealEntries(db: Database, contestId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(entries)
    .where(eq(entries.contestId, contestId));
  return r?.n ?? 0;
}

async function rankInContest(
  db: Database,
  contestId: string,
  entryId: string,
  contestType: 'bull' | 'bear',
): Promise<number | null> {
  const rows = await db
    .select({ id: entries.id, finalScore: entries.finalScore, submittedAt: entries.submittedAt })
    .from(entries)
    .where(eq(entries.contestId, contestId));
  const dir = contestType === 'bear' ? -1 : 1;
  const sorted = rows
    .map((r) => ({
      id: r.id,
      score: Number(r.finalScore ?? 0),
      submittedAt: r.submittedAt,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return dir * (b.score - a.score);
      return a.submittedAt.getTime() - b.submittedAt.getTime();
    });
  const idx = sorted.findIndex((r) => r.id === entryId);
  return idx >= 0 ? idx + 1 : null;
}
