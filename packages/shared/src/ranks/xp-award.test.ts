import { describe, expect, it } from 'vitest';
import { awardXp } from './xp-award.js';

describe('awardXp', () => {
  describe('top-50% cutoff', () => {
    it('20-spot room, #10 (last in top half) → participation + minimal bonus', () => {
      const a = awardXp({ position: 10, totalEntries: 20, contestMultiplier: 1.0 });
      expect(a.position).toBe(5);
      expect(a.total).toBe(15);
    });

    it('20-spot room, #11 (just outside top half) → participation only', () => {
      const a = awardXp({ position: 11, totalEntries: 20, contestMultiplier: 1.0 });
      expect(a.position).toBe(0);
      expect(a.total).toBe(10);
    });

    it('10-spot room, #5 (last in top half) → participation + minimal bonus', () => {
      const a = awardXp({ position: 5, totalEntries: 10, contestMultiplier: 1.0 });
      expect(a.position).toBe(5);
      expect(a.total).toBe(15);
    });

    it('10-spot room, #6 (just outside top half) → participation only', () => {
      const a = awardXp({ position: 6, totalEntries: 10, contestMultiplier: 1.0 });
      expect(a.position).toBe(0);
      expect(a.total).toBe(10);
    });

    it('100-spot room, #50 → minimal bonus; #51 → none', () => {
      expect(awardXp({ position: 50, totalEntries: 100, contestMultiplier: 1 }).position).toBe(5);
      expect(awardXp({ position: 51, totalEntries: 100, contestMultiplier: 1 }).position).toBe(0);
    });

    it('tiny rooms (cutoff ≤ 3): only podium gets a bonus', () => {
      // N=6 → cutoff=3 → #4 gets nothing extra.
      expect(awardXp({ position: 4, totalEntries: 6, contestMultiplier: 1 }).position).toBe(0);
      // N=3 → cutoff=1 → only #1.
      expect(awardXp({ position: 1, totalEntries: 3, contestMultiplier: 1 }).position).toBe(100);
      expect(awardXp({ position: 2, totalEntries: 3, contestMultiplier: 1 }).position).toBe(0);
    });
  });

  describe('podium emphasis preserved', () => {
    it('#1 of 20 → +100', () => {
      expect(awardXp({ position: 1, totalEntries: 20, contestMultiplier: 1 }).total).toBe(110);
    });
    it('#2 of 20 → +60', () => {
      expect(awardXp({ position: 2, totalEntries: 20, contestMultiplier: 1 }).position).toBe(60);
    });
    it('#3 of 20 → +40', () => {
      expect(awardXp({ position: 3, totalEntries: 20, contestMultiplier: 1 }).position).toBe(40);
    });
  });

  describe('linear scaling between podium and cutoff', () => {
    it('20-spot room, #4 sits closer to peak than #9', () => {
      const four = awardXp({ position: 4, totalEntries: 20, contestMultiplier: 1 }).position;
      const nine = awardXp({ position: 9, totalEntries: 20, contestMultiplier: 1 }).position;
      expect(four).toBeGreaterThan(nine);
      expect(four).toBeLessThanOrEqual(25); // peak ceiling
      expect(nine).toBeGreaterThanOrEqual(5); // floor
    });

    it('larger rooms reward mid placements more than smaller rooms', () => {
      // #5 in a 100-spot room is far from the median — bigger bonus than #5 of 10
      // (which is exactly the cutoff = floor bonus).
      const big = awardXp({ position: 5, totalEntries: 100, contestMultiplier: 1 }).position;
      const small = awardXp({ position: 5, totalEntries: 10, contestMultiplier: 1 }).position;
      expect(big).toBeGreaterThan(small);
    });
  });

  describe('multipliers + breakdown', () => {
    it('Bear ×1.5, #3 of 20 → ceil((10+40)*1.5) = 75', () => {
      const a = awardXp({
        position: 3,
        totalEntries: 20,
        contestMultiplier: 1.5,
        contestType: 'bear',
      });
      expect(a.total).toBe(75);
      expect(a.breakdown).toEqual([
        { reason: 'Participation', amount: 10 },
        { reason: '3rd place bonus', amount: 40 },
        { reason: 'Bear contest ×1.5', amount: 25 },
      ]);
    });

    it('compound multiplier ×1.875 at #1 of 20 → ceil(110*1.875)', () => {
      const a = awardXp({
        position: 1,
        totalEntries: 20,
        contestMultiplier: 1.875,
        contestType: 'bear',
      });
      expect(a.total).toBe(Math.ceil((10 + 100) * 1.875));
    });

    it('breakdown rows sum exactly to total across many shapes', () => {
      for (const mul of [1, 1.5, 1.875, 2, 1.25]) {
        for (const N of [3, 6, 10, 20, 100]) {
          for (const pos of [1, 2, 3, 4, Math.floor(N / 2), N]) {
            const a = awardXp({ position: pos, totalEntries: N, contestMultiplier: mul });
            const sum = a.breakdown.reduce((s, r) => s + r.amount, 0);
            expect(sum).toBe(a.total);
          }
        }
      }
    });
  });
});
