import { describe, expect, it } from 'vitest';
import {
  addToken,
  applyPreset,
  ctaState,
  dollarsPerPick,
  dollarsTotal,
  evenAllocPct,
  isValid,
  removeToken,
  reset,
  toggleToken,
  type LineupPick,
} from './lineupReducer.js';

const mk = (symbol: string, alloc = 0): LineupPick => ({ symbol, alloc });

describe('TZ-003 lineupReducer · equal-split', () => {
  describe('addToken', () => {
    it('first token gets 100%', () => {
      const r = addToken([], 'BTC');
      expect(r).toEqual([mk('BTC', 100)]);
    });

    it('second token splits to 50/50', () => {
      const r = addToken([mk('BTC', 100)], 'ETH');
      expect(r.map((p) => p.alloc)).toEqual([50, 50]);
    });

    it('three tokens — UI display rounds to 33% each', () => {
      let s: LineupPick[] = [];
      s = addToken(s, 'BTC');
      s = addToken(s, 'ETH');
      s = addToken(s, 'SOL');
      expect(s.map((p) => p.alloc)).toEqual([33, 33, 33]);
    });

    it('five tokens → 20% each', () => {
      let s: LineupPick[] = [];
      for (const sym of ['A', 'B', 'C', 'D', 'E']) s = addToken(s, sym);
      expect(s.map((p) => p.alloc)).toEqual([20, 20, 20, 20, 20]);
    });

    it('caps at 5 picks', () => {
      let s: LineupPick[] = [];
      for (const sym of ['A', 'B', 'C', 'D', 'E', 'F']) s = addToken(s, sym);
      expect(s).toHaveLength(5);
      expect(s.map((p) => p.symbol)).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    it('idempotent on duplicate symbol', () => {
      const s = addToken([mk('BTC', 100)], 'BTC');
      expect(s).toEqual([mk('BTC', 100)]);
    });

    it('carries through display metadata', () => {
      const s = addToken([], { symbol: 'BTC', name: 'Bitcoin', imageUrl: 'http://x/x.png' });
      expect(s[0]).toMatchObject({ symbol: 'BTC', name: 'Bitcoin', imageUrl: 'http://x/x.png' });
    });
  });

  describe('removeToken', () => {
    it('drops the symbol and rebalances', () => {
      const start: LineupPick[] = [mk('A', 33), mk('B', 33), mk('C', 33)];
      const s = removeToken(start, 'B');
      expect(s.map((p) => p.symbol)).toEqual(['A', 'C']);
      expect(s.map((p) => p.alloc)).toEqual([50, 50]);
    });

    it('idempotent if symbol missing', () => {
      const start: LineupPick[] = [mk('A', 50), mk('B', 50)];
      const s = removeToken(start, 'X');
      expect(s).toBe(start);
    });
  });

  describe('toggleToken', () => {
    it('adds when missing', () => {
      const s = toggleToken([], 'BTC');
      expect(s.map((p) => p.symbol)).toEqual(['BTC']);
    });

    it('removes when present', () => {
      const s = toggleToken([mk('BTC', 100)], 'BTC');
      expect(s).toEqual([]);
    });
  });

  describe('isValid', () => {
    it('false on empty', () => {
      expect(isValid([])).toBe(false);
    });

    it('true on 1 pick', () => {
      expect(isValid([mk('BTC', 100)])).toBe(true);
    });

    it('true on 5 picks', () => {
      expect(isValid([mk('A'), mk('B'), mk('C'), mk('D'), mk('E')])).toBe(true);
    });

    it('false on duplicates', () => {
      expect(isValid([mk('A'), mk('A')])).toBe(false);
    });
  });

  describe('selectors', () => {
    it('evenAllocPct: 0 → 0, 1 → 100, 2 → 50, 3 → 33, 4 → 25, 5 → 20', () => {
      expect(evenAllocPct(0)).toBe(0);
      expect(evenAllocPct(1)).toBe(100);
      expect(evenAllocPct(2)).toBe(50);
      expect(evenAllocPct(3)).toBe(33);
      expect(evenAllocPct(4)).toBe(25);
      expect(evenAllocPct(5)).toBe(20);
    });

    it('dollarsTotal == tier when lineup has any picks', () => {
      expect(dollarsTotal([mk('A', 100)], 100)).toBe(100);
      expect(dollarsTotal([], 100)).toBe(0);
    });

    it('dollarsPerPick splits the tier evenly', () => {
      expect(dollarsPerPick([mk('A', 100)], 100)).toBe(100);
      expect(dollarsPerPick([mk('A'), mk('B')], 100)).toBe(50);
      expect(dollarsPerPick([mk('A'), mk('B'), mk('C'), mk('D'), mk('E')], 100)).toBe(20);
    });
  });

  describe('ctaState', () => {
    it('empty lineup → pick prompt', () => {
      const s = ctaState([], 'bull', '🪙 1 entry');
      expect(s.kind).toBe('pick');
      expect(s.label).toBe('PICK 1+ TOKENS');
    });

    it('1+ pick → ready', () => {
      const s = ctaState([mk('A', 100)], 'bull', '🪙 1 entry');
      expect(s.kind).toBe('ready');
      expect(s.label).toBe('GO BULL · 🪙 1 entry');
    });

    it('bear mode label', () => {
      const s = ctaState([mk('A', 100)], 'bear', '🪙 5 entry');
      expect(s.label).toBe('GO BEAR · 🪙 5 entry');
    });
  });

  describe('applyPreset', () => {
    it('applies symbol list with even split', () => {
      const r = applyPreset([{ symbol: 'A' }, { symbol: 'B' }, { symbol: 'C' }]);
      expect(r.map((p) => p.symbol)).toEqual(['A', 'B', 'C']);
      expect(r.map((p) => p.alloc)).toEqual([33, 33, 33]);
    });

    it('throws on >5 picks', () => {
      expect(() => applyPreset([1, 2, 3, 4, 5, 6].map((n) => ({ symbol: `T${n}` })))).toThrow();
    });

    it('reset clears everything', () => {
      expect(reset()).toEqual([]);
    });
  });
});
