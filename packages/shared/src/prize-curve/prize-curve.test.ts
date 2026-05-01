import { describe, expect, it } from 'vitest';
import { computeLinearPracticeCurve, computePrizeCurve, computeActualPrizeCents } from './index.js';

describe('computePrizeCurve', () => {
  it('1 entry → 1 gets all', () => {
    const m = computePrizeCurve(1, 10_000);
    expect(m.get(1)).toBe(10_000);
    expect(m.size).toBe(1);
  });

  it('2 entries → top 2 with ~60/40 split', () => {
    const m = computePrizeCurve(2, 10_000);
    expect(m.size).toBe(2);
    expect([...m.values()].reduce((s, v) => s + v, 0)).toBe(10_000);
    // r=0.65, normalized: 1/1.65 = 0.606 → ~6060c
    expect(m.get(1)!).toBeGreaterThanOrEqual(6000);
    expect(m.get(1)!).toBeLessThan(6200);
  });

  it('3 entries → top 3, sum == pool, monotonic', () => {
    const m = computePrizeCurve(3, 10_000);
    expect(m.size).toBe(3);
    expect([...m.values()].reduce((s, v) => s + v, 0)).toBe(10_000);
    expect(m.get(1)!).toBeGreaterThan(m.get(2)!);
    expect(m.get(2)!).toBeGreaterThan(m.get(3)!);
  });

  it('21 entries → top 10 paid (50%), top-3 in 65-80% band, monotonic, sum == pool', () => {
    const m = computePrizeCurve(21, 1890);
    expect(m.size).toBe(10);
    const sum = [...m.values()].reduce((s, v) => s + v, 0);
    expect(sum).toBe(1890);
    let prev = Infinity;
    for (let r = 1; r <= 10; r++) {
      const v = m.get(r)!;
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
    const top3 = (m.get(1)! + m.get(2)! + m.get(3)!) / 1890;
    // Decay r=0.65 over a wider paying band drops top-3 share a touch
    // (~73% with 10 ranks paid vs ~78% with 6) — still solid podium emphasis.
    expect(top3).toBeGreaterThan(0.65);
    expect(top3).toBeLessThan(0.8);
  });

  it('100 entries → 50 ranks paid, sum == pool, monotonic, top-1 ~30-40%', () => {
    const m = computePrizeCurve(100, 1_000_000);
    expect(m.size).toBe(50);
    expect([...m.values()].reduce((s, v) => s + v, 0)).toBe(1_000_000);
    let prev = Infinity;
    for (let r = 1; r <= 50; r++) {
      const v = m.get(r) ?? 0;
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
    const r1 = m.get(1)! / 1_000_000;
    expect(r1).toBeGreaterThan(0.3);
    expect(r1).toBeLessThan(0.4);
  });

  it('zero entries or zero pool returns empty map', () => {
    expect(computePrizeCurve(0, 1_000).size).toBe(0);
    expect(computePrizeCurve(10, 0).size).toBe(0);
  });
});

describe('computeActualPrizeCents', () => {
  it('21 total × $1 entry × 10% rake → 1890 cents', () => {
    expect(computeActualPrizeCents({ totalCount: 21, entryFeeCents: 100, rakePct: 10 })).toBe(1890);
  });

  it('1 total × $1 × 10% rake → 90 cents', () => {
    expect(computeActualPrizeCents({ totalCount: 1, entryFeeCents: 100, rakePct: 10 })).toBe(90);
  });

  it('zero entries → zero pool', () => {
    expect(computeActualPrizeCents({ totalCount: 0, entryFeeCents: 100, rakePct: 10 })).toBe(0);
  });

  it('zero rake → full sum', () => {
    expect(computeActualPrizeCents({ totalCount: 10, entryFeeCents: 500, rakePct: 0 })).toBe(5000);
  });

  it('rounds down to integer cents', () => {
    expect(computeActualPrizeCents({ totalCount: 7, entryFeeCents: 33, rakePct: 10 })).toBe(207);
  });

  it('honours guaranteed minimum overlay', () => {
    expect(
      computeActualPrizeCents({
        totalCount: 1,
        entryFeeCents: 100,
        rakePct: 10,
        guaranteedPoolCents: 500,
      }),
    ).toBe(500);
  });
});

describe('computeLinearPracticeCurve', () => {
  it('1 player → 2 coins', () => {
    const m = computeLinearPracticeCurve(1);
    expect(m.get(1)).toBe(2);
    expect(m.size).toBe(1);
  });

  it('4 players → 2,2,1,1 (rounded from ideal 2,1.5,1,0.5)', () => {
    const m = computeLinearPracticeCurve(4);
    // ideal: rank 1 = 2.0, rank 2 = 1.5, rank 3 = 1.0, rank 4 = 0.5
    // rounded (half-up): 2, 2, 1, 1 (with floor 1 for last)
    expect(m.get(1)).toBe(2);
    expect(m.get(2)).toBe(2); // 1.5 rounds half-up to 2
    expect(m.get(3)).toBe(1);
    expect(m.get(4)).toBe(1); // 0.5 → 1 by floor
  });

  it('every rank gets ≥1 coin (no zero-prize tail)', () => {
    for (const N of [2, 5, 10, 20, 100, 500]) {
      const m = computeLinearPracticeCurve(N);
      expect(m.size).toBe(N);
      for (let r = 1; r <= N; r++) {
        expect(m.get(r)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('rank 1 always wins the most (2 coins)', () => {
    for (const N of [1, 2, 4, 10, 100]) {
      const m = computeLinearPracticeCurve(N);
      expect(m.get(1)).toBe(2);
    }
  });

  it('curve is monotonically non-increasing — top ranks ≥ bottom', () => {
    const m = computeLinearPracticeCurve(50);
    for (let r = 1; r < 50; r++) {
      expect(m.get(r)!).toBeGreaterThanOrEqual(m.get(r + 1)!);
    }
  });

  it('total pool scales ~1.5×N (within rounding)', () => {
    for (const N of [10, 50, 100, 500]) {
      const m = computeLinearPracticeCurve(N);
      const sum = [...m.values()].reduce((a, b) => a + b, 0);
      // Ideal mean = 1.25, but PRACTICE_MIN_PAYOUT=1 floor lifts the bottom
      // half from 0.5..1 to 1, so observed mean ~1.5.
      expect(sum / N).toBeGreaterThanOrEqual(1.2);
      expect(sum / N).toBeLessThanOrEqual(1.7);
    }
  });

  it('computePrizeCurve with payAll delegates to linear curve', () => {
    const linear = computeLinearPracticeCurve(20);
    const viaPayAll = computePrizeCurve(20, 999_999, { payAll: true });
    expect([...viaPayAll.entries()]).toEqual([...linear.entries()]);
  });
});
