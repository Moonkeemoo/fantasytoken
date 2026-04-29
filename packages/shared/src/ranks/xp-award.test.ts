import { describe, expect, it } from 'vitest';
import { awardXp } from './xp-award.js';

describe('awardXp', () => {
  it('Quick Match, finished #15 of 20 → 10 XP (participation only, below top 30%)', () => {
    const a = awardXp({
      position: 15,
      totalRealUsers: 20,
      contestMultiplier: 1.0,
      contestType: 'bull',
    });
    expect(a.total).toBe(10);
    expect(a.participation).toBe(10);
    expect(a.position).toBe(0);
    expect(a.breakdown).toEqual([{ reason: 'Participation', amount: 10 }]);
  });

  it('Quick Match, finished #5 of 20 → 35 XP (participation + #4-5 bonus)', () => {
    const a = awardXp({
      position: 5,
      totalRealUsers: 20,
      contestMultiplier: 1.0,
      contestType: 'bull',
    });
    expect(a.total).toBe(35);
    expect(a.position).toBe(25);
  });

  it('Quick Match, finished #1 of 20 → 110 XP', () => {
    const a = awardXp({
      position: 1,
      totalRealUsers: 20,
      contestMultiplier: 1.0,
      contestType: 'bull',
    });
    expect(a.total).toBe(110);
    expect(a.position).toBe(100);
  });

  it('Bear Trap, finished #3 of 20 → 75 XP (10 + 40) × 1.5', () => {
    const a = awardXp({
      position: 3,
      totalRealUsers: 20,
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

  it('Bear Apocalypse Degen-tier (×1.875), #1 of 20 → ceil((10+100)*1.875) = 207', () => {
    // Spec §2.3 multipliers compound: bear 1.5 × degen 1.25 = 1.875
    const a = awardXp({
      position: 1,
      totalRealUsers: 20,
      contestMultiplier: 1.875,
      contestType: 'bear',
    });
    expect(a.total).toBe(Math.ceil((10 + 100) * 1.875));
  });

  it('Whale Vault, #2 of 20 → ceil((10+60)*1.5) = 105', () => {
    const a = awardXp({
      position: 2,
      totalRealUsers: 20,
      contestMultiplier: 1.5,
      contestType: 'bull',
    });
    expect(a.total).toBe(105);
  });

  it('breakdown rows sum exactly to total (small rounding handled by multiplier delta)', () => {
    for (const mul of [1, 1.5, 1.875, 2, 1.25]) {
      for (const pos of [1, 2, 3, 4, 7, 12]) {
        const a = awardXp({
          position: pos,
          totalRealUsers: 30,
          contestMultiplier: mul,
        });
        const sum = a.breakdown.reduce((s, r) => s + r.amount, 0);
        expect(sum).toBe(a.total);
      }
    }
  });

  it('top 30% but below #10 → +5 position bonus', () => {
    // 100 users, top 30 = 30. Position 11..30 → +5
    const a = awardXp({
      position: 25,
      totalRealUsers: 100,
      contestMultiplier: 1.0,
    });
    expect(a.position).toBe(5);
    expect(a.total).toBe(15);
  });

  it('exactly outside top 30% → 0 position bonus', () => {
    // 10 users → top30 = 3 → position 4 outside (after the 4-5 bracket which is +25)
    // Actually our table: #4-5 → +25 unconditionally. Below the table, top-30 boost only kicks in for #11+.
    // So with 10 users: #6-10 → +15 (table), no top-30 fallback needed.
    // Pick a case where we drop out entirely: 10 users, position 11 doesn't exist. Test position=15 of 50 (top30=15) → +5; position 16 → 0.
    expect(awardXp({ position: 15, totalRealUsers: 50, contestMultiplier: 1 }).position).toBe(5);
    expect(awardXp({ position: 16, totalRealUsers: 50, contestMultiplier: 1 }).position).toBe(0);
  });
});
