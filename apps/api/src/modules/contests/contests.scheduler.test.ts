import { describe, expect, it } from 'vitest';
import {
  cellKey,
  effectiveCapacity,
  effectiveXpMultiplier,
  LANE_CAPACITY,
  LANE_DURATION_MS,
  LANE_FILL_MS,
  LANE_XP_MULTIPLIER,
  MATRIX_CELLS,
} from '@fantasytoken/shared';
import { shouldReplicateNow } from './contests.scheduler.js';

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

  it('Practice cell is pay-all + free; XP follows lane default (1.0×)', () => {
    const practice = MATRIX_CELLS.find((c) => c.name === 'Practice');
    expect(practice).toBeDefined();
    expect(practice?.payAll).toBe(true);
    expect(practice?.stake).toBe('free');
    // No per-cell XP penalty (the old 0.5× created a confusing
    // "Multiplier ×0.5 → −5" breakdown row for newbies). Lane default
    // 10m=1.0× applies.
    expect(effectiveXpMultiplier(practice!)).toBe(1.0);
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

describe('scheduler.shouldReplicateNow (ADR-0009)', () => {
  // Use Quick Match c1 — a short-lane cell with sane capacity for tests.
  const cell = MATRIX_CELLS.find((c) => c.name === 'Quick Match' && c.mode === 'bull')!;
  const cap = effectiveCapacity(cell);
  const now = new Date('2026-05-01T12:00:00Z');
  const olderThanGap = new Date(now.getTime() - 90_000); // 90s ago, > 60s gap

  it('does not replicate when siblings are below the fill threshold', () => {
    const siblings = [{ id: 'a', createdAt: olderThanGap, realFilled: Math.floor(cap * 0.5) }];
    expect(shouldReplicateNow({ cell, siblings, at: now })).toBe(false);
  });

  it('replicates when the only sibling is ≥90% full and aged past the gap', () => {
    const siblings = [{ id: 'a', createdAt: olderThanGap, realFilled: Math.ceil(cap * 0.9) }];
    expect(shouldReplicateNow({ cell, siblings, at: now })).toBe(true);
  });

  it('does NOT replicate when youngest sibling is fresher than the min gap', () => {
    const fresh = new Date(now.getTime() - 30_000); // 30s ago, < 60s gap
    const siblings = [
      { id: 'a', createdAt: olderThanGap, realFilled: cap },
      { id: 'b', createdAt: fresh, realFilled: 0 },
    ];
    expect(shouldReplicateNow({ cell, siblings, at: now })).toBe(false);
  });

  it('does NOT replicate when ANY sibling has remaining capacity', () => {
    const siblings = [
      { id: 'a', createdAt: olderThanGap, realFilled: cap },
      { id: 'b', createdAt: olderThanGap, realFilled: Math.floor(cap * 0.5) },
    ];
    expect(shouldReplicateNow({ cell, siblings, at: now })).toBe(false);
  });

  it('returns false on empty sibling list (cold-spawn pass handles that)', () => {
    expect(shouldReplicateNow({ cell, siblings: [], at: now })).toBe(false);
  });
});
