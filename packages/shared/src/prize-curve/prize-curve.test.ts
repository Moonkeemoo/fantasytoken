import { describe, expect, it } from 'vitest';
import { computePrizeCurve, computeActualPrizeCents } from './index.js';

describe('computePrizeCurve', () => {
  it('1 real → 1 paying gets all', () => {
    const m = computePrizeCurve(1, 10_000);
    expect(m.get(1)).toBe(10_000);
    expect(m.size).toBe(1);
  });

  it('5 real → top 1 (30%) gets all', () => {
    // payingCount = max(1, floor(5*0.3)) = 1
    const m = computePrizeCurve(5, 100_000);
    expect(m.get(1)).toBe(100_000);
    expect(m.size).toBe(1);
  });

  it('10 real → top 3, sum == prizePool', () => {
    const m = computePrizeCurve(10, 100_000);
    expect(m.size).toBe(3);
    const sum = [...m.values()].reduce((s, v) => s + v, 0);
    expect(sum).toBe(100_000);
  });

  it('100 real → top 30, sum == prizePool, no fractional cents', () => {
    const m = computePrizeCurve(100, 1_000_000);
    expect(m.size).toBe(30);
    const sum = [...m.values()].reduce((s, v) => s + v, 0);
    expect(sum).toBe(1_000_000);
    [...m.values()].forEach((v) => expect(Number.isInteger(v)).toBe(true));
  });

  it('zero real or zero pool returns empty map', () => {
    expect(computePrizeCurve(0, 1_000).size).toBe(0);
    expect(computePrizeCurve(10, 0).size).toBe(0);
  });
});

describe('computeActualPrizeCents', () => {
  it('21 real × $1 entry × 10% rake → 1890 cents', () => {
    expect(computeActualPrizeCents({ realCount: 21, entryFeeCents: 100, rakePct: 10 })).toBe(1890);
  });

  it('1 real × $1 × 10% rake → 90 cents (covers user-bug case)', () => {
    expect(computeActualPrizeCents({ realCount: 1, entryFeeCents: 100, rakePct: 10 })).toBe(90);
  });

  it('zero real entries → zero pool', () => {
    expect(computeActualPrizeCents({ realCount: 0, entryFeeCents: 100, rakePct: 10 })).toBe(0);
  });

  it('zero rake → full sum', () => {
    expect(computeActualPrizeCents({ realCount: 10, entryFeeCents: 500, rakePct: 0 })).toBe(5000);
  });

  it('rounds down to integer cents', () => {
    // 7 × 33 × 0.9 = 207.9 → 207
    expect(computeActualPrizeCents({ realCount: 7, entryFeeCents: 33, rakePct: 10 })).toBe(207);
  });

  it('honours guaranteed minimum overlay when collected < guaranteed', () => {
    // 1 × $1 × 0.9 = $0.90, guaranteed $5 → $5
    expect(
      computeActualPrizeCents({
        realCount: 1,
        entryFeeCents: 100,
        rakePct: 10,
        guaranteedPoolCents: 500,
      }),
    ).toBe(500);
  });

  it('uses collected when collected > guaranteed', () => {
    expect(
      computeActualPrizeCents({
        realCount: 100,
        entryFeeCents: 100,
        rakePct: 10,
        guaranteedPoolCents: 500,
      }),
    ).toBe(9000);
  });
});
