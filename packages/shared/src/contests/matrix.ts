// Contest matrix v2 — single source of truth.
// See `docs/specs/contests-v2/DESIGN.md` for the full design.
//
// Each cell is a unique live-instance slot. INV-13: one live contest per
// `cellKey` at a time (UNIQUE INDEX on contests.matrix_cell_key WHERE status
// IN ('scheduled','active') enforces this at the DB layer).

export const DURATION_LANES = ['10m', '30m', '1h', '24h', '7d'] as const;
export type DurationLane = (typeof DURATION_LANES)[number];

export const STAKE_TIERS = ['free', 'c1', 'c5', 'c25', 'c100', 'c500'] as const;
export type StakeTier = (typeof STAKE_TIERS)[number];

export const CONTEST_MODES = ['bull', 'bear'] as const;
export type ContestMode = (typeof CONTEST_MODES)[number];

/** Lane → play-duration in milliseconds. */
export const LANE_DURATION_MS: Record<DurationLane, number> = {
  '10m': 10 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

/** Pre-kickoff "fill" window in ms. Long lanes get longer fill windows so
 * organic users have time to spot and join the event. */
export const LANE_FILL_MS: Record<DurationLane, number> = {
  '10m': 5 * 60 * 1000, // 5 min — keep current snappy cadence
  '30m': 10 * 60 * 1000, // 10 min
  '1h': 15 * 60 * 1000, // 15 min
  '24h': 60 * 60 * 1000, // 1h fill window
  '7d': 6 * 60 * 60 * 1000, // 6h fill window
};

/** Cap per lane (see DESIGN.md §1).
 * Pre-2026-05-01 caps were 20/30/50/100/500. With a 100-synth cohort
 * filling the lobby in seconds, real users couldn't get a seat in the
 * fast lanes. Bumped 5–10× so synths + real users coexist without
 * starving each other. Revisit with auto-replicate (multi-instance per
 * cell when ≥80% full) once cohort grows to 1000+. */
export const LANE_CAPACITY: Record<DurationLane, number> = {
  '10m': 200,
  '30m': 200,
  '1h': 300,
  '24h': 500,
  '7d': 1000,
};

/** Cancel-on-undersold floors. If a contest finishes the fill window with
 * fewer real entries than this, the scheduler refunds + skips. */
export const LANE_CANCEL_FLOOR: Record<DurationLane, number> = {
  '10m': 0, // bot-fill always brings to capacity
  '30m': 0,
  '1h': 0,
  '24h': 30, // need at least 30 organic for a daily
  '7d': 250, // half of cap = real Marathon
};

/** Stake tier → entry fee in coins. `free` = 0. */
export const STAKE_AMOUNT_COINS: Record<StakeTier, number> = {
  free: 0,
  c1: 1,
  c5: 5,
  c25: 25,
  c100: 100,
  c500: 500,
};

/** Display label for headers / pills. */
export const STAKE_LABEL: Record<StakeTier, string> = {
  free: 'Free',
  c1: '🪙 1',
  c5: '🪙 5',
  c25: '🪙 25',
  c100: '🪙 100',
  c500: '🪙 500',
};

/** XP multiplier per lane. Marathon caps at 2.0× — see DESIGN.md §7. */
export const LANE_XP_MULTIPLIER: Record<DurationLane, number> = {
  '10m': 1.0,
  '30m': 1.15,
  '1h': 1.3,
  '24h': 1.6,
  '7d': 2.0,
};

/** A single matrix cell — one live instance at a time. */
export interface MatrixCell {
  /** Stable identifier: `<lane>:<stake>:<mode>:<flavor?>`. Used as
   * UNIQUE constraint key on the contests row. */
  key: string;
  lane: DurationLane;
  stake: StakeTier;
  mode: ContestMode;
  /** Display name (cosmetic). */
  name: string;
  /** Rank gate: contest visible/joinable only when user.current_rank >= this. */
  minRank: number;
  /** Override XP multiplier (only used when ≠ lane default). Practice = 0.5
   * because risk-free, Lightning = 1.2 sprint-whale flavour. */
  xpMultiplier?: number;
  /** Pay-all curve override (Practice only). */
  payAll?: boolean;
  /** Optional: only schedule this cell on certain weekdays (Marathon = Mon). */
  weeklyMonday?: boolean;
  /** Optional: stagger offset within the lane's cadence so multiple cells of
   * the same lane don't kick off simultaneously. Expressed in seconds since
   * the lane's natural cycle anchor (see scheduler.ts). */
  staggerOffsetSec?: number;
}

/** Build the canonical matrix cell key. */
export function cellKey(
  lane: DurationLane,
  stake: StakeTier,
  mode: ContestMode,
  flavor?: string,
): string {
  return flavor ? `${lane}:${stake}:${mode}:${flavor}` : `${lane}:${stake}:${mode}`;
}

/** Full matrix — 19 cells. See DESIGN.md §1. */
export const MATRIX_CELLS: readonly MatrixCell[] = [
  // ─── 10m lane ───
  {
    key: cellKey('10m', 'free', 'bull', 'practice'),
    lane: '10m',
    stake: 'free',
    mode: 'bull',
    name: 'Practice',
    minRank: 1,
    // No XP penalty for the free contest. Earlier we ran 0.5× to discourage
    // grinding the free pool for XP, but the result-screen breakdown showed
    // a confusing "Multiplier ×0.5 → −5" row that read as a punishment to
    // newcomers. Lane default (1.0×) treats Practice as a real game.
    payAll: true,
    staggerOffsetSec: 0,
  },
  {
    key: cellKey('10m', 'c1', 'bull'),
    lane: '10m',
    stake: 'c1',
    mode: 'bull',
    name: 'Quick Match',
    minRank: 1,
    staggerOffsetSec: 100,
  },
  {
    key: cellKey('10m', 'c1', 'bear'),
    lane: '10m',
    stake: 'c1',
    mode: 'bear',
    name: 'Bear Trap',
    minRank: 1,
    staggerOffsetSec: 200,
  },
  {
    key: cellKey('10m', 'c5', 'bull'),
    lane: '10m',
    stake: 'c5',
    mode: 'bull',
    name: 'Memecoin Madness',
    minRank: 3,
    staggerOffsetSec: 300,
  },
  {
    key: cellKey('10m', 'c5', 'bear'),
    lane: '10m',
    stake: 'c5',
    mode: 'bear',
    name: 'Bear Cup',
    minRank: 3,
    staggerOffsetSec: 400,
  },
  {
    key: cellKey('10m', 'c500', 'bull', 'lightning'),
    lane: '10m',
    stake: 'c500',
    mode: 'bull',
    name: 'Lightning',
    minRank: 25,
    // Falls back to the 10m lane default (1.0×). Earlier 1.2× sprint-whale
    // boost was inconsistent with the rest of the matrix where stakes
    // don't tilt XP — duration does.
    staggerOffsetSec: 500,
  },

  // ─── 30m lane ───
  {
    key: cellKey('30m', 'c5', 'bull'),
    lane: '30m',
    stake: 'c5',
    mode: 'bull',
    name: '30m Bull',
    minRank: 5,
    staggerOffsetSec: 0,
  },
  {
    key: cellKey('30m', 'c5', 'bear'),
    lane: '30m',
    stake: 'c5',
    mode: 'bear',
    name: '30m Bear',
    minRank: 5,
    staggerOffsetSec: 450,
  },
  {
    key: cellKey('30m', 'c25', 'bull'),
    lane: '30m',
    stake: 'c25',
    mode: 'bull',
    name: '30m Bull · 🪙 25',
    minRank: 8,
    staggerOffsetSec: 225,
  },
  {
    key: cellKey('30m', 'c25', 'bear'),
    lane: '30m',
    stake: 'c25',
    mode: 'bear',
    name: '30m Bear · 🪙 25',
    minRank: 8,
    staggerOffsetSec: 675,
  },

  // ─── 1h lane ───
  {
    key: cellKey('1h', 'c25', 'bull'),
    lane: '1h',
    stake: 'c25',
    mode: 'bull',
    name: 'Trader Cup',
    minRank: 10,
    staggerOffsetSec: 0,
  },
  {
    key: cellKey('1h', 'c25', 'bear'),
    lane: '1h',
    stake: 'c25',
    mode: 'bear',
    name: 'Trader Cup Bear',
    minRank: 10,
    staggerOffsetSec: 900,
  },
  {
    key: cellKey('1h', 'c100', 'bull'),
    lane: '1h',
    stake: 'c100',
    mode: 'bull',
    name: 'Whale Hour',
    minRank: 13,
    staggerOffsetSec: 450,
  },
  {
    key: cellKey('1h', 'c100', 'bear'),
    lane: '1h',
    stake: 'c100',
    mode: 'bear',
    name: 'Whale Hour Bear',
    minRank: 13,
    staggerOffsetSec: 1350,
  },

  // ─── 24h lane ───
  {
    key: cellKey('24h', 'c25', 'bull'),
    lane: '24h',
    stake: 'c25',
    mode: 'bull',
    name: 'Daily Bull',
    minRank: 15,
    staggerOffsetSec: 0,
  },
  {
    key: cellKey('24h', 'c25', 'bear'),
    lane: '24h',
    stake: 'c25',
    mode: 'bear',
    name: 'Daily Bear',
    minRank: 15,
    staggerOffsetSec: 21_600, // +6h
  },
  {
    key: cellKey('24h', 'c100', 'bull'),
    lane: '24h',
    stake: 'c100',
    mode: 'bull',
    name: 'Daily Whale Bull',
    minRank: 18,
    staggerOffsetSec: 43_200, // +12h
  },
  {
    key: cellKey('24h', 'c100', 'bear'),
    lane: '24h',
    stake: 'c100',
    mode: 'bear',
    name: 'Daily Whale Bear',
    minRank: 18,
    staggerOffsetSec: 64_800, // +18h
  },
  {
    key: cellKey('24h', 'c500', 'bull', 'mythic'),
    lane: '24h',
    stake: 'c500',
    mode: 'bull',
    name: 'Mythic 24h',
    minRank: 25,
    staggerOffsetSec: 10_800, // +3h
  },

  // ─── 7d Marathon ───
  // Mode rotates week-by-week; scheduler picks based on ISO week parity.
  // We register both bull/bear cells but only one fires per week.
  {
    key: cellKey('7d', 'c100', 'bull', 'marathon'),
    lane: '7d',
    stake: 'c100',
    mode: 'bull',
    name: 'Marathon · Bull',
    minRank: 22,
    weeklyMonday: true,
  },
  {
    key: cellKey('7d', 'c100', 'bear', 'marathon'),
    lane: '7d',
    stake: 'c100',
    mode: 'bear',
    name: 'Marathon · Bear',
    minRank: 22,
    weeklyMonday: true,
  },
] as const;

export function getMatrixCell(key: string): MatrixCell | undefined {
  return MATRIX_CELLS.find((c) => c.key === key);
}

/** Effective XP multiplier for a cell — falls back to lane default. */
export function effectiveXpMultiplier(cell: MatrixCell): number {
  return cell.xpMultiplier ?? LANE_XP_MULTIPLIER[cell.lane];
}
