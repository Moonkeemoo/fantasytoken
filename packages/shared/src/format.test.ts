import { describe, expect, it } from 'vitest';
import { dollarsFor, fmtMoney, fmtMoneyExact, fmtPnL } from './format.js';

describe('fmtMoney', () => {
  it('zero', () => {
    expect(fmtMoney(0)).toBe('$0');
  });

  it('under 1K — rounded whole dollars', () => {
    expect(fmtMoney(1)).toBe('$1');
    expect(fmtMoney(99)).toBe('$99');
    expect(fmtMoney(999)).toBe('$999');
    expect(fmtMoney(999.4)).toBe('$999');
  });

  it('thousands range — K suffix, one decimal trimmed', () => {
    expect(fmtMoney(1_000)).toBe('$1K');
    expect(fmtMoney(1_200)).toBe('$1.2K');
    expect(fmtMoney(1_250)).toBe('$1.3K'); // rounds half-up
    expect(fmtMoney(100_000)).toBe('$100K');
    expect(fmtMoney(999_900)).toBe('$999.9K');
  });

  it('millions range — M suffix', () => {
    expect(fmtMoney(1_000_000)).toBe('$1M');
    expect(fmtMoney(1_500_000)).toBe('$1.5M');
    expect(fmtMoney(2_350_000)).toBe('$2.4M');
  });

  it('billions range — B suffix', () => {
    expect(fmtMoney(1_000_000_000)).toBe('$1B');
    expect(fmtMoney(2_750_000_000)).toBe('$2.8B');
  });

  it('negative input — returns sign-stripped magnitude (use fmtPnL for signed)', () => {
    expect(fmtMoney(-1_200)).toBe('$1.2K');
  });
});

describe('fmtMoneyExact', () => {
  it('zero', () => {
    expect(fmtMoneyExact(0)).toBe('$0');
  });

  it('whole numbers with commas', () => {
    expect(fmtMoneyExact(1_234)).toBe('$1,234');
    expect(fmtMoneyExact(1_234_567)).toBe('$1,234,567');
  });

  it('rounds to whole dollars', () => {
    expect(fmtMoneyExact(1_234.4)).toBe('$1,234');
    expect(fmtMoneyExact(1_234.5)).toBe('$1,235');
  });
});

describe('fmtPnL', () => {
  it('zero is unsigned', () => {
    expect(fmtPnL(0)).toBe('$0');
  });

  it('positive uses +', () => {
    expect(fmtPnL(96)).toBe('+$96');
    expect(fmtPnL(1_200)).toBe('+$1.2K');
    expect(fmtPnL(420)).toBe('+$420');
  });

  it('negative uses U+2212 minus (not ASCII hyphen)', () => {
    expect(fmtPnL(-96)).toBe('−$96');
    expect(fmtPnL(-1_200)).toBe('−$1.2K');
    // explicit codepoint check — avoids "looks the same" hyphen regression
    expect(fmtPnL(-1).charCodeAt(0)).toBe(0x2212);
  });

  it('non-finite → $0', () => {
    expect(fmtPnL(Number.NaN)).toBe('$0');
    expect(fmtPnL(Number.POSITIVE_INFINITY)).toBe('$0');
  });
});

describe('dollarsFor', () => {
  it('30% of $100K = $30,000', () => {
    expect(dollarsFor(30, 100_000)).toBe(30_000);
  });

  it('20% of $1M = $200,000', () => {
    expect(dollarsFor(20, 1_000_000)).toBe(200_000);
  });

  it('0% → $0', () => {
    expect(dollarsFor(0, 100_000)).toBe(0);
  });

  it('100% → full tier', () => {
    expect(dollarsFor(100, 100_000)).toBe(100_000);
  });

  it('rounds to nearest whole dollar', () => {
    // 33% of 100_000 = 33_000 exact; pick a non-clean ratio
    expect(dollarsFor(33, 99_999)).toBe(Math.round((99_999 * 33) / 100));
    expect(dollarsFor(7, 1_234)).toBe(Math.round((1_234 * 7) / 100));
  });

  it('non-finite inputs → 0 (no NaN propagation into UI)', () => {
    expect(dollarsFor(Number.NaN, 100_000)).toBe(0);
    expect(dollarsFor(30, Number.NaN)).toBe(0);
  });
});
