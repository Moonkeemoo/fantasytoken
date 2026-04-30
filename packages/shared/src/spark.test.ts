import { describe, expect, it } from 'vitest';
import { sparkPath, SPARK_DIMENSIONS, SPARK_VIEWBOX } from './spark.js';

describe('sparkPath', () => {
  it('same seed + direction → identical path (deterministic)', () => {
    expect(sparkPath('PEPE', true)).toBe(sparkPath('PEPE', true));
    expect(sparkPath('BTC', false)).toBe(sparkPath('BTC', false));
  });

  it('different seeds → different paths', () => {
    expect(sparkPath('PEPE', true)).not.toBe(sparkPath('BTC', true));
  });

  it('flipping direction changes the path', () => {
    expect(sparkPath('PEPE', true)).not.toBe(sparkPath('PEPE', false));
  });

  it('starts with M (moveto) and contains 16 points (M + 15×L)', () => {
    const d = sparkPath('SOL', true);
    expect(d.startsWith('M')).toBe(true);
    const lCount = (d.match(/L/g) ?? []).length;
    expect(lCount).toBe(15);
  });

  it('all coordinates within viewBox bounds', () => {
    const d = sparkPath('WIF', false);
    const coords = d.split(/[ML\s]+/).filter(Boolean);
    for (const pair of coords) {
      const [xs, ys] = pair.split(',');
      const x = Number(xs);
      const y = Number(ys);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(SPARK_DIMENSIONS.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(SPARK_DIMENSIONS.height);
    }
  });
});

describe('SPARK_VIEWBOX', () => {
  it('matches dimensions', () => {
    expect(SPARK_VIEWBOX).toBe(`0 0 ${SPARK_DIMENSIONS.width} ${SPARK_DIMENSIONS.height}`);
  });
});
