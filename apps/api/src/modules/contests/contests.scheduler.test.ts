import { describe, expect, it } from 'vitest';
import {
  cellKey,
  effectiveXpMultiplier,
  LANE_CAPACITY,
  LANE_DURATION_MS,
  LANE_FILL_MS,
  LANE_XP_MULTIPLIER,
  MATRIX_CELLS,
} from '@fantasytoken/shared';

describe('contests v2 matrix', () => {
  it('every cell has unique key', () => {
    const seen = new Set<string>();
    for (const c of MATRIX_CELLS) {
      expect(seen.has(c.key), `duplicate cellKey: ${c.key}`).toBe(false);
      seen.add(c.key);
    }
  });

  it('cellKey() matches MATRIX_CELLS keys', () => {
    for (const c of MATRIX_CELLS) {
      const expected =
        c.key.split(':').length === 4
          ? cellKey(c.lane, c.stake, c.mode, c.key.split(':')[3])
          : cellKey(c.lane, c.stake, c.mode);
      expect(c.key).toBe(expected);
    }
  });

  it('every lane has cap, duration, fill, xp', () => {
    for (const c of MATRIX_CELLS) {
      expect(LANE_CAPACITY[c.lane]).toBeGreaterThan(0);
      expect(LANE_DURATION_MS[c.lane]).toBeGreaterThan(0);
      expect(LANE_FILL_MS[c.lane]).toBeGreaterThan(0);
      expect(LANE_XP_MULTIPLIER[c.lane]).toBeGreaterThan(0);
    }
  });

  it('Practice cell is pay-all + free + 0.5x XP', () => {
    const practice = MATRIX_CELLS.find((c) => c.name === 'Practice');
    expect(practice).toBeDefined();
    expect(practice?.payAll).toBe(true);
    expect(practice?.stake).toBe('free');
    expect(effectiveXpMultiplier(practice!)).toBe(0.5);
  });

  it('Marathon caps at 2.0× XP — anti grind for stake/duration whales', () => {
    const marathonCells = MATRIX_CELLS.filter((c) => c.lane === '7d');
    expect(marathonCells.length).toBeGreaterThan(0);
    for (const m of marathonCells) {
      expect(effectiveXpMultiplier(m)).toBeLessThanOrEqual(2.0);
      expect(m.weeklyMonday).toBe(true);
    }
  });

  it('every cell has a min_rank gate', () => {
    for (const c of MATRIX_CELLS) {
      expect(c.minRank).toBeGreaterThanOrEqual(1);
    }
  });

  it('R1 newcomer sees Practice + Quick + Bear Trap (3 cells minimum)', () => {
    const r1Cells = MATRIX_CELLS.filter((c) => c.minRank === 1);
    const names = r1Cells.map((c) => c.name);
    expect(names).toContain('Practice');
    expect(names).toContain('Quick Match');
    expect(names).toContain('Bear Trap');
  });
});
