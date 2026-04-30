import { describe, expect, it } from 'vitest';
import {
  addToken,
  applyPreset,
  bumpAlloc,
  ctaState,
  dollarsTotal,
  isValid,
  remainingPct,
  removeToken,
  reset,
  setAlloc,
  totalAlloc,
} from './lineupReducer.js';

// INV-3 (ADR-0003): step=1, min=0, max=100, sum=100, count=5.
describe('lineupReducer', () => {
  describe('addToken', () => {
    it('first token gets full 100% (no longer capped at 80)', () => {
      expect(addToken([], 'BTC')).toEqual([{ symbol: 'BTC', alloc: 100 }]);
    });

    it('second token rebalances to equal split, total stays 100', () => {
      const after = addToken([{ symbol: 'BTC', alloc: 100 }], 'ETH');
      expect(after.map((p) => p.symbol).sort()).toEqual(['BTC', 'ETH']);
      const sum = after.reduce((s, p) => s + p.alloc, 0);
      expect(sum).toBe(100);
    });

    it('5 tokens equal-split to 20% each (sum=100)', () => {
      let lineup: ReturnType<typeof addToken> = [];
      for (const s of ['BTC', 'ETH', 'PEPE', 'WIF', 'BONK']) {
        lineup = addToken(lineup, s);
      }
      expect(lineup).toHaveLength(5);
      expect(lineup.reduce((s, p) => s + p.alloc, 0)).toBe(100);
      lineup.forEach((p) => {
        expect(Number.isInteger(p.alloc)).toBe(true);
        expect(p.alloc).toBeGreaterThanOrEqual(0);
        expect(p.alloc).toBeLessThanOrEqual(100);
      });
    });

    it('3 tokens with non-divisible 100 — first absorbs remainder', () => {
      let lineup: ReturnType<typeof addToken> = [];
      for (const s of ['BTC', 'ETH', 'PEPE']) lineup = addToken(lineup, s);
      // 100/3 → 33 each, remainder 1 → first slot = 34, others = 33
      expect(lineup.reduce((s, p) => s + p.alloc, 0)).toBe(100);
      expect(lineup[0]!.alloc).toBe(34);
      expect(lineup[1]!.alloc).toBe(33);
      expect(lineup[2]!.alloc).toBe(33);
    });

    it('refuses to add 6th token (no-op)', () => {
      const five = ['BTC', 'ETH', 'PEPE', 'WIF', 'BONK'].reduce<ReturnType<typeof addToken>>(
        (acc, s) => addToken(acc, s),
        [],
      );
      const six = addToken(five, 'DOGE');
      expect(six).toHaveLength(5);
    });

    it('refuses duplicate symbol (no-op)', () => {
      const after = addToken([{ symbol: 'BTC', alloc: 100 }], 'BTC');
      expect(after).toHaveLength(1);
    });
  });

  describe('removeToken', () => {
    it('removes by symbol; does not rebalance', () => {
      const after = removeToken(
        [
          { symbol: 'BTC', alloc: 50 },
          { symbol: 'ETH', alloc: 50 },
        ],
        'BTC',
      );
      expect(after).toEqual([{ symbol: 'ETH', alloc: 50 }]);
    });
  });

  describe('bumpAlloc', () => {
    it('+1 within bounds adjusts only target token', () => {
      const after = bumpAlloc(
        [
          { symbol: 'BTC', alloc: 40 },
          { symbol: 'ETH', alloc: 60 },
        ],
        'BTC',
        +1,
      );
      expect(after.find((p) => p.symbol === 'BTC')?.alloc).toBe(41);
      expect(after.find((p) => p.symbol === 'ETH')?.alloc).toBe(60);
    });

    it('clamps to max 100 (no longer 80)', () => {
      const after = bumpAlloc([{ symbol: 'BTC', alloc: 100 }], 'BTC', +5);
      expect(after[0]!.alloc).toBe(100);
    });

    it('clamps to min 0 (no longer 5)', () => {
      const after = bumpAlloc([{ symbol: 'BTC', alloc: 0 }], 'BTC', -5);
      expect(after[0]!.alloc).toBe(0);
    });
  });

  describe('isValid', () => {
    it('5 tokens, sum=100 (integer mix) → valid', () => {
      const lineup = [
        { symbol: 'BTC', alloc: 37 },
        { symbol: 'ETH', alloc: 28 },
        { symbol: 'PEPE', alloc: 19 },
        { symbol: 'WIF', alloc: 9 },
        { symbol: 'BONK', alloc: 7 },
      ];
      expect(isValid(lineup)).toBe(true);
    });

    it('5 tokens with one at 0% and one at 100%-rest → valid (degenerate but legal)', () => {
      const lineup = [
        { symbol: 'BTC', alloc: 100 },
        { symbol: 'ETH', alloc: 0 },
        { symbol: 'PEPE', alloc: 0 },
        { symbol: 'WIF', alloc: 0 },
        { symbol: 'BONK', alloc: 0 },
      ];
      expect(isValid(lineup)).toBe(true);
    });

    it('< 5 tokens → invalid', () => {
      expect(isValid([{ symbol: 'BTC', alloc: 100 }])).toBe(false);
    });

    it('sum != 100 → invalid', () => {
      const lineup = [
        { symbol: 'BTC', alloc: 30 },
        { symbol: 'ETH', alloc: 25 },
        { symbol: 'PEPE', alloc: 15 },
        { symbol: 'WIF', alloc: 10 },
        { symbol: 'BONK', alloc: 10 },
      ];
      expect(isValid(lineup)).toBe(false);
    });

    it('non-integer alloc → invalid', () => {
      const lineup = [
        { symbol: 'BTC', alloc: 33.3 },
        { symbol: 'ETH', alloc: 33.3 },
        { symbol: 'PEPE', alloc: 13.4 },
        { symbol: 'WIF', alloc: 10 },
        { symbol: 'BONK', alloc: 10 },
      ];
      expect(isValid(lineup)).toBe(false);
    });
  });

  describe('setAlloc', () => {
    it('updates existing token alloc, leaving others untouched', () => {
      const after = setAlloc(
        [
          { symbol: 'BTC', alloc: 50 },
          { symbol: 'ETH', alloc: 50 },
        ],
        'BTC',
        37,
      );
      expect(after.find((p) => p.symbol === 'BTC')?.alloc).toBe(37);
      expect(after.find((p) => p.symbol === 'ETH')?.alloc).toBe(50);
    });

    it('appends new token if not present and lineup has room', () => {
      const after = setAlloc([{ symbol: 'BTC', alloc: 50 }], 'PEPE', 25);
      expect(after).toHaveLength(2);
      expect(after.find((p) => p.symbol === 'PEPE')?.alloc).toBe(25);
    });

    it('refuses to append 6th token (no-op)', () => {
      const five = ['BTC', 'ETH', 'PEPE', 'WIF', 'BONK'].reduce<ReturnType<typeof addToken>>(
        (acc, s) => addToken(acc, s),
        [],
      );
      const after = setAlloc(five, 'DOGE', 10);
      expect(after).toHaveLength(5);
    });

    it('clamps alloc to [0, 100]', () => {
      const a = setAlloc([{ symbol: 'BTC', alloc: 50 }], 'BTC', 250);
      expect(a[0]!.alloc).toBe(100);
      const b = setAlloc([{ symbol: 'BTC', alloc: 50 }], 'BTC', -10);
      expect(b[0]!.alloc).toBe(0);
    });

    it('rounds non-integer alloc to nearest int', () => {
      const after = setAlloc([{ symbol: 'BTC', alloc: 50 }], 'BTC', 33.7);
      expect(after[0]!.alloc).toBe(34);
    });
  });

  describe('applyPreset', () => {
    it('returns a fresh copy of valid 5-token preset', () => {
      const preset = [
        { symbol: 'BTC', alloc: 30 },
        { symbol: 'ETH', alloc: 25 },
        { symbol: 'PEPE', alloc: 20 },
        { symbol: 'WIF', alloc: 15 },
        { symbol: 'BONK', alloc: 10 },
      ];
      const after = applyPreset(preset);
      expect(after).toEqual(preset);
      expect(after).not.toBe(preset); // distinct array
    });

    it('throws on != 5 picks', () => {
      expect(() =>
        applyPreset([
          { symbol: 'BTC', alloc: 60 },
          { symbol: 'ETH', alloc: 40 },
        ]),
      ).toThrow(/expected 5/);
    });

    it('throws on sum != 100', () => {
      expect(() =>
        applyPreset([
          { symbol: 'BTC', alloc: 30 },
          { symbol: 'ETH', alloc: 30 },
          { symbol: 'PEPE', alloc: 20 },
          { symbol: 'WIF', alloc: 10 },
          { symbol: 'BONK', alloc: 5 },
        ]),
      ).toThrow(/sum 95/);
    });
  });

  describe('reset', () => {
    it('returns empty lineup', () => {
      expect(reset()).toEqual([]);
    });
  });

  describe('selectors', () => {
    const half = [
      { symbol: 'BTC', alloc: 30 },
      { symbol: 'ETH', alloc: 25 },
    ];

    it('totalAlloc sums alloc values', () => {
      expect(totalAlloc([])).toBe(0);
      expect(totalAlloc(half)).toBe(55);
    });

    it('remainingPct = 100 - sum, never negative', () => {
      expect(remainingPct([])).toBe(100);
      expect(remainingPct(half)).toBe(45);
      // over budget collapses to 0, not negative
      const over = [
        { symbol: 'BTC', alloc: 80 },
        { symbol: 'ETH', alloc: 40 },
      ];
      expect(remainingPct(over)).toBe(0);
    });

    it('dollarsTotal converts via tier', () => {
      expect(dollarsTotal(half, 100_000)).toBe(55_000);
      expect(dollarsTotal(half, 1_000_000)).toBe(550_000);
    });
  });

  describe('ctaState', () => {
    it('< 5 picks → pick N more', () => {
      expect(ctaState([], 'bull', '50 ⭐ entry')).toEqual({ kind: 'pick', label: 'PICK 5 MORE' });
      expect(ctaState([{ symbol: 'BTC', alloc: 50 }], 'bull', '50 ⭐ entry')).toEqual({
        kind: 'pick',
        label: 'PICK 4 MORE',
      });
    });

    it('5 picks but sum < 100 → allocate X more', () => {
      const five = [
        { symbol: 'BTC', alloc: 20 },
        { symbol: 'ETH', alloc: 20 },
        { symbol: 'PEPE', alloc: 20 },
        { symbol: 'WIF', alloc: 20 },
        { symbol: 'BONK', alloc: 15 },
      ];
      expect(ctaState(five, 'bull', '50 ⭐ entry')).toEqual({
        kind: 'alloc',
        label: 'ALLOCATE 5% MORE',
      });
    });

    it('5 picks and sum > 100 → over budget', () => {
      const five = [
        { symbol: 'BTC', alloc: 30 },
        { symbol: 'ETH', alloc: 30 },
        { symbol: 'PEPE', alloc: 25 },
        { symbol: 'WIF', alloc: 20 },
        { symbol: 'BONK', alloc: 10 },
      ];
      expect(ctaState(five, 'bull', '50 ⭐ entry')).toEqual({
        kind: 'over',
        label: 'OVER BUDGET BY 15%',
      });
    });

    it('5 picks, sum=100 → ready (mode-aware label)', () => {
      const five = [
        { symbol: 'BTC', alloc: 30 },
        { symbol: 'ETH', alloc: 25 },
        { symbol: 'PEPE', alloc: 20 },
        { symbol: 'WIF', alloc: 15 },
        { symbol: 'BONK', alloc: 10 },
      ];
      expect(ctaState(five, 'bull', '50 ⭐ entry')).toEqual({
        kind: 'ready',
        label: 'GO BULL · 50 ⭐ entry',
      });
      expect(ctaState(five, 'bear', '25 ⭐ entry')).toEqual({
        kind: 'ready',
        label: 'GO BEAR · 25 ⭐ entry',
      });
    });
  });
});
