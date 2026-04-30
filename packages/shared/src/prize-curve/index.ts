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
 * `payAll: true` overrides the cutoff so every entry receives a (decaying)
 * share — used by the Practice contest where the explicit promise is "all 10
 * positions paid, $2.50 → $0.50". The curve shape stays geometric so 1st
 * still wins more than last; only the eligibility cutoff changes.
 */
const DECAY = 0.65;
const PAY_FRACTION = 0.5;

export interface PrizeCurveOptions {
  payAll?: boolean;
}

export function computePrizeCurve(
  totalCount: number,
  prizePoolCents: number,
  opts: PrizeCurveOptions = {},
): Map<number, number> {
  const result = new Map<number, number>();
  if (totalCount <= 0 || prizePoolCents <= 0) return result;

  const payingCount = opts.payAll
    ? totalCount
    : totalCount <= 3
      ? totalCount
      : Math.max(3, Math.floor(totalCount * PAY_FRACTION));

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
