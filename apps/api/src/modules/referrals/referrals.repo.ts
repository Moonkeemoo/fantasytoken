import { and, eq, isNull, sql } from 'drizzle-orm';
import { REFEREE_SIGNUP_BONUS_COINS, RECRUITER_SIGNUP_BONUS_COINS } from '@fantasytoken/shared';
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
            amountCents: BigInt(REFEREE_SIGNUP_BONUS_COINS),
            currencyCode: 'USD',
          },
          {
            userId: recruiterUserId,
            sourceUserId: refereeUserId,
            bonusType: 'RECRUITER',
            amountCents: BigInt(RECRUITER_SIGNUP_BONUS_COINS),
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
          sourceUserId: referralSignupBonuses.sourceUserId,
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
        sourceUserId: r.sourceUserId,
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

    async lookupFirstName(userId: string): Promise<string | null> {
      const [row] = await db
        .select({ firstName: users.firstName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return row?.firstName ?? null;
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

    async getLeaderboard({ callerUserId, scope, friendIds, limit }) {
      // Top recruiters by total INCOME from being-a-recruiter — both
      // commission payouts (referee wins) AND the +25 unlocked
      // RECRUITER_SIGNUP_BONUS. Pre-2026-05-01 we summed only
      // `referral_payouts.payout_cents`, which left the leaderboard
      // empty whenever no referee had yet won a paid contest. With
      // 100-synth cohort + a few hours of prod sim, 30 RECRUITER signup
      // bonuses had unlocked but board was still empty — surprise.
      // INV-9: `transactions` is source of truth; aggregate from there.
      const wantUserIds =
        scope === 'global' ? null : Array.from(new Set([callerUserId, ...friendIds]));
      if (scope === 'friends' && wantUserIds!.length === 0) {
        return { items: [], myRow: null };
      }

      const rows = await db.execute<{
        user_id: string;
        first_name: string | null;
        photo_url: string | null;
        total_cents: string;
        l1_count: number;
        rank: number;
      }>(sql`
        WITH agg AS (
          SELECT t.user_id,
                 SUM(t.delta_cents)::bigint AS total
          FROM transactions t
          WHERE t.type IN ('RECRUITER_SIGNUP_BONUS', 'REFERRAL_COMMISSION')
            ${
              scope === 'friends'
                ? sql`AND t.user_id IN (${sql.join(
                    wantUserIds!.map((id) => sql`${id}`),
                    sql`, `,
                  )})`
                : sql``
            }
          GROUP BY t.user_id
          HAVING SUM(t.delta_cents) > 0
        )
        SELECT
          a.user_id,
          u.first_name,
          u.photo_url,
          a.total::text AS total_cents,
          (SELECT COUNT(*)::int FROM users u2 WHERE u2.referrer_user_id = a.user_id) AS l1_count,
          ROW_NUMBER() OVER (ORDER BY a.total DESC, a.user_id ASC)::int AS rank
        FROM agg a
        JOIN users u ON u.id = a.user_id
        ORDER BY a.total DESC, a.user_id ASC
        LIMIT ${limit}
      `);
      const list = (
        rows as unknown as Array<{
          user_id: string;
          first_name: string | null;
          photo_url: string | null;
          total_cents: string;
          l1_count: number;
          rank: number;
        }>
      ).map((r) => ({
        rank: r.rank,
        userId: r.user_id,
        firstName: r.first_name,
        photoUrl: r.photo_url,
        totalEarnedCents: BigInt(r.total_cents),
        l1Count: r.l1_count,
      }));

      // Caller's own row, if not already in `items`. Computed via the same
      // aggregate filter so a caller with zero earnings stays null.
      const inList = list.find((r) => r.userId === callerUserId);
      let myRow = inList ?? null;
      if (!inList) {
        const meRows = await db.execute<{
          first_name: string | null;
          photo_url: string | null;
          total_cents: string;
          l1_count: number;
          rank: number;
        }>(sql`
          WITH agg AS (
            SELECT rp.recipient_user_id AS user_id,
                   SUM(rp.payout_cents)::bigint AS total
            FROM referral_payouts rp
            ${
              scope === 'friends'
                ? sql`WHERE rp.recipient_user_id IN (${sql.join(
                    wantUserIds!.map((id) => sql`${id}`),
                    sql`, `,
                  )})`
                : sql``
            }
            GROUP BY rp.recipient_user_id
            HAVING SUM(rp.payout_cents) > 0
          ),
          ranked AS (
            SELECT a.user_id, a.total,
                   ROW_NUMBER() OVER (ORDER BY a.total DESC, a.user_id ASC)::int AS rank
            FROM agg a
          )
          SELECT
            r.rank,
            r.total::text AS total_cents,
            u.first_name,
            u.photo_url,
            (SELECT COUNT(*)::int FROM users u2 WHERE u2.referrer_user_id = ${callerUserId}) AS l1_count
          FROM ranked r
          JOIN users u ON u.id = r.user_id
          WHERE r.user_id = ${callerUserId}
        `);
        const m = (
          meRows as unknown as Array<{
            rank: number;
            total_cents: string;
            first_name: string | null;
            photo_url: string | null;
            l1_count: number;
          }>
        )[0];
        if (m) {
          myRow = {
            rank: m.rank,
            userId: callerUserId,
            firstName: m.first_name,
            photoUrl: m.photo_url,
            totalEarnedCents: BigInt(m.total_cents),
            l1Count: m.l1_count,
          };
        }
      }

      return { items: list, myRow };
    },

    async getFriendDetail({ callerUserId, friendUserId, payoutsLimit }) {
      // Anti-snoop guard: friendUserId must actually be in the caller's chain
      // (L1 = direct, OR L2 = referee of one of caller's L1s).
      const guard = await db.execute<{ ok: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1 FROM ${users} u
          WHERE u.id = ${friendUserId}
            AND (
              u.referrer_user_id = ${callerUserId}
              OR u.referrer_user_id IN (
                SELECT id FROM ${users} WHERE referrer_user_id = ${callerUserId}
              )
            )
        ) AS ok
      `);
      const allowed = (guard as unknown as Array<{ ok: boolean }>)[0]?.ok ?? false;
      if (!allowed) return null;

      // Friend profile + per-level contribution split + counts.
      const profileRows = await db.execute<{
        first_name: string | null;
        photo_url: string | null;
        created_at: Date;
        contests_played: number;
        l1_cents: string;
        l2_cents: string;
      }>(sql`
        SELECT
          u.first_name,
          u.photo_url,
          u.created_at,
          (SELECT COUNT(*)::int FROM entries e
            WHERE e.user_id = u.id AND e.status = 'finalized') AS contests_played,
          COALESCE((
            SELECT SUM(rp.payout_cents)::text FROM referral_payouts rp
            WHERE rp.recipient_user_id = ${callerUserId}
              AND rp.source_user_id = u.id AND rp.level = 1
          ), '0') AS l1_cents,
          COALESCE((
            SELECT SUM(rp.payout_cents)::text FROM referral_payouts rp
            WHERE rp.recipient_user_id = ${callerUserId}
              AND rp.source_user_id = u.id AND rp.level = 2
          ), '0') AS l2_cents
        FROM ${users} u
        WHERE u.id = ${friendUserId}
      `);
      const p = (
        profileRows as unknown as Array<{
          first_name: string | null;
          photo_url: string | null;
          created_at: Date;
          contests_played: number;
          l1_cents: string;
          l2_cents: string;
        }>
      )[0];
      if (!p) return null;

      // Recent payouts triggered by this friend's wins.
      const payoutRows = await db
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
        .where(
          and(
            eq(referralPayouts.recipientUserId, callerUserId),
            eq(referralPayouts.sourceUserId, friendUserId),
          ),
        )
        .orderBy(sql`${referralPayouts.createdAt} DESC`)
        .limit(payoutsLimit);

      const l1c = BigInt(p.l1_cents);
      const l2c = BigInt(p.l2_cents);
      return {
        userId: friendUserId,
        firstName: p.first_name,
        photoUrl: p.photo_url,
        joinedAt: p.created_at,
        contestsPlayed: p.contests_played,
        totalContributedCents: l1c + l2c,
        l1ContributedCents: l1c,
        l2ContributedCents: l2c,
        recentPayouts: payoutRows.map((r) => ({
          id: r.id,
          level: (r.level === 1 ? 1 : 2) as 1 | 2,
          payoutCents: r.payoutCents,
          sourcePrizeCents: r.sourcePrizeCents,
          currencyCode: r.currencyCode,
          sourceFirstName: r.sourceFirstName ?? null,
          contestName: r.contestName ?? null,
          createdAt: r.createdAt,
        })),
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
