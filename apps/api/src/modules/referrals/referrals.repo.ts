import { and, eq, isNull, sql } from 'drizzle-orm';
import { REFEREE_SIGNUP_BONUS_CENTS, RECRUITER_SIGNUP_BONUS_CENTS } from '@fantasytoken/shared';
import type { Database } from '../../db/client.js';
import { entries, referralPayouts, referralSignupBonuses, users } from '../../db/schema/index.js';
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
  };
}
