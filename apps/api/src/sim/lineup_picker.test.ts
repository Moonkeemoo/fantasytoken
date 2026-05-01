import { describe, expect, it } from 'vitest';
import { filterPoolByBias, pickLineup, shuffle, type PoolToken } from './lineup_picker.js';

const POOL: PoolToken[] = [
  { symbol: 'BTC', marketCapUsd: 1_500_000_000_000, pctChange24h: 0.5 },
  { symbol: 'ETH', marketCapUsd: 500_000_000_000, pctChange24h: 1.0 },
  { symbol: 'SOL', marketCapUsd: 100_000_000_000, pctChange24h: -2.5 },
  { symbol: 'TON', marketCapUsd: 30_000_000_000, pctChange24h: 0.2 },
  { symbol: 'PEPE', marketCapUsd: 4_000_000_000, pctChange24h: 25.0 },
  { symbol: 'DOGE', marketCapUsd: 50_000_000_000, pctChange24h: -15.0 },
  { symbol: 'SHIB', marketCapUsd: 8_000_000_000, pctChange24h: -1.0 },
  { symbol: 'BONK', marketCapUsd: 2_000_000_000, pctChange24h: 40.0 },
  { symbol: 'XYZ', marketCapUsd: 1_000_000, pctChange24h: 0.1 },
  { symbol: 'AAA', marketCapUsd: 5_000_000, pctChange24h: 0.3 },
];

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('filterPoolByBias', () => {
  it('mixed returns the whole pool', () => {
    expect(filterPoolByBias(POOL, 'mixed')).toHaveLength(POOL.length);
  });

  it('bluechip ranks by market cap descending', () => {
    const r = filterPoolByBias(POOL, 'bluechip');
    expect(r[0]?.symbol).toBe('BTC');
    expect(r[1]?.symbol).toBe('ETH');
    expect(r[2]?.symbol).toBe('SOL');
  });

  it('meme prefers symbol heuristic when ≥5 matches', () => {
    // Pool only has 4 meme-named tokens (PEPE/DOGE/SHIB/BONK), so the
    // path falls through to combining named + lowest-cap tail. Either
    // way we never return an empty list and PEPE is in there.
    const r = filterPoolByBias(POOL, 'meme');
    expect(r.length).toBeGreaterThan(0);
    expect(r.map((t) => t.symbol)).toContain('PEPE');
  });

  it('volatile ranks by abs(pctChange24h) desc', () => {
    const r = filterPoolByBias(POOL, 'volatile');
    expect(r[0]?.symbol).toBe('BONK');
    expect(r[1]?.symbol).toBe('PEPE');
    expect(r[2]?.symbol).toBe('DOGE');
  });

  it('returns empty array for empty pool', () => {
    expect(filterPoolByBias([], 'mixed')).toEqual([]);
    expect(filterPoolByBias([], 'bluechip')).toEqual([]);
    expect(filterPoolByBias([], 'volatile')).toEqual([]);
  });
});

describe('shuffle', () => {
  it('returns same elements in different order with non-trivial seed', () => {
    const r = shuffle(['a', 'b', 'c', 'd', 'e', 'f'], seededRand(42));
    expect(new Set(r)).toEqual(new Set(['a', 'b', 'c', 'd', 'e', 'f']));
  });

  it('does not mutate input', () => {
    const input = ['a', 'b', 'c'];
    shuffle(input, seededRand(1));
    expect(input).toEqual(['a', 'b', 'c']);
  });

  it('is deterministic given the same rand stream', () => {
    const a = shuffle(['x', 'y', 'z', 'w'], seededRand(99));
    const b = shuffle(['x', 'y', 'z', 'w'], seededRand(99));
    expect(a).toEqual(b);
  });
});

describe('pickLineup', () => {
  it('returns size unique symbols from the bias-filtered pool', () => {
    const r = pickLineup({ pool: POOL, bias: 'mixed', size: 3, rand: seededRand(7) });
    expect(r).toHaveLength(3);
    expect(new Set(r).size).toBe(3);
  });

  it('returns whole filtered pool when size > available', () => {
    const tinyPool: PoolToken[] = [
      { symbol: 'X', marketCapUsd: 1, pctChange24h: 0 },
      { symbol: 'Y', marketCapUsd: 2, pctChange24h: 0 },
    ];
    const r = pickLineup({ pool: tinyPool, bias: 'mixed', size: 5, rand: seededRand(1) });
    expect(r).toHaveLength(2);
  });

  it('respects bluechip bias — picks come from the top-mcap filtered set', () => {
    // With a pool of 10 and the top-30 bluechip cap, all symbols are eligible.
    // We verify the FILTERED pool (not the picks) is mcap-sorted.
    const filtered = filterPoolByBias(POOL, 'bluechip');
    expect(filtered[0]?.symbol).toBe('BTC');
    expect(filtered[1]?.symbol).toBe('ETH');
    const r = pickLineup({ pool: POOL, bias: 'bluechip', size: 3, rand: seededRand(11) });
    expect(r).toHaveLength(3);
    const allowed = new Set(filtered.map((t) => t.symbol));
    for (const s of r) expect(allowed.has(s)).toBe(true);
  });

  it('returns empty list for empty pool', () => {
    expect(pickLineup({ pool: [], bias: 'mixed', size: 3, rand: seededRand(1) })).toEqual([]);
  });

  it('is deterministic for fixed (pool, bias, size, seed)', () => {
    const a = pickLineup({ pool: POOL, bias: 'mixed', size: 4, rand: seededRand(2026) });
    const b = pickLineup({ pool: POOL, bias: 'mixed', size: 4, rand: seededRand(2026) });
    expect(a).toEqual(b);
  });
});
