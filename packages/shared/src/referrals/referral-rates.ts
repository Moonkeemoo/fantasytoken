// Per-currency commission rates for referral payouts.
// Math invariant: total commissions per winner = (L1% + L2% × penetration) of prize.
// Source of truth: docs/REFERRAL_SYSTEM.md §2.2 + §5.

/** Hard cap on referral chain depth — INV-15. Bumping requires an ADR. */
export const MAX_REFERRAL_DEPTH = 2;

export type ReferralCurrency = 'USD' | 'STARS' | 'TON';

export interface CurrencyRates {
  /** L1 commission in basis points (500 = 5%, 100 = 1%). */
  l1Bps: number;
  /** L2 commission in basis points. */
  l2Bps: number;
}

/** Frozen production defaults. Per-currency calibration keeps house margin
 * sustainable: USD prioritises virality (printed money), TON keeps real-money
 * margin. See REFERRAL_SYSTEM.md §2.3 for sustainability math. */
export const REFERRAL_RATES: Readonly<Record<ReferralCurrency, CurrencyRates>> = {
  USD: { l1Bps: 500, l2Bps: 100 }, // 5% / 1%
  STARS: { l1Bps: 300, l2Bps: 50 }, // 3% / 0.5%
  TON: { l1Bps: 250, l2Bps: 50 }, // 2.5% / 0.5%
} as const;

export function getReferralRates(currency: ReferralCurrency): CurrencyRates {
  return REFERRAL_RATES[currency];
}
