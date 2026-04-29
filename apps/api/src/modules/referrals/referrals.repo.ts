import { and, eq, isNull, sql } from 'drizzle-orm';
import { REFEREE_SIGNUP_BONUS_CENTS, RECRUITER_SIGNUP_BONUS_CENTS } from '@fantasytoken/shared';
import type { Database } from '../../db/client.js';
import {
  contests,
  entries,
  referralPayouts,
  referralSignupBonuses,
  users,
} from '../../db/schema/index.js';
import type { ReferralChainLink, ReferralsRepo } from './referrals.service.js';

export function createReferralsRepo(db: Database): ReferralsRepo {
  return {
    async getReferralChain(userId: string, depth: number) {
      // Recursive CTE walks up the referrer chain, capped at `depth` hops.
      // Returns ordered: level 1 first, then level 2.
      const rows = await db.execute<{ user_id: string; level: number }>(sql`
        WITH RECURSIVE chain AS (
          SELECT u.referrer_user_id AS user_id, 1 AS level
          FROM ${users} u
          WHERE u.id = ${userId} AND u.referrer_user_id IS NOT NULL
          UNION ALL
          SELECT u.referrer_user_id, c.level + 1
          FROM chain c
          JOIN ${users} u ON u.id = c.user_id
          WHERE u.referrer_user_id IS NOT NULL AND c.level < ${depth}
        )
        SELECT user_id, level FROM chain WHERE user_id IS NOT NULL ORDER BY level
      `);
      return (rows as unknown as Array<{ user_id: string; level: number }>).map(
        (r): ReferralChainLink => ({
          level: (r.level === 1 ? 1 : 2) as 1 | 2,
          userId: r.user_id,
        }),
      );
    },

    async countFinalizedEntries(userId: string) {
      const [r] = await db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(entries)
        .where(and(eq(entries.userId, userId), eq(entries.status, 'finalized')));
      return r?.n ?? 0;
    },

    async preCreateSignupBonuses({ refereeUserId, recruiterUserId }) {
      // REFEREE row: source_user_id = NULL (the receiving user IS the referee).
      // RECRUITER row: source_user_id = the referee, so the unique index
      // (user_id, bonus_type, source_user_id) lets the same recruiter accumulate
      // one row per referee they bring.
      // ON CONFLICT DO NOTHING — the migration's unique partial index handles
      // re-runs (e.g., bot DM retry on /me handshake).
      await db
        .insert(referralSignupBonuses)
        .values([
          {
            userId: refereeUserId,
            sourceUserId: null,
            bonusType: 'REFEREE',
            amountCents: BigInt(REFEREE_SIGNUP_BONUS_CENTS),
            currencyCode: 'USD',
          },
          {
            userId: recruiterUserId,
            sourceUserId: refereeUserId,
            bonusType: 'RECRUITER',
            amountCents: BigInt(RECRUITER_SIGNUP_BONUS_CENTS),
            currencyCode: 'USD',
          },
        ])
        .onConflictDoNothing();
    },

    async payOneCommission(args) {
      // Audit row + currency credit live in the same outer tx so a partial
      // failure rolls back cleanly. We can't share a tx with CurrencyService
      // (it owns its own), so the credit is open-coded via raw SQL on `tx` —
      // matches CurrencyRepo.transactAtomic's two-step (insert transactions →
      // upsert balances) and is INV-9 compliant in spirit.
      //
      // Idempotency: the unique index on (recipient_user_id, source_entry_id,
      // level) catches re-runs at the audit insert; we early-return without
      // double-crediting.
      let paid = false;
      await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(referralPayouts)
          .values({
            recipientUserId: args.recipientUserId,
            sourceUserId: args.sourceUserId,
            sourceContestId: args.sourceContestId,
            sourceEntryId: args.sourceEntryId,
            level: args.level,
            commissionPctBps: args.pctBps,
            sourcePrizeCents: args.sourcePrizeCents,
            payoutCents: args.payoutCents,
            currencyCode: args.currency,
            transactionId: null,
          })
          .onConflictDoNothing()
          .returning({ id: referralPayouts.id });
        if (inserted.length === 0) return; // already paid this exact (recipient, entry, level)

        const txInserted = await tx.execute<{ id: string }>(sql`
          INSERT INTO transactions (user_id, currency_code, delta_cents, type, ref_type, ref_id)
          VALUES (
            ${args.recipientUserId}, 'USD',
            ${args.payoutCents.toString()}::bigint,
            'REFERRAL_COMMISSION', 'entry', ${args.sourceEntryId}
          )
          RETURNING id
        `);
        const txRow = (txInserted as unknown as Array<{ id: string }>)[0];
        if (!txRow) throw new Error('transactions insert returned no rows');

        await tx.execute(sql`
          INSERT INTO balances (user_id, currency_code, amount_cents)
          VALUES (${args.recipientUserId}, 'USD', ${args.payoutCents.toString()}::bigint)
          ON CONFLICT (user_id, currency_code) DO UPDATE
            SET amount_cents = balances.amount_cents + EXCLUDED.amount_cents,
                updated_at = NOW()
        `);

        await tx
          .update(referralPayouts)
          .set({ transactionId: txRow.id })
          .where(eq(referralPayouts.id, inserted[0]!.id));

        paid = true;
      });
      return { paid };
    },

    async findLockedSignupBonuses(userId: string) {
      const rows = await db
        .select({
          id: referralSignupBonuses.id,
          recipientUserId: referralSignupBonuses.userId,
          bonusType: referralSignupBonuses.bonusType,
          amountCents: referralSignupBonuses.amountCents,
        })
        .from(referralSignupBonuses)
        .where(
          and(eq(referralSignupBonuses.userId, userId), isNull(referralSignupBonuses.unlockedAt)),
        );
      return rows.map((r) => ({
        id: r.id,
        recipientUserId: r.recipientUserId,
        bonusType: r.bonusType === 'RECRUITER' ? ('RECRUITER' as const) : ('REFEREE' as const),
        amountCents: r.amountCents,
      }));
    },

    async markBonusUnlocked({ bonusRowId, triggeredByEntryId, transactionId }) {
      await db
        .update(referralSignupBonuses)
        .set({
          unlockedAt: sql`NOW()`,
          triggeredByEntryId,
          transactionId,
        })
        .where(eq(referralSignupBonuses.id, bonusRowId));
    },

    async getStats(userId) {
      // Two-pass: first the counts (cheap, single CTE), then the earned sums.
      // L1 = caller's direct referees. L2 = referees of L1.
      // Active = referee with at least one finalized entry.
      const counts = await db.execute<{
        l1_count: number;
        l2_count: number;
        l1_active: number;
        l2_active: number;
      }>(sql`
        WITH l1 AS (
          SELECT u.id, EXISTS (
            SELECT 1 FROM entries e WHERE e.user_id = u.id AND e.status = 'finalized'
          ) AS active
          FROM ${users} u
          WHERE u.referrer_user_id = ${userId}
        ),
        l2 AS (
          SELECT u.id, EXISTS (
            SELECT 1 FROM entries e WHERE e.user_id = u.id AND e.status = 'finalized'
          ) AS active
          FROM ${users} u
          WHERE u.referrer_user_id IN (SELECT id FROM l1)
        )
        SELECT
          (SELECT COUNT(*)::int FROM l1) AS l1_count,
          (SELECT COUNT(*)::int FROM l2) AS l2_count,
          (SELECT COUNT(*)::int FROM l1 WHERE active) AS l1_active,
          (SELECT COUNT(*)::int FROM l2 WHERE active) AS l2_active
      `);
      const c = (
        counts as unknown as Array<{
          l1_count: number;
          l2_count: number;
          l1_active: number;
          l2_active: number;
        }>
      )[0] ?? { l1_count: 0, l2_count: 0, l1_active: 0, l2_active: 0 };

      const earned = await db
        .select({
          level: referralPayouts.level,
          sumCents: sql<string>`COALESCE(SUM(${referralPayouts.payoutCents}), 0)::text`,
        })
        .from(referralPayouts)
        .where(eq(referralPayouts.recipientUserId, userId))
        .groupBy(referralPayouts.level);

      let l1EarnedCents = 0n;
      let l2EarnedCents = 0n;
      for (const r of earned) {
        const v = BigInt(r.sumCents);
        if (r.level === 1) l1EarnedCents = v;
        else if (r.level === 2) l2EarnedCents = v;
      }
      return {
        l1Count: c.l1_count,
        l2Count: c.l2_count,
        l1ActiveCount: c.l1_active,
        l2ActiveCount: c.l2_active,
        l1EarnedCents,
        l2EarnedCents,
      };
    },

    async getTree(userId) {
      // L1: direct referees with derived per-friend stats.
      const l1Rows = await db.execute<{
        id: string;
        first_name: string | null;
        photo_url: string | null;
        created_at: Date;
        contests_played: number;
        total_contributed_cents: string;
      }>(sql`
        SELECT
          u.id,
          u.first_name,
          u.photo_url,
          u.created_at,
          (SELECT COUNT(*)::int FROM entries e
            WHERE e.user_id = u.id AND e.status = 'finalized') AS contests_played,
          COALESCE((
            SELECT SUM(rp.payout_cents)::text FROM referral_payouts rp
            WHERE rp.recipient_user_id = ${userId} AND rp.source_user_id = u.id
          ), '0') AS total_contributed_cents
        FROM ${users} u
        WHERE u.referrer_user_id = ${userId}
        ORDER BY u.created_at DESC
      `);

      // L2: referees of L1, with viaUserId = the L1 inviter id.
      const l2Rows = await db.execute<{
        id: string;
        first_name: string | null;
        photo_url: string | null;
        created_at: Date;
        contests_played: number;
        total_contributed_cents: string;
        via_user_id: string;
      }>(sql`
        SELECT
          u.id,
          u.first_name,
          u.photo_url,
          u.created_at,
          (SELECT COUNT(*)::int FROM entries e
            WHERE e.user_id = u.id AND e.status = 'finalized') AS contests_played,
          COALESCE((
            SELECT SUM(rp.payout_cents)::text FROM referral_payouts rp
            WHERE rp.recipient_user_id = ${userId} AND rp.source_user_id = u.id
          ), '0') AS total_contributed_cents,
          u.referrer_user_id AS via_user_id
        FROM ${users} u
        JOIN ${users} l1 ON l1.id = u.referrer_user_id
        WHERE l1.referrer_user_id = ${userId}
        ORDER BY u.created_at DESC
      `);

      const mapL1 = (r: {
        id: string;
        first_name: string | null;
        photo_url: string | null;
        created_at: Date;
        contests_played: number;
        total_contributed_cents: string;
      }) => ({
        userId: r.id,
        firstName: r.first_name,
        photoUrl: r.photo_url,
        joinedAt: r.created_at,
        hasPlayed: r.contests_played > 0,
        contestsPlayed: r.contests_played,
        totalContributedCents: BigInt(r.total_contributed_cents),
      });

      return {
        l1: (
          l1Rows as unknown as Array<{
            id: string;
            first_name: string | null;
            photo_url: string | null;
            created_at: Date;
            contests_played: number;
            total_contributed_cents: string;
          }>
        ).map(mapL1),
        l2: (
          l2Rows as unknown as Array<{
            id: string;
            first_name: string | null;
            photo_url: string | null;
            created_at: Date;
            contests_played: number;
            total_contributed_cents: string;
            via_user_id: string;
          }>
        ).map((r) => ({
          ...mapL1(r),
          viaUserId: r.via_user_id,
        })),
      };
    },

    async lookupCommissionDmContext({ sourceUserId, sourceContestId }) {
      // Two single-row joins in one round-trip — cheaper than two service calls.
      const rows = await db.execute<{
        first_name: string | null;
        contest_name: string | null;
      }>(sql`
        SELECT
          (SELECT first_name FROM users WHERE id = ${sourceUserId}) AS first_name,
          (SELECT name FROM contests WHERE id = ${sourceContestId}) AS contest_name
      `);
      const r = (
        rows as unknown as Array<{
          first_name: string | null;
          contest_name: string | null;
        }>
      )[0];
      return {
        sourceFirstName: r?.first_name ?? null,
        contestName: r?.contest_name ?? null,
      };
    },

    async getPayouts(userId, limit) {
      const rows = await db
        .select({
          id: referralPayouts.id,
          level: referralPayouts.level,
          payoutCents: referralPayouts.payoutCents,
          sourcePrizeCents: referralPayouts.sourcePrizeCents,
          currencyCode: referralPayouts.currencyCode,
          createdAt: referralPayouts.createdAt,
          sourceFirstName: users.firstName,
          contestName: contests.name,
        })
        .from(referralPayouts)
        .leftJoin(users, eq(users.id, referralPayouts.sourceUserId))
        .leftJoin(contests, eq(contests.id, referralPayouts.sourceContestId))
        .where(eq(referralPayouts.recipientUserId, userId))
        .orderBy(sql`${referralPayouts.createdAt} DESC`)
        .limit(limit);

      return rows.map((r) => ({
        id: r.id,
        level: (r.level === 1 ? 1 : 2) as 1 | 2,
        payoutCents: r.payoutCents,
        sourcePrizeCents: r.sourcePrizeCents,
        currencyCode: r.currencyCode,
        sourceFirstName: r.sourceFirstName ?? null,
        contestName: r.contestName ?? null,
        createdAt: r.createdAt,
      }));
    },
  };
}
