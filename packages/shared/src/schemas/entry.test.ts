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

// INV-3 (ADR-0003): step=1, range [0,100], sum=100, count=5.
describe('entrySubmissionSchema', () => {
  it('accepts a valid lineup (5 tokens, sum=100, integer allocs in [0,100])', () => {
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

  it('accepts non-multiple-of-5 allocs (ADR-0003: step=1)', () => {
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
    ).toBe(true);
  });

  it('accepts 0% alloc on a slot (ADR-0003: min=0)', () => {
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
    ).toBe(true);
  });

  it('accepts 100% on a single slot when others are 0% (ADR-0003: max=100)', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [
          { symbol: 'BTC', alloc: 100 },
          { symbol: 'ETH', alloc: 0 },
          { symbol: 'PEPE', alloc: 0 },
          { symbol: 'WIF', alloc: 0 },
          { symbol: 'BONK', alloc: 0 },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects negative alloc', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [
          { symbol: 'BTC', alloc: -5 },
          { symbol: 'ETH', alloc: 35 },
          { symbol: 'PEPE', alloc: 25 },
          { symbol: 'WIF', alloc: 25 },
          { symbol: 'BONK', alloc: 20 },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects alloc > 100', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [
          { symbol: 'BTC', alloc: 101 },
          { symbol: 'ETH', alloc: -1 },
          { symbol: 'PEPE', alloc: 0 },
          { symbol: 'WIF', alloc: 0 },
          { symbol: 'BONK', alloc: 0 },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects non-integer alloc', () => {
    expect(
      entrySubmissionSchema.safeParse({
        picks: [
          { symbol: 'BTC', alloc: 33.3 },
          { symbol: 'ETH', alloc: 33.3 },
          { symbol: 'PEPE', alloc: 13.4 },
          { symbol: 'WIF', alloc: 10 },
          { symbol: 'BONK', alloc: 10 },
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
