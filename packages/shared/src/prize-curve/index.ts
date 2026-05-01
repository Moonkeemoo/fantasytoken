/**
 * Dynamic prize pool. Every entry (real + bot) contributes its entry_fee, then
 * the platform takes rake. Optional house-funded overlay floor (guaranteedPoolCents).
 */
export function computeActualPrizeCents(args: {
  /** Total entries that paid in (real + bot). */
  totalCount: number;
  entryFeeCents: number;
  rakePct: number;
  guaranteedPoolCents?: number;
}): number {
  const collected = Math.max(0, args.totalCount) * Math.max(0, args.entryFeeCents);
  const afterRake = Math.floor((collected * (100 - args.rakePct)) / 100);
  return Math.max(afterRake, args.guaranteedPoolCents ?? 0);
}

/** Geometric decay applied uniformly across all paying ranks (Papaya / Solitaire Cash style):
 *
 *   share[i] = r^i / Σ r^j   for i = 0..payingCount-1
 *
 * One smooth curve — no special-case top-3 vs rest, no leftover. Decay r=0.65
 * keeps top-3 in the ~70-75% band across realistic room sizes (3..100). Pays
 * the top 50% of entries (with a floor of 3 ranks for tiny rooms; full room
 * when N ≤ 3). Choosing 50% over a tournament-style 20-30% cutoff means a
 * player in the top half walks away with at least *something* — softens the
 * "−\$1 again" feeling that drove churn on contests like Quick Match.
 *
 * `payAll: true` switches to a LINEAR house-funded curve (Practice mode):
 * top rank gets 2 coins, bottom rank gets 1 coin (rounded up from the
 * ideal 0.5), middle ranks scale linearly. Total pool = ~1.5×N coins,
 * funded by the house (the `prizePoolCents` arg is ignored). Earlier we
 * used geometric decay over a fixed 5-coin pool for Practice; that gave
 * top-1 ~3 coins and bottom 0, which both starved the long tail and
 * didn't scale with N. The linear curve guarantees every player walks
 * away with ≥1 coin — enough to attempt a c1 contest next — without
 * making Practice grind a way to get rich.
 */
const DECAY = 0.65;
const PAY_FRACTION = 0.5;

/** Practice (payAll) curve endpoints. */
const PRACTICE_TOP_PRIZE = 2;
const PRACTICE_BOTTOM_PRIZE = 0.5;
/** Floor applied AFTER rounding so the bottom rank never gets 0. */
const PRACTICE_MIN_PAYOUT = 1;

export interface PrizeCurveOptions {
  payAll?: boolean;
}

export function computePrizeCurve(
  totalCount: number,
  prizePoolCents: number,
  opts: PrizeCurveOptions = {},
): Map<number, number> {
  const result = new Map<number, number>();
  if (totalCount <= 0) return result;

  if (opts.payAll) {
    return computeLinearPracticeCurve(totalCount);
  }

  if (prizePoolCents <= 0) return result;

  const payingCount =
    totalCount <= 3 ? totalCount : Math.max(3, Math.floor(totalCount * PAY_FRACTION));

  // Build geometric weights w_i = r^i and their normalisation factor.
  const weights: number[] = [];
  let totalWeight = 0;
  let w = 1;
  for (let i = 0; i < payingCount; i++) {
    weights.push(w);
    totalWeight += w;
    w *= DECAY;
  }

  let assigned = 0;
  for (let i = 0; i < payingCount; i++) {
    const cents = Math.floor((prizePoolCents * weights[i]!) / totalWeight);
    result.set(i + 1, cents);
    assigned += cents;
  }

  // Rounding drift (sum of floors < pool by a few cents) goes to rank 1.
  const remainder = prizePoolCents - assigned;
  if (remainder > 0) result.set(1, (result.get(1) ?? 0) + remainder);
  return result;
}

/**
 * Practice payout — linear from PRACTICE_TOP_PRIZE (rank 1) to
 * PRACTICE_BOTTOM_PRIZE (rank N), rounded to whole coins with a floor at
 * PRACTICE_MIN_PAYOUT so the worst rank still earns ≥1 coin.
 *
 * Sum scales as ~1.5×N coins; house-funded.
 */
export function computeLinearPracticeCurve(totalCount: number): Map<number, number> {
  const result = new Map<number, number>();
  if (totalCount <= 0) return result;
  if (totalCount === 1) {
    result.set(1, PRACTICE_TOP_PRIZE);
    return result;
  }
  for (let rank = 1; rank <= totalCount; rank++) {
    const fraction = (totalCount - rank) / (totalCount - 1);
    const raw = PRACTICE_BOTTOM_PRIZE + (PRACTICE_TOP_PRIZE - PRACTICE_BOTTOM_PRIZE) * fraction;
    const rounded = Math.round(raw);
    result.set(rank, Math.max(PRACTICE_MIN_PAYOUT, rounded));
  }
  return result;
}
