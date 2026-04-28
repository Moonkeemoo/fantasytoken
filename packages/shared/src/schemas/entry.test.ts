import { describe, expect, it } from 'vitest';
import { entrySubmissionSchema } from './entry.js';

const VALID = {
  picks: [
    { symbol: 'BTC', alloc: 40 },
    { symbol: 'ETH', alloc: 25 },
    { symbol: 'PEPE', alloc: 15 },
    { symbol: 'WIF', alloc: 10 },
    { symbol: 'BONK', alloc: 10 },
  ],
};

describe('entrySubmissionSchema', () => {
  it('accepts a valid lineup (5 tokens, sum=100, all multiples of 5, range 5-80)', () => {
    expect(entrySubmissionSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects fewer than 5 picks', () => {
    expect(entrySubmissionSchema.safeParse({ picks: VALID.picks.slice(0, 4) }).success).toBe(false);
  });

  it('rejects more than 5 picks', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [...VALID.picks, { symbol: 'DOGE', alloc: 5 }],
      }).success,
    ).toBe(false);
  });

  it('rejects sum != 100', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: VALID.picks.map((p, i) => (i === 0 ? { ...p, alloc: 35 } : p)),
      }).success,
    ).toBe(false);
  });

  it('rejects allocation that is not a multiple of 5', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [
          { symbol: 'BTC', alloc: 42 },
          { symbol: 'ETH', alloc: 23 },
          { symbol: 'PEPE', alloc: 15 },
          { symbol: 'WIF', alloc: 10 },
          { symbol: 'BONK', alloc: 10 },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects allocation < 5%', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [
          { symbol: 'BTC', alloc: 0 },
          { symbol: 'ETH', alloc: 25 },
          { symbol: 'PEPE', alloc: 25 },
          { symbol: 'WIF', alloc: 25 },
          { symbol: 'BONK', alloc: 25 },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects allocation > 80%', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [
          { symbol: 'BTC', alloc: 85 },
          { symbol: 'ETH', alloc: 5 },
          { symbol: 'PEPE', alloc: 5 },
          { symbol: 'WIF', alloc: 0 },
          { symbol: 'BONK', alloc: 5 },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate symbols', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [
          { symbol: 'BTC', alloc: 40 },
          { symbol: 'BTC', alloc: 25 },
          { symbol: 'PEPE', alloc: 15 },
          { symbol: 'WIF', alloc: 10 },
          { symbol: 'BONK', alloc: 10 },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects empty/non-string symbols', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [
          { symbol: '', alloc: 40 },
          { symbol: 'ETH', alloc: 25 },
          { symbol: 'PEPE', alloc: 15 },
          { symbol: 'WIF', alloc: 10 },
          { symbol: 'BONK', alloc: 10 },
        ],
      }).success,
    ).toBe(false);
  });
});
