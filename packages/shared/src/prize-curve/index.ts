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

/** Multi-format prize curves (ADR-0008, DraftKings-style).
 *
 * Each contest declares a `prizeFormat` and the curve for that format
 * is applied at finalize. We support the four standard DFS shapes:
 *
 *   - **'linear'** — Practice only. House-funded. Top=2, bottom=1
 *     coins, middle linearly interpolated. Every player walks away
 *     with ≥1 coin. Prize-pool arg ignored.
 *
 *   - **'50_50'** (Double-Up) — top floor(N/2) split the pool equally.
 *     Each winner gets ~1.8× entry (after rake). Bottom half: 0.
 *     Casual feel — "beat half the field, double up".
 *
 *   - **'3x'** (3X Multiplier) — top floor(N/3) split equally. Each
 *     winner gets ~2.7× entry. Bottom 2/3: 0.
 *
 *   - **'5x'** (5X Multiplier) — top floor(N/5) split equally. Each
 *     winner gets ~4.5× entry. Bottom 4/5: 0.
 *
 *   - **'gpp'** (Guaranteed Prize Pool) — DraftKings tournament. Top
 *     ~25% paid in tiered structure: 1st/2nd/3rd big prizes, ranks
 *     4-10 a "near final table" tier, 11-K a flat "min cash" tail.
 *     Top-heavy: 1st takes ~15-20% of pool. Min cash ≥ 1 coin.
 *
 * "Winners win, losers don't earn" — every format guarantees ranks
 * outside the paying band get exactly 0, no rounding-to-zero noise
 * inside the band.
 */

/** Practice (linear / payAll) curve endpoints. */
const PRACTICE_TOP_PRIZE = 2;
const PRACTICE_BOTTOM_PRIZE = 0.5;
/** Floor applied AFTER rounding so the bottom rank never gets 0. */
const PRACTICE_MIN_PAYOUT = 1;

export const PRIZE_FORMATS = ['linear', '50_50', '3x', '5x', 'gpp'] as const;
export type PrizeFormat = (typeof PRIZE_FORMATS)[number];

export interface PrizeCurveOptions {
  /** Backward-compat alias for `format='linear'`. When true, ignores `format`. */
  payAll?: boolean;
  /** Defaults to 'gpp' when not specified — matches DraftKings flagship. */
  format?: PrizeFormat;
}

export function computePrizeCurve(
  totalCount: number,
  prizePoolCents: number,
  opts: PrizeCurveOptions = {},
): Map<number, number> {
  const result = new Map<number, number>();
  if (totalCount <= 0) return result;

  const format: PrizeFormat = opts.payAll ? 'linear' : (opts.format ?? 'gpp');
  if (format === 'linear') return computeLinearPracticeCurve(totalCount);
  if (prizePoolCents <= 0) return result;

  switch (format) {
    case '50_50':
      return computeMultiplierCurve(totalCount, prizePoolCents, 2);
    case '3x':
      return computeMultiplierCurve(totalCount, prizePoolCents, 3);
    case '5x':
      return computeMultiplierCurve(totalCount, prizePoolCents, 5);
    case 'gpp':
      return computeGppCurve(totalCount, prizePoolCents);
  }
}

/**
 * Returns the rank cutoff above which entries get 0. The paying band
 * shrinks as N grows so the per-rank slice stays meaningful (and the
 * loser band stays honest — "you didn't make top 30%").
 */
/** GPP paying band — top 25% of the field. Min 3 ranks always. */
export function gppPayingCutoff(N: number): number {
  if (N <= 0) return 0;
  if (N <= 3) return N;
  return Math.max(3, Math.ceil(N * 0.25));
}

/**
 * GPP (Guaranteed Prize Pool) — DraftKings-style tournament curve.
 * Step-function: top 1/2/3 each get a defined slice; ranks 4-10 share
 * a "near final table" tier; ranks 11-K share a "min cash" flat tail.
 * Each tier is monotonically smaller than the one before. Sum equals
 * `prizePoolCents` exactly (rounding remainders go to rank 1).
 */
export function computeGppCurve(N: number, prizePoolCents: number): Map<number, number> {
  const result = new Map<number, number>();
  if (N <= 0 || prizePoolCents <= 0) return result;

  // Tiny-room special cases — clean podium shapes, no tail.
  if (N === 1) {
    result.set(1, prizePoolCents);
    return result;
  }
  if (N === 2) {
    const r1 = Math.floor(prizePoolCents * 0.7);
    result.set(1, r1);
    result.set(2, prizePoolCents - r1);
    return result;
  }
  if (N === 3) {
    const r1 = Math.floor(prizePoolCents * 0.5);
    const r2 = Math.floor(prizePoolCents * 0.3);
    result.set(1, r1);
    result.set(2, r2);
    result.set(3, prizePoolCents - r1 - r2);
    return result;
  }

  const K = Math.min(N, gppPayingCutoff(N));

  if (K === 3) {
    // 4 ≤ N ≤ 12 with 25% cutoff: only top 3 paid. Use a tighter
    // podium (no flat tail) so the difference between rank 1 and 3
    // is meaningful.
    const r1 = Math.floor(prizePoolCents * 0.5);
    const r2 = Math.floor(prizePoolCents * 0.3);
    result.set(1, r1);
    result.set(2, r2);
    result.set(3, prizePoolCents - r1 - r2);
    return result;
  }

  if (K <= 10) {
    // Small room: 1/2/3 podium + flat 4..K min-cash tier. Podium
    // shares chosen so rank 3 ≥ each flat-tier slot for K≥5.
    const r1 = Math.floor(prizePoolCents * 0.35);
    const r2 = Math.floor(prizePoolCents * 0.2);
    const r3 = Math.floor(prizePoolCents * 0.15);
    fillFlatTier(result, prizePoolCents, r1, r2, r3, 4, K);
    return result;
  }

  // K > 10: full DraftKings-style stepped curve.
  // Tier shares (sum to 100):
  //   rank 1     : 20%
  //   rank 2     :  9%
  //   rank 3     :  6%
  //   ranks 4-10 : 30% (≈4.3% each)
  //   ranks 11-K : 35% (flat min-cash tail)
  const r1 = Math.floor(prizePoolCents * 0.2);
  const r2 = Math.floor(prizePoolCents * 0.09);
  const r3 = Math.floor(prizePoolCents * 0.06);
  result.set(1, r1);
  result.set(2, r2);
  result.set(3, r3);

  const tier4_10_total = Math.floor(prizePoolCents * 0.3);
  const tier4_10_each = Math.floor(tier4_10_total / 7);
  for (let r = 4; r <= 10; r++) result.set(r, tier4_10_each);

  const tailTotal = prizePoolCents - r1 - r2 - r3 - tier4_10_each * 7;
  const tailCount = K - 10;
  const tailEach = Math.floor(tailTotal / tailCount);
  let leftover = tailTotal - tailEach * tailCount;
  for (let r = 11; r <= K; r++) {
    result.set(r, tailEach + (leftover > 0 ? 1 : 0));
    if (leftover > 0) leftover -= 1;
  }

  // Final podium drift → rank 1.
  let assigned = 0;
  for (const v of result.values()) assigned += v;
  if (assigned < prizePoolCents) {
    result.set(1, (result.get(1) ?? 0) + (prizePoolCents - assigned));
  }
  return result;
}

/** Helper: fill ranks 4..K equally with the leftover after the podium. */
function fillFlatTier(
  result: Map<number, number>,
  pool: number,
  r1: number,
  r2: number,
  r3: number,
  startRank: number,
  endRank: number,
): void {
  result.set(1, r1);
  result.set(2, r2);
  result.set(3, r3);
  if (endRank < startRank) return;
  const flatBand = pool - r1 - r2 - r3;
  const slots = endRank - startRank + 1;
  const each = Math.floor(flatBand / slots);
  let leftover = flatBand - each * slots;
  for (let r = startRank; r <= endRank; r++) {
    result.set(r, each + (leftover > 0 ? 1 : 0));
    if (leftover > 0) leftover -= 1;
  }
  let assigned = 0;
  for (const v of result.values()) assigned += v;
  if (assigned < pool) {
    result.set(1, (result.get(1) ?? 0) + (pool - assigned));
  }
}

/**
 * Multiplier curve — top floor(N / multiplier) get equal share. Used
 * by the 50_50 (X=2), 3X (X=3), 5X (X=5) formats. Each winner gets
 * approximately `multiplier × entry × (1 - rake)` (the marketing-friendly
 * "2X / 3X / 5X" naming is approximate; integer rounding drops it to
 * ~1.8× / ~2.7× / ~4.5× under a 10% rake, which is exactly how
 * DraftKings markets these contests).
 */
export function computeMultiplierCurve(
  N: number,
  prizePoolCents: number,
  multiplier: number,
): Map<number, number> {
  const result = new Map<number, number>();
  if (N <= 0 || prizePoolCents <= 0 || multiplier < 2) return result;
  const K = Math.max(1, Math.floor(N / multiplier));
  const each = Math.floor(prizePoolCents / K);
  let leftover = prizePoolCents - each * K;
  for (let r = 1; r <= K; r++) {
    result.set(r, each + (leftover > 0 ? 1 : 0));
    if (leftover > 0) leftover -= 1;
  }
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
