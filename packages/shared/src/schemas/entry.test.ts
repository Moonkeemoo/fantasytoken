import { describe, expect, it } from 'vitest';
import { entrySubmissionSchema, evenAllocCents, ALLOC_CENTS_TOTAL } from './entry.js';

// TZ-003: payload is just the symbol list (1–5 unique). Allocations are
// computed server-side via evenAllocCents.
describe('entrySubmissionSchema (TZ-003)', () => {
  it('accepts a 1-token lineup (all-in)', () => {
    expect(entrySubmissionSchema.safeParse({ picks: ['BTC'] }).success).toBe(true);
  });

  it('accepts a 5-token lineup', () => {
    expect(
      entrySubmissionSchema.safeParse({ picks: ['BTC', 'ETH', 'SOL', 'PEPE', 'WIF'] }).success,
    ).toBe(true);
  });

  it('rejects empty lineup', () => {
    expect(entrySubmissionSchema.safeParse({ picks: [] }).success).toBe(false);
  });

  it('rejects more than 5 picks', () => {
    expect(entrySubmissionSchema.safeParse({ picks: ['A', 'B', 'C', 'D', 'E', 'F'] }).success).toBe(
      false,
    );
  });

  it('rejects duplicate symbols', () => {
    expect(entrySubmissionSchema.safeParse({ picks: ['BTC', 'BTC'] }).success).toBe(false);
  });
});

describe('evenAllocCents (basis points)', () => {
  it('1 token → [10000]', () => {
    expect(evenAllocCents(['A'])).toEqual([10000]);
  });

  it('2 tokens → [5000, 5000]', () => {
    expect(evenAllocCents(['A', 'B'])).toEqual([5000, 5000]);
  });

  it('3 tokens → [3334, 3333, 3333] (round-off to picks[0])', () => {
    expect(evenAllocCents(['A', 'B', 'C'])).toEqual([3334, 3333, 3333]);
  });

  it('4 tokens → [2500, 2500, 2500, 2500]', () => {
    expect(evenAllocCents(['A', 'B', 'C', 'D'])).toEqual([2500, 2500, 2500, 2500]);
  });

  it('5 tokens → [2000, 2000, 2000, 2000, 2000]', () => {
    expect(evenAllocCents(['A', 'B', 'C', 'D', 'E'])).toEqual([2000, 2000, 2000, 2000, 2000]);
  });

  it('always sums to 10000', () => {
    for (let n = 1; n <= 5; n++) {
      const arr = Array.from({ length: n }, (_, i) => `T${i}`);
      const allocs = evenAllocCents(arr);
      expect(allocs.reduce((a, b) => a + b, 0)).toBe(ALLOC_CENTS_TOTAL);
    }
  });
});
