import { describe, expect, it } from 'vitest';
import { density } from './pacing.js';

describe('density', () => {
  it('uniform is constant 1', () => {
    expect(density('uniform', 0)).toBe(1);
    expect(density('uniform', 0.5)).toBe(1);
    expect(density('uniform', 1)).toBe(1);
  });

  it('bell peaks near t=0.4', () => {
    const peak = density('bell', 0.4);
    expect(density('bell', 0.0)).toBeLessThan(peak);
    expect(density('bell', 0.8)).toBeLessThan(peak);
    expect(peak).toBeGreaterThan(1.4);
  });

  it('bell has roughly mean 1 over [0,1]', () => {
    let sum = 0;
    const n = 1000;
    for (let i = 0; i < n; i++) sum += density('bell', i / n);
    const mean = sum / n;
    expect(mean).toBeGreaterThan(0.6);
    expect(mean).toBeLessThan(1.4);
  });

  it('exponential decays monotonically', () => {
    const a = density('exponential', 0);
    const b = density('exponential', 0.5);
    const c = density('exponential', 1);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it('clamps t outside [0,1] without NaN', () => {
    expect(Number.isFinite(density('bell', -1))).toBe(true);
    expect(Number.isFinite(density('bell', 2))).toBe(true);
    expect(Number.isFinite(density('exponential', -0.5))).toBe(true);
  });

  it('returns finite, non-negative values for all shapes', () => {
    for (const shape of ['bell', 'exponential', 'uniform'] as const) {
      for (let t = 0; t <= 1; t += 0.05) {
        const v = density(shape, t);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
