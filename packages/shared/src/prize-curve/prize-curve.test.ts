import { describe, expect, it } from 'vitest';
import {
  computeActualPrizeCents,
  computeGppCurve,
  computeLinearPracticeCurve,
  computeMultiplierCurve,
  computePrizeCurve,
  gppPayingCutoff,
} from './index.js';

const sumOf = (m: Map<number, number>): number => [...m.values()].reduce((s, v) => s + v, 0);

describe('computePrizeCurve dispatch', () => {
  it('payAll → linear (Practice compat)', () => {
    const m = computePrizeCurve(20, 999, { payAll: true });
    expect(m.size).toBe(20);
    for (let r = 1; r <= 20; r++) expect(m.get(r)!).toBeGreaterThanOrEqual(1);
  });
  it("format 'linear' → linear", () => {
    const m = computePrizeCurve(10, 999, { format: 'linear' });
    expect(m.size).toBe(10);
  });
  it("format '50_50' → top 50% equal", () => {
    const m = computePrizeCurve(20, 9000, { format: '50_50' });
    expect(m.size).toBe(10);
    expect([...m.values()].every((v) => v === 900)).toBe(true);
  });
  it("format '3x' → top 1/3 equal", () => {
    const m = computePrizeCurve(30, 9000, { format: '3x' });
    expect(m.size).toBe(10);
    expect([...m.values()].every((v) => v === 900)).toBe(true);
  });
  it("format '5x' → top 1/5 equal", () => {
    const m = computePrizeCurve(50, 9000, { format: '5x' });
    expect(m.size).toBe(10);
    expect([...m.values()].every((v) => v === 900)).toBe(true);
  });
  it("default ('gpp') → top-heavy GPP", () => {
    const m = computePrizeCurve(100, 1_000_000);
    expect(m.size).toBe(25); // ceil(100*0.25)
    expect(m.get(1)!).toBeGreaterThan(m.get(2)!);
    expect(sumOf(m)).toBe(1_000_000);
  });
});

describe('computeMultiplierCurve', () => {
  it('50/50 (mult=2): top floor(N/2) split equally', () => {
    const m = computeMultiplierCurve(10, 1000, 2);
    expect(m.size).toBe(5);
    expect(sumOf(m)).toBe(1000);
    expect([...m.values()].every((v) => v === 200)).toBe(true);
  });
  it('3X (mult=3): top floor(N/3) split equally', () => {
    const m = computeMultiplierCurve(30, 1000, 3);
    expect(m.size).toBe(10);
    expect(sumOf(m)).toBe(1000);
  });
  it('5X (mult=5): top floor(N/5) split equally', () => {
    const m = computeMultiplierCurve(100, 1000, 5);
    expect(m.size).toBe(20);
    expect(sumOf(m)).toBe(1000);
  });
  it('odd N: rounding leftover lands on rank 1', () => {
    const m = computeMultiplierCurve(11, 100, 2);
    expect(m.size).toBe(5);
    expect(sumOf(m)).toBe(100);
    // 100 / 5 = 20 exactly so leftover is 0; rank 1 = 20.
    expect(m.get(1)).toBe(20);
  });
  it('non-divisible pool: leftover distributed to top ranks', () => {
    const m = computeMultiplierCurve(10, 23, 2);
    expect(m.size).toBe(5);
    expect(sumOf(m)).toBe(23);
    // 23 / 5 = 4 each, 3 leftover → ranks 1-3 get 5, ranks 4-5 get 4.
    expect(m.get(1)).toBe(5);
    expect(m.get(5)).toBe(4);
  });
  it('multiplier < 2 returns empty', () => {
    expect(computeMultiplierCurve(10, 100, 1).size).toBe(0);
  });
});

describe('gppPayingCutoff', () => {
  it('tiny rooms (≤3) pay everyone', () => {
    expect(gppPayingCutoff(1)).toBe(1);
    expect(gppPayingCutoff(2)).toBe(2);
    expect(gppPayingCutoff(3)).toBe(3);
  });
  it('mid rooms (4-12) pay top 3', () => {
    expect(gppPayingCutoff(4)).toBe(3);
    expect(gppPayingCutoff(12)).toBe(3);
  });
  it('larger rooms pay top 25%', () => {
    expect(gppPayingCutoff(100)).toBe(25);
    expect(gppPayingCutoff(1000)).toBe(250);
  });
});

describe('computeGppCurve', () => {
  it('N=1 → all to rank 1', () => {
    expect(computeGppCurve(1, 1000).get(1)).toBe(1000);
  });
  it('N=2 → 70/30', () => {
    const m = computeGppCurve(2, 1000);
    expect(m.get(1)).toBe(700);
    expect(m.get(2)).toBe(300);
  });
  it('N=3 → 50/30/20', () => {
    const m = computeGppCurve(3, 10_000);
    expect(m.get(1)).toBe(5000);
    expect(m.get(2)).toBe(3000);
    expect(m.get(3)).toBe(2000);
  });
  it('N=10 → top 3 only (K=3 since ceil(10*0.25)=3)', () => {
    const m = computeGppCurve(10, 10_000);
    expect(m.size).toBe(3);
    expect(sumOf(m)).toBe(10_000);
  });
  it('N=20 → small-room shape (top 5, 1/2/3 podium + flat 4-5)', () => {
    const m = computeGppCurve(20, 10_000);
    expect(m.size).toBe(5);
    expect(sumOf(m)).toBe(10_000);
    expect(m.get(1)!).toBeGreaterThanOrEqual(m.get(2)!);
    expect(m.get(2)!).toBeGreaterThanOrEqual(m.get(3)!);
    expect(m.get(3)!).toBeGreaterThanOrEqual(m.get(4)!);
  });
  it('N=100 → full stepped curve (top 25, 1/2/3 + 4-10 + 11-25)', () => {
    const m = computeGppCurve(100, 1_000_000);
    expect(m.size).toBe(25);
    expect(sumOf(m)).toBe(1_000_000);
    // Tiers monotonic (rank 1 > rank 2 > rank 3 > rank 4 == ... rank 10 > rank 11 == ... rank 25)
    expect(m.get(1)!).toBeGreaterThan(m.get(2)!);
    expect(m.get(2)!).toBeGreaterThan(m.get(3)!);
    expect(m.get(3)!).toBeGreaterThan(m.get(4)!);
    expect(m.get(4)!).toBe(m.get(10)!); // tier flat
    expect(m.get(10)!).toBeGreaterThan(m.get(11)!);
    // Min cash ≥ 1
    expect(m.get(25)!).toBeGreaterThanOrEqual(1);
  });
  it('N=5000 → top 1250 paid, every payer ≥ 1 coin', () => {
    const m = computeGppCurve(5000, 100_000_000);
    expect(m.size).toBe(1250);
    expect(sumOf(m)).toBe(100_000_000);
    for (let r = 1; r <= 1250; r++) expect(m.get(r)!).toBeGreaterThanOrEqual(1);
  });
});

describe('computeLinearPracticeCurve', () => {
  it('N=4 → 2/2/1/1 (rounded from ideal 2/1.5/1/0.5)', () => {
    const m = computeLinearPracticeCurve(4);
    expect(m.get(1)).toBe(2);
    expect(m.get(2)).toBe(2);
    expect(m.get(3)).toBe(1);
    expect(m.get(4)).toBe(1);
  });
  it('every rank gets ≥1 coin and rank 1 always 2', () => {
    for (const N of [1, 5, 50, 500]) {
      const m = computeLinearPracticeCurve(N);
      expect(m.get(1)).toBe(2);
      for (const v of m.values()) expect(v).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('computeActualPrizeCents', () => {
  it('21 total × $1 entry × 10% rake → 1890 cents', () => {
    expect(computeActualPrizeCents({ totalCount: 21, entryFeeCents: 100, rakePct: 10 })).toBe(1890);
  });
  it('zero entries → zero pool', () => {
    expect(computeActualPrizeCents({ totalCount: 0, entryFeeCents: 100, rakePct: 10 })).toBe(0);
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
