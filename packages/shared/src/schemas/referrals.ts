import { z } from 'zod';

// Wire-side amounts are `number` (cents) — no JSON bigint. MAX_SAFE_INTEGER cap
// is well above any plausible referral payout. DB columns stay BIGINT, cast at
// the route boundary (apps/api/src/modules/referrals/referrals.routes.ts).

const PerCurrencyEarnings = z.object({
  l1Cents: z.number().int().nonnegative(),
  l2Cents: z.number().int().nonnegative(),
});

/** GET /me/referrals — aggregated stats for the headline + earnings box. */
export const ReferralsSummaryResponse = z.object({
  l1Count: z.number().int().nonnegative(),
  l2Count: z.number().int().nonnegative(),
  /** Subset of *Count that have at least one finalized contest. */
  l1ActiveCount: z.number().int().nonnegative(),
  l2ActiveCount: z.number().int().nonnegative(),
  totalEarnedCents: z.number().int().nonnegative(),
  l1EarnedCents: z.number().int().nonnegative(),
  l2EarnedCents: z.number().int().nonnegative(),
  /** Soft USD only in V1; STARS/TON keys appear once those rails ship. */
  byCurrency: z.object({
    USD: PerCurrencyEarnings,
  }),
});
export type ReferralsSummaryResponse = z.infer<typeof ReferralsSummaryResponse>;

const ReferralTreeNode = z.object({
  userId: z.string().uuid(),
  firstName: z.string().nullable(),
  photoUrl: z.string().nullable(),
  joinedAt: z.string().datetime(),
  hasPlayed: z.boolean(),
  contestsPlayed: z.number().int().nonnegative(),
  totalContributedCents: z.number().int().nonnegative(),
});

/** GET /me/referrals/tree — drill list for the Profile referrals section. */
export const ReferralsTreeResponse = z.object({
  l1: z.array(ReferralTreeNode),
  l2: z.array(ReferralTreeNode.extend({ viaUserId: z.string().uuid() })),
});
export type ReferralsTreeResponse = z.infer<typeof ReferralsTreeResponse>;

const ReferralPayoutItem = z.object({
  id: z.string().uuid(),
  level: z.union([z.literal(1), z.literal(2)]),
  payoutCents: z.number().int().nonnegative(),
  sourcePrizeCents: z.number().int().nonnegative(),
  currencyCode: z.string(),
  sourceFirstName: z.string().nullable(),
  contestName: z.string().nullable(),
  createdAt: z.string().datetime(),
});

/** GET /me/referrals/payouts — recent commission history. */
export const ReferralsPayoutsResponse = z.object({
  items: z.array(ReferralPayoutItem),
});
export type ReferralsPayoutsResponse = z.infer<typeof ReferralsPayoutsResponse>;

/** GET /me/welcome-status — onboarding bonus state for the welcome screen
 * countdown. Grandfathered users (welcome_credited_at NULL after migration
 * 0011) get state='grandfathered' and the rest of the fields are null. */
export const WelcomeStatusResponse = z.object({
  state: z.enum(['active', 'used', 'expired', 'grandfathered']),
  welcomeBonusCents: z.number().int().nonnegative(),
  welcomeCreditedAt: z.string().datetime().nullable(),
  welcomeExpiresAt: z.string().datetime().nullable(),
  /** Computed: floor((credited + 7d - now) / 1d). Null when state ≠ 'active'. */
  daysUntilExpiry: z.number().int().nonnegative().nullable(),
});
export type WelcomeStatusResponse = z.infer<typeof WelcomeStatusResponse>;
