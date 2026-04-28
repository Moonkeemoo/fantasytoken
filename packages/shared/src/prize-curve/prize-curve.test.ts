import { describe, expect, it } from 'vitest';
import { computePrizeCurve } from './index.js';

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
