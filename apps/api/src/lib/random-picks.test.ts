import { describe, expect, it } from 'vitest';
import { generateRandomPicks } from './random-picks.js';

const SYMBOLS = ['BTC', 'ETH', 'PEPE', 'WIF', 'BONK', 'SOL', 'DOGE', 'SHIB', 'ADA', 'XRP'];

function makeRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

describe('generateRandomPicks', () => {
  it('returns exactly 5 picks', () => {
    const picks = generateRandomPicks(SYMBOLS, makeRng(1));
    expect(picks).toHaveLength(5);
  });

  it('sum of allocations is 100 across 10 random seeds', () => {
    for (let s = 1; s <= 10; s++) {
      const picks = generateRandomPicks(SYMBOLS, makeRng(s));
      expect(picks.reduce((sum, p) => sum + p.alloc, 0)).toBe(100);
    }
  });

  it('each alloc is multiple of 5 and in [5, 80] across 10 seeds', () => {
    for (let s = 1; s <= 10; s++) {
      const picks = generateRandomPicks(SYMBOLS, makeRng(s));
      picks.forEach((p) => {
        expect(p.alloc % 5).toBe(0);
        expect(p.alloc).toBeGreaterThanOrEqual(5);
        expect(p.alloc).toBeLessThanOrEqual(80);
      });
    }
  });

  it('no duplicate symbols across 10 seeds', () => {
    for (let s = 1; s <= 10; s++) {
      const picks = generateRandomPicks(SYMBOLS, makeRng(s));
      const symbols = picks.map((p) => p.symbol);
      expect(new Set(symbols).size).toBe(symbols.length);
    }
  });

  it('throws if fewer than 5 unique symbols available', () => {
    expect(() => generateRandomPicks(['BTC', 'ETH'], makeRng(1))).toThrow();
  });

  it('deterministic for same seed', () => {
    const a = generateRandomPicks(SYMBOLS, makeRng(42));
    const b = generateRandomPicks(SYMBOLS, makeRng(42));
    expect(a).toEqual(b);
  });
});
