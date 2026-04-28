import { describe, expect, it } from 'vitest';
import { addToken, bumpAlloc, isValid, removeToken } from './lineupReducer.js';

describe('lineupReducer', () => {
  describe('addToken', () => {
    it('first token gets 80% (max alloc)', () => {
      expect(addToken([], 'BTC')).toEqual([{ symbol: 'BTC', alloc: 80 }]);
    });

    it('second token rebalances to equal split rounded to %5, total stays 100', () => {
      const after = addToken([{ symbol: 'BTC', alloc: 80 }], 'ETH');
      expect(after.map((p) => p.symbol).sort()).toEqual(['BTC', 'ETH']);
      const sum = after.reduce((s, p) => s + p.alloc, 0);
      expect(sum).toBe(100);
      after.forEach((p) => expect(p.alloc % 5).toBe(0));
    });

    it('5 tokens add to exactly 100, all in [5,80] multiples of 5', () => {
      let lineup: ReturnType<typeof addToken> = [];
      for (const s of ['BTC', 'ETH', 'PEPE', 'WIF', 'BONK']) {
        lineup = addToken(lineup, s);
      }
      expect(lineup).toHaveLength(5);
      expect(lineup.reduce((s, p) => s + p.alloc, 0)).toBe(100);
      lineup.forEach((p) => {
        expect(p.alloc % 5).toBe(0);
        expect(p.alloc).toBeGreaterThanOrEqual(5);
        expect(p.alloc).toBeLessThanOrEqual(80);
      });
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
      const after = addToken([{ symbol: 'BTC', alloc: 80 }], 'BTC');
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
    it('+5 within bounds adjusts only target token', () => {
      const after = bumpAlloc(
        [
          { symbol: 'BTC', alloc: 40 },
          { symbol: 'ETH', alloc: 60 },
        ],
        'BTC',
        +5,
      );
      expect(after.find((p) => p.symbol === 'BTC')?.alloc).toBe(45);
      expect(after.find((p) => p.symbol === 'ETH')?.alloc).toBe(60);
    });

    it('clamps to max 80', () => {
      const after = bumpAlloc([{ symbol: 'BTC', alloc: 80 }], 'BTC', +5);
      expect(after[0]!.alloc).toBe(80);
    });

    it('clamps to min 5', () => {
      const after = bumpAlloc([{ symbol: 'BTC', alloc: 5 }], 'BTC', -5);
      expect(after[0]!.alloc).toBe(5);
    });
  });

  describe('isValid', () => {
    it('5 tokens, sum=100, all in [5,80] multiples of 5 → valid', () => {
      const lineup = [
        { symbol: 'BTC', alloc: 40 },
        { symbol: 'ETH', alloc: 25 },
        { symbol: 'PEPE', alloc: 15 },
        { symbol: 'WIF', alloc: 10 },
        { symbol: 'BONK', alloc: 10 },
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
  });
});
