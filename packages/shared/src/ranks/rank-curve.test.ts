import { describe, expect, it } from 'vitest';
import {
  applySeasonReset,
  MAX_RANK,
  RANK_THRESHOLDS,
  rankFromXp,
  xpToNextRank,
} from './rank-curve.js';

describe('rankFromXp', () => {
  it('0 XP → Rank 1 · Newbie I', () => {
    const r = rankFromXp(0);
    expect(r.rank).toBe(1);
    expect(r.tier).toBe('Newbie');
    expect(r.tierRoman).toBe('I');
    expect(r.display).toBe('Newbie I');
  });

  it('exact threshold → next rank', () => {
    expect(rankFromXp(30).rank).toBe(2);
    expect(rankFromXp(150).rank).toBe(4);
    expect(rankFromXp(2000).rank).toBe(11);
    expect(rankFromXp(15000).rank).toBe(21);
  });

  it('one below threshold → previous rank', () => {
    expect(rankFromXp(29).rank).toBe(1);
    expect(rankFromXp(149).rank).toBe(3);
    expect(rankFromXp(64999).rank).toBe(29);
  });

  it('Mythic V (cap)', () => {
    const r = rankFromXp(65_000);
    expect(r.rank).toBe(MAX_RANK);
    expect(r.tier).toBe('Mythic');
    expect(r.tierRoman).toBe('V');
  });

  it('XP beyond max stays at Rank 30', () => {
    expect(rankFromXp(999_999).rank).toBe(30);
    expect(rankFromXp(Number.MAX_SAFE_INTEGER).rank).toBe(30);
  });

  it('negative or NaN → Rank 1', () => {
    expect(rankFromXp(-100).rank).toBe(1);
    expect(rankFromXp(Number.NaN).rank).toBe(1);
  });

  it('every rank has a unique threshold', () => {
    const set = new Set(RANK_THRESHOLDS);
    expect(set.size).toBe(RANK_THRESHOLDS.length);
  });

  it('thresholds are strictly increasing', () => {
    for (let i = 1; i < RANK_THRESHOLDS.length; i++) {
      expect(RANK_THRESHOLDS[i]!).toBeGreaterThan(RANK_THRESHOLDS[i - 1]!);
    }
  });
});

describe('xpToNextRank', () => {
  it('mid-rank progress', () => {
    // Rank 7 (Trader II) at 850. Next at 1150. xp=1000 → in-rank 150, remaining 150.
    const p = xpToNextRank(1000);
    expect(p.thresholdLow).toBe(850);
    expect(p.thresholdHigh).toBe(1150);
    expect(p.xpInRank).toBe(150);
    expect(p.xpForRank).toBe(300);
    expect(p.remainingToNext).toBe(150);
    expect(p.atMax).toBe(false);
  });

  it('at MAX_RANK marks atMax true and remaining 0', () => {
    const p = xpToNextRank(70_000);
    expect(p.atMax).toBe(true);
    expect(p.remainingToNext).toBe(0);
    expect(p.xpForRank).toBe(1); // sentinel non-zero so UI ratio doesn't NaN
  });

  it('exactly on threshold → in-rank 0, full remaining', () => {
    const p = xpToNextRank(400);
    expect(p.thresholdLow).toBe(400);
    expect(p.xpInRank).toBe(0);
  });
});

describe('applySeasonReset', () => {
  it('drops 5 ranks', () => {
    expect(applySeasonReset(20)).toBe(15);
    expect(applySeasonReset(7)).toBe(5);
    expect(applySeasonReset(30)).toBe(25);
  });

  it('caps at Rank 5 minimum', () => {
    expect(applySeasonReset(3)).toBe(5);
    expect(applySeasonReset(1)).toBe(5);
    expect(applySeasonReset(5)).toBe(5);
  });
});
