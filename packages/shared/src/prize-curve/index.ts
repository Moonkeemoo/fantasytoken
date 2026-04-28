/**
 * Dynamic prize pool: realCount × entryFeeCents × (1 - rakePct/100), with optional
 * house-funded overlay floor (guaranteedPoolCents). Bots don't contribute.
 */
export function computeActualPrizeCents(args: {
  realCount: number;
  entryFeeCents: number;
  rakePct: number;
  guaranteedPoolCents?: number;
}): number {
  const collected = Math.max(0, args.realCount) * Math.max(0, args.entryFeeCents);
  const afterRake = Math.floor((collected * (100 - args.rakePct)) / 100);
  return Math.max(afterRake, args.guaranteedPoolCents ?? 0);
}

/**
 * Hardcoded prize curve (top 30% of real entries pay).
 * Returns map of rank (1-indexed) → cents.
 * Total payout == prizePoolCents (rounding remainder → 1st place).
 */
export function computePrizeCurve(realCount: number, prizePoolCents: number): Map<number, number> {
  const result = new Map<number, number>();
  if (realCount <= 0 || prizePoolCents <= 0) return result;

  const payingCount = Math.max(1, Math.floor(realCount * 0.3));

  // Bucket fractions (must sum to 1).
  // 1st: 30%, 2nd: 18%, 3rd: 12%, 4th: 7%, 5th: 5%, 6-10 each 3%, 11-20 each 1%, 21+ even split of 3%.
  const buckets: Array<{ from: number; to: number; pctEach: number }> = [
    { from: 1, to: 1, pctEach: 0.3 },
    { from: 2, to: 2, pctEach: 0.18 },
    { from: 3, to: 3, pctEach: 0.12 },
    { from: 4, to: 4, pctEach: 0.07 },
    { from: 5, to: 5, pctEach: 0.05 },
    { from: 6, to: 10, pctEach: 0.03 },
    { from: 11, to: 20, pctEach: 0.01 },
  ];
  if (payingCount > 20) {
    const tailRanks = payingCount - 20;
    const eachTail = 0.03 / tailRanks;
    buckets.push({ from: 21, to: payingCount, pctEach: eachTail });
  }

  // Take only buckets within payingCount.
  const usedBuckets = buckets
    .filter((b) => b.from <= payingCount)
    .map((b) => ({ from: b.from, to: Math.min(b.to, payingCount), pctEach: b.pctEach }));

  // Renormalize so used fractions sum to 1.
  const totalPct = usedBuckets.reduce((s, b) => s + b.pctEach * (b.to - b.from + 1), 0);
  const norm = totalPct === 0 ? 1 : 1 / totalPct;

  let assigned = 0;
  for (const b of usedBuckets) {
    const cents = Math.floor(prizePoolCents * b.pctEach * norm);
    for (let r = b.from; r <= b.to; r++) {
      result.set(r, cents);
      assigned += cents;
    }
  }
  // Rounding remainder → rank 1.
  const remainder = prizePoolCents - assigned;
  if (remainder > 0 && result.has(1)) {
    result.set(1, (result.get(1) ?? 0) + remainder);
  }
  return result;
}
