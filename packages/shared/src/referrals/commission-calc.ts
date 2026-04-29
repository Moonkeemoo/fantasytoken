// Pure: compute referral commission for one level. Backend uses this once per
// (winner, level) pair; frontend uses it for the toast preview when a friend
// wins. bigint end-to-end so we never lose precision on TON/Stars amounts.

import { getReferralRates, type ReferralCurrency } from './referral-rates.js';

export interface PrizePayoutContext {
  /** Winner's gross prize, in the contest's currency (cents-like minor unit). */
  prizeCents: bigint;
  currency: ReferralCurrency;
}

export interface CommissionCalc {
  level: 1 | 2;
  /** Effective rate used, in basis points (500 = 5%). */
  pctBps: number;
  /** Amount to credit the referrer. floor(prize × pct / 10000). */
  payoutCents: bigint;
}

export function computeCommission(ctx: PrizePayoutContext, level: 1 | 2): CommissionCalc {
  const rates = getReferralRates(ctx.currency);
  const pctBps = level === 1 ? rates.l1Bps : rates.l2Bps;
  // Integer floor on purpose: a referrer never gets more than the rate; sub-cent
  // dust stays with the house. Matches INV-9 "no surprise mint" stance.
  const payoutCents = (ctx.prizeCents * BigInt(pctBps)) / 10_000n;
  return { level, pctBps, payoutCents };
}
