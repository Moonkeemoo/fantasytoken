import { describe, expect, it } from 'vitest';
import { generateIdentity } from './naming.js';

describe('generateIdentity', () => {
  it('is deterministic — same seed → same handle/firstName', () => {
    const a = generateIdentity(42);
    const b = generateIdentity(42);
    expect(a).toEqual(b);
  });

  it('different seeds usually produce different handles', () => {
    // Spot-check: 100 distinct seeds produce ≥90 unique handles. The pool
    // has ~57×56×13 combos so collisions are rare but non-zero.
    const seen = new Set<string>();
    for (let s = 1; s <= 100; s++) {
      seen.add(generateIdentity(s).handle);
    }
    expect(seen.size).toBeGreaterThanOrEqual(90);
  });

  it('handle never starts with banned bot/fake/test prefix', () => {
    for (let s = 1; s <= 200; s++) {
      const { handle } = generateIdentity(s);
      expect(handle).not.toMatch(/^(bot|fake|test)/i);
    }
  });

  it('firstName is capitalised', () => {
    const { firstName } = generateIdentity(7);
    expect(firstName.charAt(0)).toBe(firstName.charAt(0).toUpperCase());
  });

  it('handles a wide seed range without throwing', () => {
    expect(() => generateIdentity(0)).not.toThrow();
    expect(() => generateIdentity(0xffffffff)).not.toThrow();
    expect(() => generateIdentity(123_456_789)).not.toThrow();
  });
});
